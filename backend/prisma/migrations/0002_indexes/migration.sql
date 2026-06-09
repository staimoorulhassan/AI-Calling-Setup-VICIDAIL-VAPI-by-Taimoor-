-- Migration: 0002_indexes
-- Composite indexes for query performance (data-model.md requirements)

-- Active calls board: partial index for non-terminal statuses
CREATE INDEX CONCURRENTLY IF NOT EXISTS "calls_active_status_idx"
    ON "calls"("status")
    WHERE "status" NOT IN ('ended', 'failed');

-- Fast lookup by VAPI call ID (already unique, adding explicit named index)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "calls_vapi_call_id_lookup_idx"
    ON "calls"("vapi_call_id")
    WHERE "vapi_call_id" IS NOT NULL;

-- Transcript sequence lookup (already in 0001, ensuring named form)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "transcripts_call_sequence_idx"
    ON "transcripts"("call_id", "sequence" ASC);
