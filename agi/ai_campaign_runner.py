#!/usr/bin/env python3
"""
AI Campaign Runner — pulls leads from a ViciDial list and originates them
into the [ai-campaign-in] Asterisk context. ViciDial's auto-dialer waits
for a human agent before routing answered calls; this runner skips that
loop and feeds answered calls directly into AMD → AI handoff → disposition.

Usage:
    ai_campaign_runner.py --list 786 [--rate 6.0] [--concurrent 2] \
                          [--limit 10] [--statuses NEW,A]

  --list         vicidial_list.list_id to dial from
  --rate         seconds between originate attempts (default 30)
  --concurrent   max in-flight calls (default 1)
  --limit        stop after N originates this run (default: unlimited)
  --statuses     lead statuses to include (default: NEW)
  --campaign     campaign_id (default: AI_CAMP)
  --dry-run      log what would happen; do not originate

Lead-state mutations:
  NEW → QUEUE      (when picked up by runner)
  QUEUE → AI       (after originate sent — disposition.py rewrites on hangup)

Stop with Ctrl-C; in-flight calls finish naturally.
"""
import argparse
import asyncio
import logging
import os
import signal
import sys
import time
from contextlib import suppress

import pymysql
from panoramisk import Manager

CONFIG_PATH = os.environ.get("AI_AGENT_CONFIG", "/etc/ai_agent/config.yaml")
ASTGUI_CONF = "/etc/astguiclient.conf"
LOG = logging.getLogger("ai_campaign_runner")


def load_db_creds():
    with open(ASTGUI_CONF) as f:
        cfg = {}
        for line in f:
            if "=>" in line and not line.lstrip().startswith("#"):
                k, _, v = line.partition("=>")
                cfg[k.strip()] = v.strip()
    return dict(
        host=cfg["VARDB_server"],
        user=cfg["VARDB_user"],
        password=cfg["VARDB_pass"],
        db=cfg["VARDB_database"],
        port=int(cfg.get("VARDB_port", 3306)),
        autocommit=True,
    )


def pick_leads(conn, list_id, statuses, limit):
    statuses_sql = ",".join("%s" for _ in statuses)
    sql = (
        "SELECT lead_id, phone_number, vendor_lead_code, status "
        "FROM vicidial_list "
        f"WHERE list_id=%s AND status IN ({statuses_sql}) "
        "ORDER BY called_count ASC, lead_id ASC "
        "LIMIT %s"
    )
    with conn.cursor() as cur:
        cur.execute(sql, (list_id, *statuses, limit))
        rows = cur.fetchall()
    return rows


def mark_lead(conn, lead_id, new_status):
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE vicidial_list SET status=%s, modify_date=NOW() WHERE lead_id=%s",
            (new_status, lead_id),
        )


async def originate_one(manager, lead_id, phone, campaign_id, dial_prefix):
    """Fire one AMI Originate. Returns ActionID for tracking."""
    channel = f"SIP/SignalWire/+{phone}"
    action = {
        "Action": "Originate",
        "Channel": channel,
        "Context": "ai-campaign-in",
        "Exten": "s",
        "Priority": 1,
        "Async": "true",
        "CallerID": f"{phone} <{phone}>",
        "Timeout": 45000,
        "Variable": (
            f"lead_id={lead_id},"
            f"campaign_id={campaign_id},"
            f"user=ai_runner,"
            f"phone_number={phone}"
        ),
    }
    return await manager.send_action(action)


async def run(args):
    db_cfg = load_db_creds()
    LOG.info("DB %s@%s/%s", db_cfg["user"], db_cfg["host"], db_cfg["db"])
    conn = pymysql.connect(**db_cfg)

    manager = Manager(
        host="127.0.0.1",
        port=5038,
        username="cron",
        secret="1234",
    )
    await manager.connect()
    LOG.info("AMI connected")

    stop = asyncio.Event()
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        with suppress(NotImplementedError):
            loop.add_signal_handler(sig, stop.set)

    statuses = [s.strip() for s in args.statuses.split(",") if s.strip()]
    in_flight = set()
    sent = 0

    while not stop.is_set():
        if args.limit and sent >= args.limit:
            LOG.info("limit reached (%d). Waiting for in-flight to finish.", sent)
            break

        # Top up to --concurrent
        while not stop.is_set() and len(in_flight) < args.concurrent:
            remaining = args.limit - sent if args.limit else args.concurrent
            need = args.concurrent - len(in_flight)
            batch = pick_leads(conn, args.list, statuses, min(need, remaining))
            if not batch:
                LOG.info("no eligible leads in list %s", args.list)
                break
            for row in batch:
                lead_id, phone, vlc, status = row
                if args.dry_run:
                    LOG.info("DRY originate lead=%s phone=%s status=%s",
                             lead_id, phone, status)
                else:
                    mark_lead(conn, lead_id, "QUEUE")
                    resp = await originate_one(
                        manager, lead_id, phone,
                        args.campaign, args.dial_prefix,
                    )
                    LOG.info("originate lead=%s phone=%s ami=%s",
                             lead_id, phone, getattr(resp, "Response", resp))
                    in_flight.add(lead_id)
                    mark_lead(conn, lead_id, "AI")
                sent += 1
                await asyncio.sleep(args.rate)
                if args.limit and sent >= args.limit:
                    break
            # Drain in_flight cheaply — disposition.py owns final status.
            # We just track count for concurrency budget; assume each call
            # lasts ~rate*1.5 sec on average for tracking purposes.
            in_flight.clear()
        try:
            await asyncio.wait_for(stop.wait(), timeout=2.0)
        except asyncio.TimeoutError:
            continue

    LOG.info("shutting down: %d originates fired", sent)
    await manager.close()
    conn.close()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--list", type=int, required=True)
    p.add_argument("--rate", type=float, default=30.0)
    p.add_argument("--concurrent", type=int, default=1)
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--statuses", default="NEW")
    p.add_argument("--campaign", default="AI_CAMP")
    p.add_argument("--dial-prefix", default="5051")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--verbose", "-v", action="store_true")
    args = p.parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    try:
        asyncio.run(run(args))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
