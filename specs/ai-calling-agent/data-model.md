# Data Model: AI Calling Agent System

**Phase**: 1 — Design & Contracts
**Date**: 2026-06-09
**Source**: spec.md FR-1 to FR-25, research.md

---

## Entity Overview

```
users ──────────────────────┐
                             │ created_by
campaigns ──────────────────┼──► calls ──► transcripts
  │ campaign_id              │      │
  │ vapi_config              │      └──► events
  │ verifier_phone           │
  │ caller_ids[]             │
  └── agents (virtual)       └── calls.campaign_id FK
```

---

## Entity Definitions

### `users`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| email | VARCHAR(255) | UNIQUE NOT NULL | Login identifier |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt hash |
| name | VARCHAR(100) | NOT NULL | Display name |
| role | ENUM(`admin`, `operator`) | NOT NULL DEFAULT `operator` | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| last_login_at | TIMESTAMPTZ | NULL | |
| is_active | BOOLEAN | NOT NULL DEFAULT true | |

**Indexes:** `(email)` unique

---

### `campaigns`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| name | VARCHAR(200) | NOT NULL | Display name |
| status | ENUM(`active`, `paused`, `disabled`) | NOT NULL DEFAULT `paused` | |
| vicidial_campaign_id | VARCHAR(100) | NULL | Matches ViciDial campaign ID |
| vapi_assistant_id | VARCHAR(100) | NULL | VAPI assistant ID |
| system_prompt | TEXT | NOT NULL | AI agent script/instruction |
| first_message | VARCHAR(500) | NOT NULL | AI agent's opening line |
| voice_model | VARCHAR(100) | NOT NULL DEFAULT `11labs-Rachel` | VAPI TTS voice |
| llm_model | VARCHAR(100) | NOT NULL DEFAULT `gpt-4o-mini` | LLM model for VAPI |
| language | VARCHAR(10) | NOT NULL DEFAULT `en-US` | |
| amd_sensitivity | ENUM(`low`, `medium`, `high`) | NOT NULL DEFAULT `medium` | Maps to Asterisk AMD params |
| verifier_phone | VARCHAR(30) | NULL | PSTN number for 3-way transfer |
| caller_ids | TEXT[] | NOT NULL DEFAULT `{}` | Array of outbound caller ID numbers |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| created_by | UUID | FK → users.id | |

**Indexes:** `(status)`, `(vicidial_campaign_id)`

---

### `calls`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | Internal call ID |
| campaign_id | UUID | FK → campaigns.id NOT NULL | |
| phone_number | VARCHAR(30) | NOT NULL | Prospect's number |
| direction | ENUM(`outbound`) | NOT NULL DEFAULT `outbound` | Inbound is rejected |
| status | ENUM(`initiated`, `ringing`, `connected`, `on_hold`, `transferring`, `ended`, `failed`) | NOT NULL | Live status |
| disposition | ENUM(`answered`, `voicemail`, `ivr`, `transferred`, `no_answer`, `failed`, `test`) | NULL | Set on call end |
| vapi_call_id | VARCHAR(200) | NULL UNIQUE | VAPI's internal call ID |
| vicidial_channel | VARCHAR(200) | NULL | Asterisk channel string |
| test_mode | BOOLEAN | NOT NULL DEFAULT false | True if initiated from test panel |
| started_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| answered_at | TIMESTAMPTZ | NULL | When prospect picked up |
| ended_at | TIMESTAMPTZ | NULL | |
| duration_seconds | INTEGER | NULL GENERATED | Computed: ended_at - answered_at |
| transfer_started_at | TIMESTAMPTZ | NULL | |
| verifier_joined_at | TIMESTAMPTZ | NULL | |
| ai_summary | TEXT | NULL | Brief VAPI-generated summary for verifier |
| created_by | UUID | FK → users.id NULL | Non-null for test calls only |

**Indexes:**
- `(campaign_id, started_at DESC)` — log queries
- `(status)` WHERE status NOT IN ('ended','failed') — live board
- `(started_at DESC)` — date range filter
- `(vapi_call_id)` — webhook lookup
- `(disposition)` — analytics

---

### `transcripts`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| call_id | UUID | FK → calls.id NOT NULL | |
| speaker | ENUM(`ai`, `human`) | NOT NULL | |
| text | TEXT | NOT NULL | Utterance text |
| confidence | DECIMAL(4,3) | NULL | STT confidence 0-1 |
| spoken_at | TIMESTAMPTZ | NOT NULL | When utterance occurred |
| sequence | INTEGER | NOT NULL | Turn order within call |

**Indexes:** `(call_id, sequence)` — transcript retrieval; `(call_id, spoken_at)`

---

### `events`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| call_id | UUID | FK → calls.id NOT NULL | |
| event_type | VARCHAR(50) | NOT NULL | See Event Types below |
| payload | JSONB | NOT NULL DEFAULT `{}` | Structured event data |
| occurred_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| source | ENUM(`vapi`, `vicidial`, `amd`, `acsbackend`, `operator`) | NOT NULL | Which system fired event |

**Indexes:** `(call_id, occurred_at)`, `(event_type)`

**Event Types:**
| event_type | Source | Payload keys |
|------------|--------|-------------|
| `call.initiated` | acsbackend | campaign_id, phone_number |
| `call.ringing` | vicidial | channel |
| `call.answered` | vapi/vicidial | vapi_call_id |
| `call.amd_detected` | amd | result: HUMAN/MACHINE/NOTSURE |
| `call.ivr_detected` | acsbackend | matched_phrase |
| `call.voicemail_hangup` | acsbackend | — |
| `call.ivr_hangup` | acsbackend | — |
| `call.transfer_initiated` | operator/ai | verifier_phone |
| `call.verifier_joined` | vicidial | channel |
| `call.ai_exited` | vapi | — |
| `call.ended` | vapi/vicidial | duration_seconds, disposition |
| `call.failed` | acsbackend | error, reason |

---

### `sessions` (auth)

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| user_id | UUID | FK → users.id NOT NULL | |
| token_hash | VARCHAR(255) | NOT NULL | SHA-256 of JWT for revocation |
| expires_at | TIMESTAMPTZ | NOT NULL | NOW() + 8 hours |
| revoked_at | TIMESTAMPTZ | NULL | Set on logout |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| ip_address | INET | NULL | |

**Indexes:** `(token_hash)`, `(user_id, expires_at)`

---

## State Transitions

### `calls.status`

```
initiated
    │
    ▼
ringing ──(AMD: MACHINE/NOTSURE)──► ended [disposition: voicemail]
    │
    ▼
connected ──(IVR detected)──────────► ended [disposition: ivr]
    │
    ├──(transfer trigger)──► transferring ──► ended [disposition: transferred]
    │
    └──(normal end)──────────────────────► ended [disposition: answered]

Any state ──(error)──► failed [disposition: failed]
```

---

## Schema Validation Rules

| Rule | Entity | Constraint |
|------|--------|-----------|
| Inbound calls not stored | calls | `direction = 'outbound'` enforced; insert rejected if direction = 'inbound' |
| Disposition required on end | calls | `disposition NOT NULL` when `status = 'ended'` — enforced by application layer |
| Campaign must be active to dial | calls | Application check before insert; not a DB constraint |
| Transcript only for answered calls | transcripts | `call_id` must reference a call with `answered_at IS NOT NULL` — application enforced |
| AMD result required before VAPI leg | events | `call.amd_detected` must precede `call.answered` — application state machine |

---

## Migration Strategy

- Migrations managed by Prisma Migrate (`prisma migrate dev` / `prisma migrate deploy`).
- Each migration is a numbered SQL file under `backend/prisma/migrations/`.
- Rollback: Prisma does not auto-rollback; rollback SQL scripts maintained per migration.
- Production deploy: `prisma migrate deploy` runs before application start in Docker entrypoint.

---

## Performance Notes (NFR-10)

| Table | Projected rows / year | Key query pattern | Index coverage |
|-------|----------------------|-------------------|----------------|
| calls | ~36,500 (100/day) | date range, campaign filter | `(campaign_id, started_at)` |
| transcripts | ~730,000 (20 turns/call) | by call_id | `(call_id, sequence)` |
| events | ~400,000 (11 events/call) | by call_id | `(call_id, occurred_at)` |

All key queries covered by partial or composite indexes. `EXPLAIN ANALYZE` to be run on 1M-row dataset in TC-33 load test.
