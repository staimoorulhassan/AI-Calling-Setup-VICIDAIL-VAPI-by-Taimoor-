#!/usr/bin/env python3.11
"""
AI Campaign Runner — pulls leads from a ViciDial list and originates them
into the [ai-campaign-in] Asterisk context.

ViciDial's auto-dialer waits for a human agent before routing answered
calls; this runner skips that loop and feeds answered calls directly into
AMD → AI handoff → disposition. AMI credentials, outbound caller ID, and
DB creds are read from /etc/ai_agent/config.yaml + /etc/astguiclient.conf.

Usage:
    ai_campaign_runner --list 786 [--rate 6.0] [--concurrent 2] \
                       [--limit 10] [--statuses NEW,A]
"""
import argparse
import asyncio
import logging
import os
import signal
import sys
from contextlib import suppress

import pymysql
import yaml
from panoramisk import Manager

CONFIG_PATH = os.environ.get("AI_AGENT_CONFIG", "/etc/ai_agent/config.yaml")
ASTGUI_CONF = "/etc/astguiclient.conf"
LOG = logging.getLogger("ai_campaign_runner")


def load_config():
    try:
        with open(CONFIG_PATH) as fh:
            cfg = yaml.safe_load(fh) or {}
    except FileNotFoundError:
        LOG.error("config missing: %s", CONFIG_PATH)
        sys.exit(2)
    except yaml.YAMLError as exc:
        LOG.error("invalid YAML in %s: %s", CONFIG_PATH, exc)
        sys.exit(2)
    return cfg


def load_db_creds():
    try:
        f = open(ASTGUI_CONF)
    except FileNotFoundError:
        LOG.error("astguiclient.conf missing: %s", ASTGUI_CONF)
        sys.exit(2)
    cfg = {}
    with f:
        for line in f:
            if "=>" in line and not line.lstrip().startswith("#"):
                k, _, v = line.partition("=>")
                cfg[k.strip()] = v.strip()
    required = ("VARDB_server", "VARDB_user", "VARDB_pass", "VARDB_database")
    missing = [k for k in required if k not in cfg]
    if missing:
        LOG.error("missing keys in %s: %s", ASTGUI_CONF, ", ".join(missing))
        sys.exit(2)
    try:
        port = int(cfg.get("VARDB_port", 3306))
    except ValueError:
        LOG.warning("invalid VARDB_port=%r; defaulting to 3306",
                    cfg.get("VARDB_port"))
        port = 3306
    return dict(
        host=cfg["VARDB_server"],
        user=cfg["VARDB_user"],
        password=cfg["VARDB_pass"],
        db=cfg["VARDB_database"],
        port=port,
        autocommit=True,
    )


def pick_leads(conn, list_id, statuses, limit):
    statuses_sql = ",".join("%s" for _ in statuses)
    sql = (
        "SELECT lead_id, phone_number, status, phone_code "
        "FROM vicidial_list "
        f"WHERE list_id=%s AND status IN ({statuses_sql}) "
        "ORDER BY called_count ASC, lead_id ASC "
        "LIMIT %s"
    )
    with conn.cursor() as cur:
        cur.execute(sql, (list_id, *statuses, limit))
        return cur.fetchall()


def mark_lead(conn, lead_id, new_status):
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE vicidial_list SET status=%s, modify_date=NOW() "
            "WHERE lead_id=%s",
            (new_status, lead_id),
        )


async def originate_one(manager, lead_id, phone, campaign_id, phone_code,
                        caller_id_num, caller_id_name):
    channel = f"SIP/SignalWire/+{phone_code}{phone}"
    if caller_id_num:
        cid = f'"{caller_id_name}" <{caller_id_num}>'
    else:
        cid = caller_id_name or "AI Agent"
    return await manager.send_action({
        "Action": "Originate",
        "Channel": channel,
        "Context": "ai-campaign-in",
        "Exten": "s",
        "Priority": 1,
        "Async": "true",
        "CallerID": cid,
        "Timeout": 90000,
        "Variable": (
            f"lead_id={lead_id},"
            f"campaign_id={campaign_id},"
            f"user=ai_runner,"
            f"phone_number={phone}"
        ),
    })


async def run(args):
    cfg = load_config()
    ami_cfg = cfg.get("ami") or {}
    out_cfg = cfg.get("outbound") or {}

    if not ami_cfg.get("username"):
        LOG.error("ami.username not set in %s", CONFIG_PATH)
        sys.exit(2)

    db_cfg = load_db_creds()
    LOG.info("DB %s@%s/%s", db_cfg["user"], db_cfg["host"], db_cfg["db"])
    try:
        conn = pymysql.connect(**db_cfg)
    except pymysql.Error as exc:
        LOG.error("database connection failed: %s", exc)
        sys.exit(2)

    manager = Manager(
        host=ami_cfg.get("host", "127.0.0.1"),
        port=int(ami_cfg.get("port", 5038)),
        username=ami_cfg["username"],
        secret=ami_cfg.get("secret", ""),
    )
    try:
        await manager.connect()
    except Exception as exc:  # noqa: BLE001
        LOG.error("AMI connection failed: %s", exc)
        conn.close()
        sys.exit(2)
    LOG.info("AMI connected as %s", ami_cfg["username"])

    in_flight = set()
    semaphore = asyncio.Semaphore(args.concurrent)

    def on_hangup(_manager, event):
        uid = event.get("Uniqueid") or event.get("uniqueid")
        if uid and uid in in_flight:
            in_flight.discard(uid)
            with suppress(ValueError):
                semaphore.release()
            LOG.debug("hangup uid=%s (in_flight=%d)", uid, len(in_flight))

    manager.register_event("Hangup", on_hangup)

    stop = asyncio.Event()
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        with suppress(NotImplementedError):
            loop.add_signal_handler(sig, stop.set)

    statuses = [s.strip() for s in args.statuses.split(",") if s.strip()]
    sent = 0

    while not stop.is_set():
        if args.limit and sent >= args.limit:
            LOG.info("limit reached (%d); waiting for in-flight", sent)
            break

        await semaphore.acquire()
        if stop.is_set():
            semaphore.release()
            break

        rows = pick_leads(conn, args.list, statuses, 1)
        if not rows:
            LOG.info("no eligible leads in list %s", args.list)
            semaphore.release()
            with suppress(asyncio.TimeoutError):
                await asyncio.wait_for(stop.wait(), timeout=5.0)
            break

        lead_id, phone, _status, phone_code = rows[0]
        if args.dry_run:
            LOG.info("DRY originate lead=%s phone=+%s%s",
                     lead_id, phone_code or "1", phone)
            semaphore.release()
        else:
            mark_lead(conn, lead_id, "QUEUE")
            try:
                resp = await originate_one(
                    manager, lead_id, phone,
                    args.campaign,
                    phone_code=str(phone_code or "1"),
                    caller_id_num=out_cfg.get("caller_id_num", ""),
                    caller_id_name=out_cfg.get("caller_id_name", "AI Agent"),
                )
            except Exception as exc:  # noqa: BLE001
                LOG.error("originate failed lead=%s: %s", lead_id, exc)
                mark_lead(conn, lead_id, "NEW")
                semaphore.release()
                continue

            uid = None
            for msg in (resp if isinstance(resp, list) else [resp]):
                uid = getattr(msg, "Uniqueid", None) or uid
            if uid and uid != "<unknown>":
                in_flight.add(uid)
                LOG.info("originate lead=%s phone=%s uniqueid=%s",
                         lead_id, phone, uid)
            else:
                # No Uniqueid returned — release slot; hangup won't fire for it
                semaphore.release()
                LOG.warning("originate lead=%s: no Uniqueid in response; "
                            "slot released immediately", lead_id)
            mark_lead(conn, lead_id, "AI")
        sent += 1

        with suppress(asyncio.TimeoutError):
            await asyncio.wait_for(stop.wait(), timeout=args.rate)

    LOG.info("shutting down: %d originates fired, in_flight=%d",
             sent, len(in_flight))
    with suppress(Exception):
        await manager.close()
    conn.close()


def _positive_int(val):
    v = int(val)
    if v < 1:
        raise argparse.ArgumentTypeError("must be >= 1")
    return v


def _positive_float(val):
    v = float(val)
    if v <= 0:
        raise argparse.ArgumentTypeError("must be > 0")
    return v


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--list", type=int, required=True)
    p.add_argument("--rate", type=_positive_float, default=30.0)
    p.add_argument("--concurrent", type=_positive_int, default=1)
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--statuses", default="NEW")
    p.add_argument("--campaign", default="AI_CAMP")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--verbose", "-v", action="store_true")
    args = p.parse_args()

    if not any(s.strip() for s in args.statuses.split(",")):
        p.error("--statuses must contain at least one non-empty value")

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
