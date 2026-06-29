# Root-Cause Research — 4 Operational Bugs (2026-06-29)

Investigation run against the live production server `161.97.184.140` and the backend code.
Each finding below is evidence-backed (commands + observed output).

---

## Problem 1 — Recordings not in the Recordings tab

**Status: ROOT CAUSE CONFIRMED.**

- Host has **1324** WAV files in `/var/spool/asterisk/monitor` (e.g. `1782709447.2493.wav`).
- Inside `avr-app-backend`: `ls /var/spool/asterisk/monitor` → **`No such file or directory`** (0 files).
- Backend log: `[RecordingsService] Monitor path not found: /recordings`.
- `docker-compose-acs.yml` `avr-app-backend.volumes` only contains:
  - `/var/run/docker.sock:/var/run/docker.sock`
  - `avr-backend-data:/app/data`
  → **the recordings bind-mount is missing** (lost in the config revert).

**Decision:** Re-add a read-only bind mount of the host monitor dir into the container at the
path the code scans. Two consumers exist:
- `vicidial` recordings endpoint disk-scans `/var/spool/asterisk/monitor` (per CLAUDE.md).
- admin `RecordingsService` scans `/recordings`.
Mount host `/var/spool/asterisk/monitor` → container `/var/spool/asterisk/monitor:ro`, and also
expose it at `/recordings:ro` (or set the RecordingsService path env) so both tabs work.

---

## Problem 2 — No call history / decomposition

**Status: call-history query is CORRECT; "decomposition" (disposition) is the real gap.**

- `vicidial_dial_log`: **1620 rows**, newest `2026-06-29 07:04:06` (actively populated).
- Schema note: `vicidial_dial_log` has **no `status` and no `phone_number` column**
  (columns: caller_code, lead_id, server_ip, call_date, extension, channel, context, timeout,
  outbound_cid, sip_hangup_cause, sip_hangup_reason, uniqueid).
- The backend `getCallHistory` (vicidial.service.ts:918) already derives `status`/`phone_number`
  from `vicidial_list` via `LEFT JOIN ... ON vl.lead_id = r.lead_id` → **query is well-formed**.
- Campaign filter builds `r.extension IN ('13' + campaign_vdad_exten)` = `'138502'`; recent
  `dial_log.extension` is exactly **`138502` (516 rows)** → **filter matches**, not the bug.
- MySQL is reachable from the backend (port 3306 OPEN, `host.docker.internal` resolves).
- Dispositions: `vicidial_list` over last 24h shows only **NA (260)** and **NEW (256)**; last 2h
  shows essentially nothing dispositioned. Connected AI calls are **not** getting AMD/HUMAN/DROP/XFER.

**Conclusion:** "No call history" is most likely the table appearing empty/useless because rows
carry empty/`NEW`/`NA` statuses (no real dispositions) — i.e. the same cause as Problem 4. A
runtime check of `GET /api/v1/vicidial/call-history` is still required to rule out a frontend
wiring issue. The COUNT(*) ignores the campaign filter (returns 1620) while rows honor it — if a
mismatch ever occurs this yields "total>0 but 0 rows"; not the current cause but worth aligning.

---

## Problem 3 — Manual call not working

**Status: connectivity OK; suspected control-flow + AMI-login.**

- `manualDialViaAmi` (vicidial.service.ts:455) replicates the live dialer exactly:
  `Originate Channel=Local/70841<10digit>@default, Context=default, Exten=138502` — this is the
  **same pattern as the working auto-dialer** (verified in live channels).
- AMI port `5038` is **OPEN** from the backend; manager account `[avr]` has
  `permit=0.0.0.0/0.0.0.0`, `read/write=all` → auth/permit are **not** blockers.
- BUT backend log shows repeated `[AmiClientService] Connecting to AMI at host.docker.internal:5038...`
  every ~90s with **no success/"connected" log line** → AMI session may not be completing the
  login handshake, or the persistent client is reconnect-looping.
- Controller routing (vicidial.controller.ts:66-80): if `campaignId` is present it calls
  `manualDialViaApi` (`preview_dial_action`) — that path needs a live preview/agent session and
  will typically fail for a headless AI setup. If the frontend sends `campaignId`, manual dial
  takes the **failing API branch** instead of the working AMI branch.

**Decision:** (a) Make manual dial use the AMI-Originate path (proven working) and not depend on
`preview_dial_action`; (b) verify the AMI client actually logs in (capture an Originate response)
— if the persistent `AmiClientService` is looping, route `sendAmiAction` through a short-lived
AMI login or the `avr-ami` bridge (`http://avr-ami:6006`).

---

## Problem 4 — Set correct disposition as mandatory

**Status: ROOT CAUSE CONFIRMED.**

- `avr-sts-vapi` env has `VICIDIAL_URL=http://161.97.184.140/vicidial/non_agent_api.php` but
  **`VICIDIAL_USER` and `VICIDIAL_PASS` are NOT set** (empty).
- `notifyVicidialCallEnd()` calls `non_agent_api.php?function=update_lead&user=<empty>&pass=<empty>`
  → ViciDial rejects (auth) → **no disposition is ever written** for AI calls.
- Matches Problem 2's observation that connected calls stay `NEW`/`NA`.

**Decision:** Set `VICIDIAL_USER`/`VICIDIAL_PASS` (the ViciDial API user, e.g. `6666`/its pass,
with `vdc_agent_api_access=1`, `modify_leads`, `user_level>7`) in `avr-sts-vapi` env, recreate the
container, and confirm `update_lead` returns success. Then enforce that **every** call end maps to
a disposition (AMD→AMD, voicemail→IVR, human handled→a SALE/XFER/HANDLED code, otherwise DROP) so
no connected call is left `NEW`. Optionally enable campaign-level disposition enforcement.

---

## Cross-cutting note

All four regressions trace to the **config revert** wiping container/env/mount settings (same root
event that earlier wiped the ViciDial keepalive). The durable fix is to capture the corrected
`docker-compose-acs.yml` and `avr-sts-vapi/.env` into the backup set so a future revert is recoverable.
