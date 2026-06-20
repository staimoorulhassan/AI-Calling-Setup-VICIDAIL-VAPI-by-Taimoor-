# WebSocket Contracts — 3-Way Transfer

## WS-1: Live Call Board — Transfer Events

**Endpoint**: `ws://161.97.184.140:3001/ws/calls?token=<jwt>`

### Server → Client: `call.transferred`

Pushed when a transfer bridge is established.

```json
{
  "type": "call.transferred",
  "payload": {
    "call_id": "vapi-call-abc123",
    "lead_id": 8,
    "verifier_number": "+17543463674",
    "initiated_by": "ai",
    "state": "bridged",
    "bridged_at": "2026-06-20T17:30:00.000Z"
  }
}
```

### Server → Client: `call.transfer_failed`

Pushed when transfer fails (AMI error, verifier no-answer, channel gone).

```json
{
  "type": "call.transfer_failed",
  "payload": {
    "call_id": "vapi-call-abc123",
    "reason": "verifier_no_answer",
    "fallback_disposition": "CALLBK"
  }
}
```

---

## VAPI Tool Call Contract

### Tool Definition (set in VAPI dashboard on assistant `ann`)

```json
{
  "name": "request_transfer",
  "description": "Transfer the lead to a human verifier when they express clear interest.",
  "parameters": {
    "type": "object",
    "properties": {
      "lead_name": {
        "type": "string",
        "description": "Full name of the lead for whisper announcement"
      },
      "product_name": {
        "type": "string",
        "description": "Product the lead expressed interest in"
      }
    },
    "required": []
  }
}
```

### Webhook Payload VAPI Sends

```json
{
  "message": {
    "type": "tool-call",
    "toolCallList": [
      {
        "id": "tool-call-xyz",
        "name": "request_transfer",
        "parameters": {
          "lead_name": "John Smith",
          "product_name": "Solar Panels"
        }
      }
    ],
    "call": {
      "id": "vapi-call-abc123",
      "assistantId": "37c1cb25-28c7-41b4-bdf0-dcea72331856"
    }
  }
}
```

### Required Response from Webhook

```json
{
  "results": [
    {
      "toolCallId": "tool-call-xyz",
      "result": "Transfer initiated. Connecting you to our specialist now."
    }
  ]
}
```

VAPI will speak this result to the lead while the bridge is being established.
