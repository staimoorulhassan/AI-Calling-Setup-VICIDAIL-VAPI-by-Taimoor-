# WebSocket Contracts: AI Calling Agent System

**Date**: 2026-06-09

The ACS backend exposes two WebSocket endpoints for real-time data. Both require a valid JWT passed as a query parameter (`?token=<jwt>`).

---

## WS-1: Live Call Board

**Endpoint:** `ws://host/ws/calls?token=<jwt>`

**Purpose:** Streams call status updates to the live call board view. Sends full current call state on connect, then deltas.

### Server → Client Messages

All messages are JSON.

#### `snapshot` — sent immediately on connect

```json
{
  "type": "snapshot",
  "calls": [
    {
      "id": "uuid",
      "campaign_name": "Campaign A",
      "phone_number": "+14155551234",
      "status": "connected",
      "disposition": null,
      "started_at": "2026-06-09T10:15:00Z",
      "answered_at": "2026-06-09T10:15:04Z",
      "duration_seconds": 42
    }
  ]
}
```

#### `call.updated` — sent on any status change

```json
{
  "type": "call.updated",
  "call_id": "uuid",
  "status": "transferring",
  "disposition": null,
  "duration_seconds": 67,
  "updated_at": "2026-06-09T10:16:11Z"
}
```

#### `call.ended`

```json
{
  "type": "call.ended",
  "call_id": "uuid",
  "disposition": "transferred",
  "duration_seconds": 89,
  "ended_at": "2026-06-09T10:16:33Z"
}
```

#### `call.new` — a new call has started

```json
{
  "type": "call.new",
  "call": { /* full Call object */ }
}
```

### Client → Server Messages

| Message | Purpose |
|---------|---------|
| `{ "type": "ping" }` | Keepalive — server responds with `{ "type": "pong" }` |

### Error Handling

- If JWT is invalid or expired: connection closes with code `4001 Unauthorized`.
- Server sends a `ping` every 30 seconds; client must pong within 10 seconds or connection is dropped.

---

## WS-2: Live Transcript Stream

**Endpoint:** `ws://host/ws/transcript/:callId?token=<jwt>`

**Purpose:** Streams live transcript turns for an active call. Used by the Agent Test Panel and Call Detail view.

### Server → Client Messages

#### `transcript.history` — sent on connect (existing turns)

```json
{
  "type": "transcript.history",
  "call_id": "uuid",
  "entries": [
    {
      "sequence": 1,
      "speaker": "ai",
      "text": "Hello! Am I speaking with John?",
      "spoken_at": "2026-06-09T10:15:05Z"
    },
    {
      "sequence": 2,
      "speaker": "human",
      "text": "Yes, this is John.",
      "spoken_at": "2026-06-09T10:15:07Z",
      "confidence": 0.94
    }
  ]
}
```

#### `transcript.turn` — a new utterance

```json
{
  "type": "transcript.turn",
  "call_id": "uuid",
  "entry": {
    "sequence": 3,
    "speaker": "ai",
    "text": "Great! I'm calling about...",
    "spoken_at": "2026-06-09T10:15:08Z"
  }
}
```

#### `call.event` — lifecycle events on this call

```json
{
  "type": "call.event",
  "call_id": "uuid",
  "event_type": "call.transfer_initiated",
  "occurred_at": "2026-06-09T10:16:00Z",
  "payload": { "verifier_phone": "+13105550199" }
}
```

#### `call.ended` — call has finished

```json
{
  "type": "call.ended",
  "call_id": "uuid",
  "disposition": "answered",
  "ended_at": "2026-06-09T10:16:33Z"
}
```

### Error Handling

- If `callId` not found: close with `4004 Not Found`.
- If `callId` already ended: server sends `transcript.history` + `call.ended` immediately, then closes normally.
- Invalid JWT: close with `4001 Unauthorized`.

---

## VAPI Tool Call Contract

The VAPI assistant is configured with a **custom tool** that the LLM can invoke to trigger transfer. ACS backend must expose this endpoint (or receive it via VAPI webhook).

### Tool Definition (registered in VAPI assistant config)

```json
{
  "type": "function",
  "function": {
    "name": "request_transfer",
    "description": "Call this when the prospect agrees and needs to be transferred to a human verifier to complete the process.",
    "parameters": {
      "type": "object",
      "properties": {
        "reason": {
          "type": "string",
          "description": "Brief reason for transfer (e.g. 'prospect agreed to proceed')"
        }
      },
      "required": ["reason"]
    }
  },
  "server": {
    "url": "https://acs.yourdomain.com/api/webhooks/vapi",
    "secret": "{{VAPI_WEBHOOK_SECRET}}"
  }
}
```

### VAPI Webhook Payload for Tool Call

VAPI will POST to `/api/webhooks/vapi` with:

```json
{
  "type": "tool-calls",
  "toolCallList": [
    {
      "id": "toolu_abc",
      "type": "function",
      "function": {
        "name": "request_transfer",
        "arguments": "{\"reason\": \"prospect agreed to proceed\"}"
      }
    }
  ],
  "call": {
    "id": "vapi-call-id-xyz",
    "status": "in-progress"
  }
}
```

ACS backend must:
1. Look up `call` by `vapi_call_id`.
2. Initiate 3-way transfer via AMI.
3. Respond to VAPI with tool result:

```json
{
  "results": [
    {
      "toolCallId": "toolu_abc",
      "result": "Transfer initiated. Please say goodbye and stay on the line."
    }
  ]
}
```
