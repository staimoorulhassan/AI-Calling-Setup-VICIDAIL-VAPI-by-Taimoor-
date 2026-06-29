/**
 * index.js
 * VAPI Speech-to-Speech streaming WebSocket server.
 * Bridges AVR Core audio to VAPI, with ViciDial 3-way transfer support.
 *
 * ViciDial 3-way flow:
 *  1. VAPI calls transferCall({"phoneNumber":"...", "message":"..."}) tool
 *  2. Looks up active ViciDial session via non_agent_api agent_status
 *  3. Calls ViciDial agc/api.php?action=conf_newcall to dial verifier
 *  4. VAPI speaks the result message, then its leg closes
 *  5. ViciDial bridges lead + verifier and continues
 */

const WebSocket = require('ws');
const axios = require('axios');
const https = require('https');
const { create } = require('@alexanderolsen/libsamplerate-js');

require('dotenv').config();

// ViciDial commonly sits behind a self-signed cert and 301-redirects HTTP→HTTPS.
// This agent lets our API calls follow that redirect without failing TLS validation
// against an IP-only cert. Scope: ViciDial calls on the operator's own server only.
const vicidialHttpsAgent = new https.Agent({ rejectUnauthorized: false });
const vicidialAxios = axios.create({
  httpsAgent: vicidialHttpsAgent,
  maxRedirects: 5,
});

const PORT = process.env.PORT || 6042;
const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;

// ViciDial (optional -- 3-way only works when these are set)
const VICIDIAL_URL = process.env.VICIDIAL_URL || '';
const VICIDIAL_USER = process.env.VICIDIAL_USER || 'admin';
const VICIDIAL_PASS = process.env.VICIDIAL_PASS || '';
const VICIDIAL_AGENT_USER = process.env.VICIDIAL_AGENT_USER || '';
const VICIDIAL_AGENT_PASS = process.env.VICIDIAL_AGENT_PASS || '';
// Fallback disposition for any connected call that ends without a more specific
// outcome (AMD/IVR/XFER/SALE/…). Mandatory-disposition policy: no call is left NEW.
const VICIDIAL_DEFAULT_DISPO = process.env.VICIDIAL_DEFAULT_DISPO || 'DROP';

// avr-ami bridge -- used to drop the AI's Asterisk leg after a successful
// 3-way transfer, so the AI exits the conference and leaves lead+verifier bridged.
const AVR_AMI_URL = process.env.AVR_AMI_URL || 'http://avr-ami:6006';

// How long (ms) to let VAPI speak its handoff message to lead+verifier before
// the AI's leg is dropped from the conference.
const TRANSFER_CONFIRM_DELAY_MS = parseInt(process.env.TRANSFER_CONFIRM_DELAY_MS || '8000', 10);

// AMD sensitivity (FR-21): disabled | conservative | normal | aggressive
const VALID_AMD_VALUES = ['disabled', 'conservative', 'normal', 'aggressive'];
const AMD_SENSITIVITY = VALID_AMD_VALUES.includes(process.env.AMD_SENSITIVITY)
  ? process.env.AMD_SENSITIVITY
  : 'conservative';

// IVR keyword detection (Constitution Principle III, FR-5, plan.md AD-3, T107)
const IVR_KEYWORDS = [
  // English — DTMF prompts
  'press 1', 'press 2', 'press 3', 'press 4', 'press 5',
  // English — language/navigation
  'para español', 'dial 0 for', 'enter your', 'if you know',
  // English — hold/queue
  'your call is important', 'all agents are busy', 'please hold',
  // English — menu announcements
  'our menu has changed', 'listen carefully', 'to repeat',
  // English — additional (T107)
  'we are experiencing', 'call may be recorded', 'estimated wait time',
  // French (T107)
  'appuyez sur 1', 'notre menu a changé', 'veuillez patienter',
  // German (T107)
  'drücken sie 1', 'bitte warten',
  // Portuguese (T107)
  'pressione 1', 'para continuar',
];
function detectIvr(text) {
  const lower = text.toLowerCase();
  return IVR_KEYWORDS.some((kw) => lower.includes(kw));
}

// AMD (Answering Machine Detection) via transcript analysis
// Only UNAMBIGUOUS machine/voicemail phrases — a live human won't say these.
// (Human-ambiguous openers like "thank you for calling" / "is not available" were
// removed: a receptionist or person can say them, causing false AMD cutoffs.)
const AMD_KEYWORDS = [
  // Voicemail "leave a message" family
  'leave a message', 'leave your message', 'after the tone', 'after the beep',
  'at the tone', 'at the sound of the tone', 'record your message',
  'please leave a message', 'please record your message', 'wait for the beep',
  'please leave your name', 'leave your name and number',
  // Voicemail system identifiers
  'voice mail', 'voicemail', 'voice messaging system', 'automated voice messaging',
  'has been forwarded to an automated', 'your call has been forwarded to voicemail',
  // Carrier machine messages
  'the person you are trying to reach', 'the number you have dialed',
  'the subscriber you are trying to reach', 'is not in service',
  'no longer in service', 'has been disconnected',
  // Spanish
  'deje su mensaje', 'después del tono', 'buzón de voz',
  // German
  'bitte hinterlassen sie', 'nach dem signalton',
];
function detectAmd(text) {
  const lower = text.toLowerCase();
  return AMD_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── ACS backend signalling (human/amd/ivr/end → realtime green light) ──
const ACS_SIGNAL_URL = process.env.ACS_SIGNAL_URL || 'http://avr-app-backend:3001/api/v1/internal/call-signal';
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN || '';
// How long after answer we keep aggressively screening for machine/IVR phrases.
const AMD_SCREEN_WINDOW_MS = parseInt(process.env.AMD_SCREEN_WINDOW_MS || '9000', 10);

async function postCallSignal(sig) {
  if (!ACS_SIGNAL_URL) return;
  try {
    await axios.post(ACS_SIGNAL_URL, sig, {
      headers: INTERNAL_API_TOKEN ? { 'x-internal-token': INTERNAL_API_TOKEN } : {},
      timeout: 4000,
    });
  } catch (e) { /* best-effort; realtime light will simply stay red */ }
}

// Parses custom UUIDs structured as LLLLLLLL-PPPP-PPPP-PPPP-R... containing hex lead_id and phone_number
function parseCustomUuid(uuid) {
  if (!uuid) return null;
  const parts = uuid.split('-');
  if (parts.length !== 5) return null;
  if (parts[0].length !== 8 || parts[1].length !== 4 || parts[2].length !== 4 || parts[3].length !== 4 || parts[4].length !== 12) {
    return null;
  }
  const isHex = (str) => /^[0-9a-fA-F]+$/.test(str);
  if (!parts.every(isHex)) return null;

  try {
    const leadId = parseInt(parts[0], 16);
    const phoneHex = parts[1] + parts[2] + parts[3];
    const phoneNumber = parseInt(phoneHex, 16);
    
    return {
      leadId: leadId > 0 ? leadId : null,
      phoneNumber: phoneNumber > 0 ? String(phoneNumber) : null
    };
  } catch (e) {
    return null;
  }
}

// Notify ViciDial of call completion via non-agent API (best-effort)
// Prefers lead_id over phone_number when available (reference: jose456891/vicidial-ai-agent)
let dispoCredsWarned = false;
async function notifyVicidialCallEnd(phoneNumber, status, leadId) {
  if (!VICIDIAL_URL || !VICIDIAL_USER || !VICIDIAL_PASS) {
    // Root cause of "dispositions never written": creds missing → ViciDial rejects
    // update_lead. Warn once so this is never a silent no-op again.
    if (!dispoCredsWarned) {
      dispoCredsWarned = true;
      console.warn('[avr-sts-vapi] DISPOSITION DISABLED: set VICIDIAL_URL, VICIDIAL_USER, ' +
        'VICIDIAL_PASS (API user with vdc_agent_api_access=1, modify_leads, user_level>7). ' +
        'Lead status will stay NEW until configured.');
    }
    return;
  }
  const params = {
    source: 'avr',
    user: VICIDIAL_USER,
    pass: VICIDIAL_PASS,
    function: 'update_lead',
    status: status,
    called_since_last_reset: 'Y',
  };
  if (leadId) {
    params.lead_id = leadId;
  } else if (phoneNumber) {
    params.phone_number = phoneNumber;
  } else {
    return; // nothing to identify the lead
  }
  try {
    await vicidialAxios.get(VICIDIAL_URL + '/vicidial/non_agent_api.php', { params, timeout: 5000 });
    const identifier = leadId ? ('lead_id=' + leadId) : ('phone=' + phoneNumber);
    console.log('[avr-sts-vapi] ViciDial lead updated: ' + identifier + ' -> ' + status);
  } catch (e) {
    console.warn('[avr-sts-vapi] ViciDial update failed: ' + e.message);
  }
}

const AVR_SAMPLE_RATE = 8000;
const VAPI_SAMPLE_RATE = 16000;
const FRAME_SAMPLES_8K = 160;

let globalUpsampler = null;
let globalDownsampler = null;

const initResamplers = async () => {
  globalUpsampler = await create(1, AVR_SAMPLE_RATE, VAPI_SAMPLE_RATE);
  globalDownsampler = await create(1, VAPI_SAMPLE_RATE, AVR_SAMPLE_RATE);
  console.log('[avr-sts-vapi] Resamplers ready (8 kHz <-> 16 kHz)');
};

function upsample8to16(buf) {
  const samples = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
  return Buffer.from(Int16Array.from(globalUpsampler.full(samples)).buffer);
}

function downsample16to8(buf) {
  const samples = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
  return Buffer.from(Int16Array.from(globalDownsampler.full(samples)).buffer);
}

async function getVicidialSession() {
  if (!VICIDIAL_URL || !VICIDIAL_AGENT_USER) {
    throw new Error('VICIDIAL_URL and VICIDIAL_AGENT_USER must be set');
  }
  const resp = await vicidialAxios.get(`${VICIDIAL_URL}/vicidial/non_agent_api.php`, {
    params: {
      source: 'avr',
      user: VICIDIAL_USER,
      pass: VICIDIAL_PASS,
      function: 'agent_status',
      agent_user: VICIDIAL_AGENT_USER,
      format: 'json',
    },
    timeout: 10000,
  });
  const data = resp.data;
  console.log('[avr-sts-vapi] ViciDial agent_status:', JSON.stringify(data));
  const sessionId = data && (data.session_id || (Array.isArray(data) && data[0] && data[0].session_id));
  if (!sessionId) throw new Error('No active session for ViciDial agent ' + VICIDIAL_AGENT_USER);
  return sessionId;
}

async function vicidialConferenceCall(sessionId, phoneNumber) {
  const resp = await vicidialAxios.get(`${VICIDIAL_URL}/vicidial/agc/api.php`, {
    params: {
      action: 'conf_newcall',
      user: VICIDIAL_AGENT_USER,
      pass: VICIDIAL_AGENT_PASS,
      session_id: sessionId,
      phone_number: phoneNumber,
      phone_code: '1',
    },
    timeout: 15000,
  });
  console.log('[avr-sts-vapi] ViciDial conf_newcall: ' + resp.data);
  return resp.data;
}

/**
 * Ask avr-ami to hang up the Asterisk channel for this AVR session (the AI's leg),
 * leaving the ViciDial conference bridge (lead + verifier) intact.
 */
async function hangupAvrChannel(uuid) {
  try {
    await axios.post(`${AVR_AMI_URL}/hangup`, { uuid }, { timeout: 8000 });
    console.log('[avr-sts-vapi] AI leg hung up via avr-ami (uuid ' + uuid + ')');
  } catch (err) {
    console.error('[avr-sts-vapi] avr-ami hangup failed (uuid ' + uuid + '): ' + err.message);
  }
}

// Map free-form AI disposition words to ViciDial status codes.
const DISPOSITION_ALIASES = {
  sale: 'SALE', interested: 'SALE', sold: 'SALE',
  callback: 'CALLBK', 'call back': 'CALLBK', 'call later': 'CALLBK',
  'not interested': 'NI', notinterested: 'NI', decline: 'NI', declined: 'NI',
  'do not call': 'DNC', dnc: 'DNC', 'remove me': 'DNC',
  'wrong number': 'WR', wrong: 'WR',
  'no answer': 'NA', voicemail: 'AMD', machine: 'AMD', ivr: 'IVR',
  busy: 'B', hangup: 'DROP', dropped: 'DROP', human: 'XFER', transferred: 'XFER',
};
function normalizeDisposition(raw) {
  if (!raw) return null;
  const k = String(raw).trim().toLowerCase();
  if (DISPOSITION_ALIASES[k]) return DISPOSITION_ALIASES[k];
  const up = k.toUpperCase();
  const VALID = ['AMD','IVR','WR','NA','NI','DNC','DROP','SALE','CALLBK','B','XFER','A','HUMAN'];
  return VALID.includes(up) ? up : null;
}

async function handleToolCall(toolCall, ctx) {
  const sessionId = ctx && ctx.sessionId;
  const name = toolCall && toolCall.function && toolCall.function.name;
  let args = {};
  try { args = JSON.parse((toolCall && toolCall.function && toolCall.function.arguments) || '{}'); } catch (e) {}

  console.log('[avr-sts-vapi] Tool: ' + name + ' args=' + JSON.stringify(args) + ' session=' + sessionId);

  if (name === 'transferCall') {
    const phoneNumber = args.phoneNumber || args.phone_number || '';
    const message = args.message || 'Connecting you with a specialist now. Please hold.';
    if (!phoneNumber) return 'Transfer failed: no phone number provided.';
    try {
      const vdSession = await getVicidialSession();
      await vicidialConferenceCall(vdSession, phoneNumber);
      console.log('[avr-sts-vapi] 3-way transfer -> ' + phoneNumber + ' (session ' + sessionId + ')');

      // Reaching a human verifier means the lead was a live human → disposition XFER.
      notifyVicidialCallEnd(ctx && ctx.phone, 'XFER', ctx && ctx.leadId);

      // Let VAPI speak `message` to confirm the verifier with the customer,
      // then drop the AI's leg so customer + verifier are left talking
      // directly. ViciDial keeps the original lead channel up.
      setTimeout(() => { hangupAvrChannel(sessionId); }, TRANSFER_CONFIRM_DELAY_MS);

      return message;
    } catch (err) {
      console.error('[avr-sts-vapi] Transfer failed: ' + err.message);
      return "I'm having trouble connecting right now. Please try again.";
    }
  }

  // The AI can disposition the call from the conversation (NI, callback, sale…).
  if (name === 'setDisposition' || name === 'set_disposition' || name === 'disposition') {
    const status = normalizeDisposition(args.status || args.disposition || args.value);
    if (!status) return 'Disposition not recognized.';
    notifyVicidialCallEnd(ctx && ctx.phone, status, ctx && ctx.leadId);
    console.log('[avr-sts-vapi] AI set disposition ' + status + ' (session ' + sessionId + ')');
    return 'Disposition recorded: ' + status;
  }

  console.warn('[avr-sts-vapi] Unknown tool: ' + name);
  return 'Tool "' + name + '" is not supported.';
}

const startServer = () => {
  const wss = new WebSocket.Server({ port: PORT });
  console.log('[avr-sts-vapi] Listening on port ' + PORT);

  wss.on('connection', (avrSocket) => {
    let vapiSocket = null;
    let sessionId = null;
    let transferInProgress = false;
    let audioBuffer8k = [];
    let callPhoneNumber = null;  // captured from init or first transcript
    let callLeadId = null;       // captured from init — preferred key for ViciDial update_lead
    let amdDetected = false;
    // Human-gating: VAPI audio is withheld from the caller until a real human is
    // confirmed, so the AI never speaks to (or over) a machine/IVR.
    let humanConfirmed = false;
    let callStartTs = 0;
    let pendingVapiAudio = [];   // VAPI→caller audio buffered until human confirmed
    let signalEnded = false;
    let dispositionSent = false;   // AI explicitly dispositioned via setDisposition tool
    let finalDispoWritten = false; // ANY terminal status sent to ViciDial (AMD/IVR/XFER/AI dispo/DROP)

    // Mandatory-disposition policy: every connected call must end with a ViciDial
    // status. Routes a specific status if given, otherwise the configured default
    // (DROP). Idempotent — only the first terminal write per session takes effect.
    const markDisposition = (status) => {
      if (finalDispoWritten) return;
      finalDispoWritten = true;
      notifyVicidialCallEnd(callPhoneNumber, status, callLeadId);
    };

    const cleanup = () => {
      if (vapiSocket && vapiSocket.readyState === WebSocket.OPEN) vapiSocket.close();
      vapiSocket = null;
      audioBuffer8k = [];
      pendingVapiAudio = [];
      if (!signalEnded) {
        signalEnded = true;
        // Safety net for EVERY end path (VAPI close, AVR close, error, or a hang
        // report with no prior outcome): never leave the lead NEW. AMD/IVR/XFER/AI
        // dispo already called markDisposition, so this is a no-op for them.
        if (callPhoneNumber || callLeadId) markDisposition(VICIDIAL_DEFAULT_DISPO);
        postCallSignal({ leadId: callLeadId, phone: callPhoneNumber, sessionId, event: 'end' });
      }
    };

    // Confirm a live human: open the audio gate, flush buffered AI audio, light green.
    const confirmHuman = () => {
      if (humanConfirmed) return;
      humanConfirmed = true;
      console.log('[avr-sts-vapi] HUMAN confirmed (' + sessionId + ')');
      postCallSignal({ leadId: callLeadId, phone: callPhoneNumber, sessionId, event: 'human' });
      const buffered = pendingVapiAudio;
      pendingVapiAudio = [];
      for (const b of buffered) frameAndSendToAVR(b);
    };

    const frameAndSendToAVR = (pcm16kBuf) => {
      const buf8k = downsample16to8(pcm16kBuf);
      const samples = Array.from(new Int16Array(buf8k.buffer, buf8k.byteOffset, buf8k.length / 2));
      audioBuffer8k = audioBuffer8k.concat(samples);
      while (audioBuffer8k.length >= FRAME_SAMPLES_8K) {
        const frame = audioBuffer8k.slice(0, FRAME_SAMPLES_8K);
        audioBuffer8k = audioBuffer8k.slice(FRAME_SAMPLES_8K);
        avrSocket.send(JSON.stringify({
          type: 'audio',
          audio: Buffer.from(Int16Array.from(frame).buffer).toString('base64'),
        }));
      }
    };

    const sendAudioToAVR = (pcm16kBuf) => {
      // Withhold AI audio from the caller until human is confirmed (Constitution III,
      // FR-4): a machine/IVR must never hear the AI. Buffer up to ~3 s so the AI's
      // first words to a real human aren't clipped when the gate opens.
      if (!humanConfirmed) {
        pendingVapiAudio.push(pcm16kBuf);
        if (pendingVapiAudio.length > 300) pendingVapiAudio.shift();
        return;
      }
      frameAndSendToAVR(pcm16kBuf);
    };

    avrSocket.on('message', async (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch (e) { return; }

      if (msg.type === 'init') {
        sessionId = msg.uuid;
        callStartTs = Date.now();
        console.log('[avr-sts-vapi] Init message received:', JSON.stringify(msg));
        // Capture phone number and lead_id if avr-core provides them (for ViciDial call-end logging)
        if (msg.phone_number) callPhoneNumber = String(msg.phone_number);
        if (msg.lead_id)      callLeadId = String(msg.lead_id);
        
        // Try parsing custom UUID mapping (e.g. from modified Asterisk dialplan AGI)
        const parsed = parseCustomUuid(sessionId);
        if (parsed) {
          if (parsed.leadId)      callLeadId = String(parsed.leadId);
          if (parsed.phoneNumber) callPhoneNumber = String(parsed.phoneNumber);
          console.log('[avr-sts-vapi] Extracted from custom UUID:', JSON.stringify(parsed));
        }
        
        console.log('[avr-sts-vapi] Init session ' + sessionId + (callPhoneNumber ? ' phone=' + callPhoneNumber : '') + (callLeadId ? ' lead_id=' + callLeadId : ''));
        try {
          const resp = await axios.post(
            'https://api.vapi.ai/call',
            {
              type: 'inboundPhoneCall',
              assistantId: VAPI_ASSISTANT_ID,
              // Make the AI wait for the called party to speak first. This is what
              // lets us screen the opening words for machine/IVR BEFORE the AI talks.
              assistantOverrides: { firstMessageMode: 'assistant-waits-for-user' },
              transport: { provider: 'vapi.websocket' },
            },
            {
              headers: { Authorization: 'Bearer ' + VAPI_PRIVATE_KEY, 'Content-Type': 'application/json' },
              timeout: 30000,
            }
          );
          const wsCallUrl = resp.data && resp.data.transport && resp.data.transport.websocketCallUrl;
          if (!wsCallUrl) {
            avrSocket.send(JSON.stringify({ type: 'error', message: 'VAPI did not return a WebSocket URL' }));
            avrSocket.close();
            return;
          }
          vapiSocket = new WebSocket(wsCallUrl);

          vapiSocket.on('open', () => console.log('[avr-sts-vapi] VAPI connected (' + sessionId + ')'));

          vapiSocket.on('message', async (raw, isBinary) => {
            if (isBinary) {
              sendAudioToAVR(Buffer.isBuffer(raw) ? raw : Buffer.from(raw));
              return;
            }
            let ctrl;
            try { ctrl = JSON.parse(raw.toString()); } catch (e) { return; }

            if (ctrl.type === 'transcript') {
              if (ctrl.transcriptType === 'final') {
                const role = ctrl.role === 'assistant' ? 'agent' : 'user';
                const text = ctrl.transcript || '';
                // Aggressive screening: examine EVERY caller utterance during the
                // screening window (not just the first), so late machine lines like
                // "…please leave a message after the beep" are still caught. After a
                // human is confirmed and the window passes, screening stops.
                const screening = !humanConfirmed || (Date.now() - callStartTs) < AMD_SCREEN_WINDOW_MS;
                if (role === 'user' && screening) {
                  if (detectAmd(text)) {
                    amdDetected = true;
                    console.log('[avr-sts-vapi] AMD detected (' + sessionId + '): ' + text);
                    postCallSignal({ leadId: callLeadId, phone: callPhoneNumber, sessionId, event: 'amd', status: 'AMD' });
                    await hangupAvrChannel(sessionId);
                    markDisposition('AMD');
                    axios.post(
                      AVR_AMI_URL + '/event',
                      { uuid: sessionId, type: 'amd_hangup', timestamp: new Date().toISOString() },
                      { timeout: 5000 }
                    ).catch((e) => console.warn('[avr-sts-vapi] /event post failed: ' + e.message));
                    cleanup();
                    if (avrSocket.readyState === WebSocket.OPEN) avrSocket.close();
                    return;
                  }
                  if (detectIvr(text)) {
                    console.log('[avr-sts-vapi] IVR detected (' + sessionId + '): ' + text);
                    postCallSignal({ leadId: callLeadId, phone: callPhoneNumber, sessionId, event: 'ivr', status: 'IVR' });
                    await hangupAvrChannel(sessionId);
                    markDisposition('IVR');
                    axios.post(
                      AVR_AMI_URL + '/event',
                      { uuid: sessionId, type: 'ivr_hangup', timestamp: new Date().toISOString() },
                      { timeout: 5000 }
                    ).catch((e) => console.warn('[avr-sts-vapi] /event post failed: ' + e.message));
                    cleanup();
                    if (avrSocket.readyState === WebSocket.OPEN) avrSocket.close();
                    return;
                  }
                  // A caller utterance that isn't machine/IVR → real human. Open the gate.
                  if (role === 'user' && !humanConfirmed) confirmHuman();
                }
                avrSocket.send(JSON.stringify({ type: 'transcript', role: role, text: text }));
                console.log('[avr-sts-vapi] [' + role + '] ' + text);
              }
            } else if (ctrl.type === 'speech-update') {
              if (ctrl.role === 'user' && ctrl.status === 'started') {
                avrSocket.send(JSON.stringify({ type: 'interruption' }));
              }
            } else if (ctrl.type === 'tool-calls') {
              if (ctrl.toolCalls && ctrl.toolCalls.length) {
                for (const tc of ctrl.toolCalls) {
                  const result = await handleToolCall(tc, { sessionId, phone: callPhoneNumber, leadId: callLeadId });
                  if (vapiSocket && vapiSocket.readyState === WebSocket.OPEN) {
                    vapiSocket.send(JSON.stringify({ type: 'tool-call-result', toolCallId: tc.id, result: result }));
                  }
                  const tcName = tc && tc.function && tc.function.name;
                  if (tcName === 'transferCall' &&
                      !result.toLowerCase().startsWith('transfer failed') &&
                      !result.toLowerCase().startsWith("i'm having trouble")) {
                    transferInProgress = true;
                    // handleToolCall already wrote XFER; mark so cleanup won't override with DROP.
                    finalDispoWritten = true;
                  }
                  if ((tcName === 'setDisposition' || tcName === 'set_disposition' || tcName === 'disposition') &&
                      result.startsWith('Disposition recorded')) {
                    dispositionSent = true;
                    // handleToolCall already wrote the AI's status; mark so cleanup won't override.
                    finalDispoWritten = true;
                  }
                }
              }
            } else if (ctrl.type === 'hang' || ctrl.type === 'call-end-report') {
              console.log('[avr-sts-vapi] Call ended (' + sessionId + ') transfer=' + transferInProgress + ' amd=' + amdDetected + ' dispo=' + dispositionSent);
              // Mandatory disposition is enforced in cleanup(): AMD/IVR/XFER/AI-dispo
              // already wrote a status; any other end (incl. a bare hang) falls back to
              // VICIDIAL_DEFAULT_DISPO. The backend sweeper remains the final safety net.
              cleanup();
              if (avrSocket.readyState === WebSocket.OPEN) avrSocket.close();
            } else if (ctrl.type !== 'metadata' && ctrl.type !== 'status-update' && ctrl.type !== 'conversation-update') {
              console.log('[avr-sts-vapi] VAPI: ' + ctrl.type);
            }
          });

          vapiSocket.on('error', (err) => console.error('[avr-sts-vapi] VAPI error (' + sessionId + '): ' + err.message));
          vapiSocket.on('close', (code) => { console.log('[avr-sts-vapi] VAPI closed ' + code + ' (' + sessionId + ')'); cleanup(); });

        } catch (err) {
          const detail = (err.response && err.response.data && err.response.data.message) || err.message;
          console.error('[avr-sts-vapi] Call creation failed: ' + detail);
          avrSocket.send(JSON.stringify({ type: 'error', message: 'VAPI call creation failed: ' + detail }));
          avrSocket.close();
        }

      } else if (msg.type === 'audio') {
        if (!vapiSocket || vapiSocket.readyState !== WebSocket.OPEN) return;
        vapiSocket.send(upsample8to16(Buffer.from(msg.audio, 'base64')));
      }
    });

    avrSocket.on('error', (err) => { console.error('[avr-sts-vapi] AVR error (' + sessionId + '): ' + err.message); cleanup(); });
    avrSocket.on('close', () => { console.log('[avr-sts-vapi] AVR closed (' + sessionId + ')'); cleanup(); });
  });
};

async function applyVicidialAmdSensitivity() {
  if (!VICIDIAL_URL || !VICIDIAL_USER || !VICIDIAL_PASS) return;
  console.log('[avr-sts-vapi] AMD sensitivity: ' + AMD_SENSITIVITY);
  try {
    const resp = await vicidialAxios.get(`${VICIDIAL_URL}/vicidial/non_agent_api.php`, {
      params: {
        source: 'avr',
        user: VICIDIAL_USER,
        pass: VICIDIAL_PASS,
        function: 'update_campaign',
        agent_user: VICIDIAL_AGENT_USER,
        amd_sensitivity: AMD_SENSITIVITY,
        format: 'json',
      },
      timeout: 8000,
    });
    console.log('[avr-sts-vapi] ViciDial AMD update: ' + JSON.stringify(resp.data));
  } catch (err) {
    // Non-fatal: ViciDial may not support this via non_agent_api; operator can set in ViciDial admin
    console.warn('[avr-sts-vapi] AMD sensitivity passthrough skipped: ' + err.message);
  }
}

(async () => {
  if (!VAPI_PRIVATE_KEY) { console.error('[avr-sts-vapi] VAPI_PRIVATE_KEY required'); process.exit(1); }
  if (!VAPI_ASSISTANT_ID) { console.error('[avr-sts-vapi] VAPI_ASSISTANT_ID required'); process.exit(1); }
  if (VICIDIAL_URL) {
    console.log('[avr-sts-vapi] ViciDial 3-way enabled -> ' + VICIDIAL_URL + ' (agent: ' + VICIDIAL_AGENT_USER + ')');
    await applyVicidialAmdSensitivity();
  } else {
    console.log('[avr-sts-vapi] ViciDial 3-way disabled (set VICIDIAL_URL to enable)');
  }
  await initResamplers();
  startServer();
})();
