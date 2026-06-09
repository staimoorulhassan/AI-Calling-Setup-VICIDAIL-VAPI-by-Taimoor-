-- Migration: 0001_init
-- Generated from schema.prisma

CREATE TYPE "UserRole" AS ENUM ('admin', 'operator');
CREATE TYPE "CampaignStatus" AS ENUM ('active', 'paused', 'disabled');
CREATE TYPE "AmdSensitivity" AS ENUM ('low', 'medium', 'high');
CREATE TYPE "CallStatus" AS ENUM ('initiated', 'ringing', 'connected', 'on_hold', 'transferring', 'ended', 'failed');
CREATE TYPE "CallDisposition" AS ENUM ('answered', 'voicemail', 'ivr', 'transferred', 'no_answer', 'failed', 'test', 'transfer_failed');
CREATE TYPE "EventSource" AS ENUM ('vapi', 'vicidial', 'amd', 'acsbackend', 'operator');

CREATE TABLE "users" (
    "id"            TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "email"         TEXT        NOT NULL UNIQUE,
    "password_hash" TEXT        NOT NULL,
    "name"          TEXT        NOT NULL,
    "role"          "UserRole"  NOT NULL DEFAULT 'operator',
    "is_active"     BOOLEAN     NOT NULL DEFAULT TRUE,
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "last_login_at" TIMESTAMPTZ
);

CREATE TABLE "campaigns" (
    "id"                    TEXT            NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "name"                  TEXT            NOT NULL,
    "status"                "CampaignStatus" NOT NULL DEFAULT 'paused',
    "vicidial_campaign_id"  TEXT,
    "vapi_assistant_id"     TEXT,
    "system_prompt"         TEXT            NOT NULL DEFAULT '',
    "first_message"         TEXT            NOT NULL DEFAULT '',
    "voice_model"           TEXT            NOT NULL DEFAULT '11labs-Rachel',
    "llm_model"             TEXT            NOT NULL DEFAULT 'gpt-4o-mini',
    "language"              TEXT            NOT NULL DEFAULT 'en-US',
    "amd_sensitivity"       "AmdSensitivity" NOT NULL DEFAULT 'medium',
    "verifier_phone"        TEXT,
    "caller_ids"            TEXT[]          NOT NULL DEFAULT '{}',
    "created_at"            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    "updated_at"            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    "created_by"            TEXT            NOT NULL REFERENCES "users"("id")
);

CREATE TABLE "calls" (
    "id"                TEXT              NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "campaign_id"       TEXT              NOT NULL REFERENCES "campaigns"("id"),
    "phone_number"      TEXT              NOT NULL,
    "status"            "CallStatus"      NOT NULL DEFAULT 'initiated',
    "disposition"       "CallDisposition",
    "vapi_call_id"      TEXT              UNIQUE,
    "vicidial_channel"  TEXT,
    "test_mode"         BOOLEAN           NOT NULL DEFAULT FALSE,
    "started_at"        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    "answered_at"       TIMESTAMPTZ,
    "ended_at"          TIMESTAMPTZ,
    "duration_seconds"  INTEGER,
    "transfer_started_at" TIMESTAMPTZ,
    "verifier_joined_at"  TIMESTAMPTZ,
    "ai_summary"        TEXT,
    "created_by"        TEXT              REFERENCES "users"("id")
);

CREATE TABLE "transcripts" (
    "id"         TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "call_id"    TEXT        NOT NULL REFERENCES "calls"("id"),
    "speaker"    TEXT        NOT NULL,
    "text"       TEXT        NOT NULL,
    "confidence" DECIMAL(4,3),
    "spoken_at"  TIMESTAMPTZ NOT NULL,
    "sequence"   INTEGER     NOT NULL
);

CREATE TABLE "call_events" (
    "id"          TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "call_id"     TEXT          NOT NULL REFERENCES "calls"("id"),
    "event_type"  TEXT          NOT NULL,
    "payload"     JSONB         NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "source"      "EventSource" NOT NULL
);

CREATE TABLE "sessions" (
    "id"          TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "user_id"     TEXT        NOT NULL REFERENCES "users"("id"),
    "token_hash"  TEXT        NOT NULL,
    "expires_at"  TIMESTAMPTZ NOT NULL,
    "revoked_at"  TIMESTAMPTZ,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "ip_address"  TEXT
);

-- Indexes
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");
CREATE INDEX "campaigns_vicidial_campaign_id_idx" ON "campaigns"("vicidial_campaign_id");
CREATE INDEX "calls_campaign_id_started_at_idx" ON "calls"("campaign_id", "started_at" DESC);
CREATE INDEX "calls_started_at_idx" ON "calls"("started_at" DESC);
CREATE INDEX "calls_vapi_call_id_idx" ON "calls"("vapi_call_id");
CREATE INDEX "calls_disposition_idx" ON "calls"("disposition");
CREATE INDEX "transcripts_call_id_sequence_idx" ON "transcripts"("call_id", "sequence");
CREATE INDEX "transcripts_call_id_spoken_at_idx" ON "transcripts"("call_id", "spoken_at");
CREATE INDEX "call_events_call_id_occurred_at_idx" ON "call_events"("call_id", "occurred_at");
CREATE INDEX "call_events_event_type_idx" ON "call_events"("event_type");
CREATE INDEX "sessions_token_hash_idx" ON "sessions"("token_hash");
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");
