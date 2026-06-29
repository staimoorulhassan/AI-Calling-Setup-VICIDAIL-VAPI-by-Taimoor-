# Data Model: 3-Way Transfer

## New Entity: Transfer (in-memory, Phase 1–5)

For US1 (AI-triggered), state is tracked in-memory in `transfer_webhook.py` using `_in_flight` dict.
For US2 (operator), a DB column is added to the existing `calls` table.

### In-Memory Transfer Record (`_in_flight`)

```
_in_flight: dict[vapi_call_id: str → initiated_at: float]
TTL: 60 seconds
Purpose: idempotency guard (FR-007)
```

### ViciDial Lead Status Extension

No schema change — existing `vicidial_list.status` column is updated via `disposition.py`:

| Event | Status Written |
|---|---|
| Transfer bridge established + verifier + lead both hang up | `SCHDL` |
| Verifier no-answer within 30 s | `CALLBK` |

### Asterisk Channel Variables (set via AMI Setvar)

| Variable | Type | Set by | Used by |
|---|---|---|---|
| `VAPI_CALL_ID` | string | `ai_campaign_runner.py` (at originate) | `transfer_bridge.py` (channel lookup) |
| `LEAD_ID` | string | `ai_campaign_runner.py` (at originate) | `disposition.py` (h-extension) |
| `CONF_BRIDGE_ID` | string | `transfer_bridge.py` (before Redirect) | `[ai-transfer-verifier]` dialplan |
| `LEAD_NAME` | string | `transfer_bridge.py` (Originate vars) | `whisper.py` AGI |
| `PRODUCT_NAME` | string | `transfer_bridge.py` (Originate vars) | `whisper.py` AGI |
| `TRANSFER_RESULT` | enum(SCHDL,CALLBK) | `transfer_bridge.py` (before Redirect or on timeout) | `[ai-transfer-verifier] h` extension |

### NestJS DB Extension (Phase 6, US2)

New column on `calls` table:

```sql
ALTER TABLE calls
  ADD COLUMN transfer_state VARCHAR(16) NOT NULL DEFAULT 'none';
-- Values: none | pending | bridged | failed | completed
```

### ConfBridge (ephemeral Asterisk resource)

```
Name:     XFER-{lead_uniqueid}     (e.g. XFER-1718900000-123456)
Profile:  default_bridge
Created:  when lead redirected via AMI Redirect (first member joins)
Destroyed: automatically when last member leaves
```
