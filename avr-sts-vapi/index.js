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
const { create } = require('@alexanderolsen/libsamplerate-js');

require('dotenv').config();

const PORT = process.env.PORT || 6042;
const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;

// ViciDial (optional -- 3-way only works when these are set)
const VICIDIAL_URL = process.env.VICIDIAL_URL || '';
const VICIDIAL_USER = process.env.VICIDIAL_USER || 'admin';
const VICIDIAL_PASS = process.env.VICIDIAL_PASS || '';
const VICIDIAL_AGENT_USER = process.env.VICIDIAL_AGENT_USER || '';
const VICIDIAL_AGENT_PASS = process.env.VICIDIAL_AGENT_PASS || '';

// AMD sensitivity (FR-21): disabled | conservative | normal | aggressive
const VALID_AMD_VALUES = ['disabled', 'conservative', 'normal', 'aggressive'];
const AMD_SENSITIVITY = VALID_AMD_VALUES.includes(process.env.AMD_SENSITIVITY)
  ? process.env.AMD_SENSITIVITY
  : 'conservative';

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
  const resp = await axios.get(`${VICIDIAL_URL}/vicidial/non_agent_api.php`, {
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
  const resp = await axios.get(`${VICIDIAL_URL}/vicidial/agc/api.php`, {
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

async function handleToolCall(toolCall, sessionId) {
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
      return message;
    } catch (err) {
      console.error('[avr-sts-vapi] Transfer failed: ' + err.message);
      return "I'm having trouble connecting right now. Please try again.";
    }
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

    const cleanup = () => {
      if (vapiSocket && vapiSocket.readyState === WebSocket.OPEN) vapiSocket.close();
      vapiSocket = null;
      audioBuffer8k = [];
    };

    const sendAudioToAVR = (pcm16kBuf) => {
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

    avrSocket.on('message', async (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch (e) { return; }

      if (msg.type === 'init') {
        sessionId = msg.uuid;
        console.log('[avr-sts-vapi] Init session ' + sessionId);
        try {
          const resp = await axios.post(
            'https://api.vapi.ai/call/web',
            { assistantId: VAPI_ASSISTANT_ID, transport: { provider: 'vapi.websocket' } },
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
                avrSocket.send(JSON.stringify({ type: 'transcript', role: role, text: ctrl.transcript || '' }));
                console.log('[avr-sts-vapi] [' + role + '] ' + ctrl.transcript);
              }
            } else if (ctrl.type === 'speech-update') {
              if (ctrl.role === 'user' && ctrl.status === 'started') {
                avrSocket.send(JSON.stringify({ type: 'interruption' }));
              }
            } else if (ctrl.type === 'tool-calls') {
              if (ctrl.toolCalls && ctrl.toolCalls.length) {
                for (const tc of ctrl.toolCalls) {
                  const result = await handleToolCall(tc, sessionId);
                  if (vapiSocket && vapiSocket.readyState === WebSocket.OPEN) {
                    vapiSocket.send(JSON.stringify({ type: 'tool-call-result', toolCallId: tc.id, result: result }));
                  }
                  const tcName = tc && tc.function && tc.function.name;
                  if (tcName === 'transferCall' &&
                      !result.toLowerCase().startsWith('transfer failed') &&
                      !result.toLowerCase().startsWith("i'm having trouble")) {
                    transferInProgress = true;
                  }
                }
              }
            } else if (ctrl.type === 'hang' || ctrl.type === 'call-end-report') {
              console.log('[avr-sts-vapi] Call ended (' + sessionId + ') transfer=' + transferInProgress);
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
    const resp = await axios.get(`${VICIDIAL_URL}/vicidial/non_agent_api.php`, {
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
