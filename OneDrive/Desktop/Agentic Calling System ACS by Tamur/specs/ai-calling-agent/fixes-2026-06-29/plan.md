# Remediation Plan — 4 Operational Bugs (2026-06-29)

**Branch:** `001-ai-calling-agent`
**Scope:** Fix 4 production regressions on `161.97.184.140` (all traced to the recent config revert).
**Type:** Bug remediation (no new entities/endpoints → no data-model.md / contracts/ needed; the
endpoints already exist). Root causes in [research.md](./research.md).

## Technical Context

- Backend: NestJS (`avr-app-backend`, port 3001), MySQL `asterisk` via `host.docker.internal:3306`,
  AMI via `host.docker.internal:5038`.
- Frontend: Next.js (`avr-app-frontend`, port 3000) — Reports/Recordings tabs.
- VAPI bridge: `avr-sts-vapi` (port 6042) → ViciDial non-agent API for dispositions.
- Compose: `/opt/avr/avr-infra/docker-compose-acs.yml`. Deploy pattern in CLAUDE.md.
- Constraint (constitution): every CallRecord `direction='outbound'`; dispositions/audit append-only;
  DNC respected; no secrets in code (use `.env`). These fixes touch env/compose/queries only.

## Constitution Check

- ✅ No secrets added to code — credentials go in `.env`/compose env only.
- ✅ No changes to DNC, encryption, or audit-log append-only behavior.
- ✅ Recordings mounted **read-only** (`:ro`) — no write path into the call-recording store.
- ✅ Disposition writes go through ViciDial's API (no direct mutation of append-only audit tables).
- ⚠️ Manual dial places outbound calls — must keep `direction=outbound` semantics and DNC gating.

---

## Fix Tasks (priority order)

### P1 — Recordings tab empty  *(confirmed: mount missing)*
- [x] T1.1 Edit `docker-compose-acs.yml` → `avr-app-backend.volumes`, add:
      `- /var/spool/asterisk/monitor:/var/spool/asterisk/monitor:ro`
      and `- /var/spool/asterisk/monitor:/recordings:ro` (covers both the vicidial endpoint and
      `RecordingsService`). **Done 2026-06-29.**
- [x] T1.2 `docker compose -f docker-compose-acs.yml up -d --force-recreate avr-app-backend`. **Done.**
- [x] T1.3 Verified: container sees **1324** files at both paths; no "Monitor path not found"; the
      recordings endpoint returns total=1325. (Streaming a file is the only UI-side step left.)
- [x] T1.4 Backed up corrected compose to server `/opt/avr/_backups/CORRECTED-20260629/`.

### P4 — Dispositions never written  *(confirmed: VAPI creds missing — do before P2 verify)*
- [x] T4.1 Add to `avr-sts-vapi` env (compose + `avr-sts-vapi/.env`):
      `VICIDIAL_USER=<api user, e.g. 6666>`, `VICIDIAL_PASS=<that user's pass>`.
- [x] T4.1a **`VICIDIAL_URL` MUST be the base host only** (e.g. `https://161.97.184.140`), NOT the
      full `/vicidial/non_agent_api.php` path — the bridge appends that path itself; a full-path
      value yields a doubled URL. Use `https://` directly (server forces HTTPS; `vicidialAxios`
      ignores the self-signed cert) to avoid the 301 redirect. (CHK005 — was an undocumented defect.)
- [x] T4.1b **Validate the API user can actually update leads** — do not assume. Required:
      `vdc_agent_api_access=1` AND `modify_leads∈{1,2,3,4}` AND `user_level>7` AND active. Verify by
      calling `non_agent_api.php?function=update_lead` and asserting the response is NOT
      "USER DOES NOT HAVE PERMISSION". (CHK026 — the actual prod failure: user 6666 had
      `vdc_agent_api_access=0`; enabled via SQL.)
- [x] T4.2 Recreate `avr-sts-vapi`; confirm `env | grep VICIDIAL_` shows USER+PASS (+URL base form).
- [ ] T4.3 Verify `notifyVicidialCallEnd` works: trigger/observe one call end → ViciDial
      `update_lead` returns success; `vicidial_list.status` changes (AMD/IVR/DROP/HUMAN), not `NEW`.
- [x] T4.4 Enforce mandatory disposition in `avr-sts-vapi/index.js`: ensure **every** call-end path
      (provider `hang`/`call-end-report`, AVR/VAPI socket close, error) maps to a status
      (AMD→AMD, voicemail keywords→IVR, transfer→XFER, human-handled→HANDLED/SALE, else→DROP);
      never leave a connected call `NEW`. Default code configurable via env (`VICIDIAL_DEFAULT_DISPO`,
      default `DROP`). **Idempotent (CHK022):** when multiple terminal events fire for one call
      (e.g. AMD detected then hang), exactly ONE disposition is written — a first-write-wins guard
      (`finalDispoWritten`) prevents the cleanup default from overriding a specific status.
      Skip the write only when neither phone nor lead_id is known.
- [ ] T4.5 (Optional) Campaign-level enforcement review on `AI_CAMP` (disposition required settings).

### P2 — Call history empty/useless  *(query is correct; verify runtime, fix display)*
- [x] T2.1 Verified: `GET /api/v1/vicidial/call-history` returns total=1620 with real rows (status,
      phone, leadId, callDate) both with and without `campaignId`; no `getCallHistory failed` warning.
- [x] T2.2 **Fixed (CHK013):** the COUNT query ignored the campaign filter (always returned 1620).
      Aligned it to honor the same `cond` (vicidial.service.ts). Verified: `campaignId=ZZZNOPE` →
      total=0 (was 1620); `AI_CAMP` → 1620 (correct — all dial_log rows use ext 138502). Deployed.
- [x] T2.3 Confirmed history rows carry real statuses (e.g. `NA`), not blank/`NEW`. (Full
      AMD/IVR/XFER population continues as P4 dispositions accrue on new calls.)
- [x] T2.4 Not needed — the API returns rows correctly; no frontend wiring failure observed.

### P3 — Manual call not working  *(connectivity OK; control-flow + AMI login)*
- [ ] T3.1 Reproduce from the UI; capture the request body (does it include `campaignId`?) and the
      backend response/log for `manualDial`.
- [x] T3.2 **Resolved (per [ADR-0002](../../../history/adr/ADR-0002-manual-dial-and-disposition-strategy.md), CHK015):**
      manual dial ALWAYS routes through the proven **AMI Originate** path (`manualDialViaAmi`).
      `preview_dial_action` requires a live agent session that does not exist in this AI-headless
      setup, so `manualDialViaApi` is NOT used for routing. `campaignId`/`leadId` are accepted for
      compatibility but ignored for routing (no API-then-AMI fallback — the earlier "OR fall back"
      wording is superseded). Deployed in `vicidial.controller.ts`.
- [ ] T3.3 Confirm `AmiClientService` actually logs in (not just reconnect-looping): capture an
      Originate `Response: Success`. If the persistent client loops, send `sendAmiAction` via a
      short-lived AMI login or the `avr-ami` bridge (`http://avr-ami:6006`).
- [ ] T3.4 End-to-end: manual dial a test number → call appears in `vicidial_auto_calls`, bridges
      to AudioSocket→VAPI, and (after P4) gets a disposition. Keep DNC gating + `outbound` semantics.

---

## Sequencing & Dependencies

1. **P1** (independent, lowest risk) — mount + recreate backend.
2. **P4** (independent) — VAPI creds; unblocks P2's "decomposition" half.
3. **P2** (depends on P4 for meaningful statuses) — verify + display fixes.
4. **P3** (independent of others) — control-flow + AMI login.

P1 and P4 are pure config/env (fast, low risk, no code build). P2 and P3 may need a backend image
rebuild + (P4.4) an `avr-sts-vapi` rebuild — use the SCP+build+recreate procedure in CLAUDE.md.

## Risks (max 3)

- **Manual dial = live outbound calls.** Test with a single safe number; preserve DNC check and
  `direction=outbound`. Avoid dead-air (P4 audio path already verified working).
- **Recordings mount is host PII (call audio).** Mount read-only; do not expose the path publicly;
  keep behind `JwtAuthGuard` (already the case).
- **Config drift on next revert.** All env/compose/mount changes must be copied into the backup set,
  or a future revert silently re-breaks all four (this is exactly what happened here).

## Verification / Acceptance

- P1: Recordings tab lists ~1324 files; one streams.
- P2: Call-history table shows recent rows with real statuses.
- P3: A manual dial produces a live call + appears in history with a disposition.
- P4: Newly connected calls show AMD/IVR/XFER/HANDLED/DROP in `vicidial_list` — never stuck `NEW`.

## Follow-ups

- Add a `docker exec` smoke-check to the doctor diagnostics: recordings mount present, VAPI
  VICIDIAL creds present, AMI login OK.
- Refresh `C:\Users\Taimoor\backups\acs-config-2026-06-29\` with the corrected compose + sts-vapi env.
