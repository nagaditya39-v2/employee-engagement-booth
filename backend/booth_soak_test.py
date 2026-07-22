#!/usr/bin/env python3
"""
booth_soak_test.py
===================
Long-running (multi-hour) test automation for the Employee Engagement Booth App.

Unlike a one-shot load test, this keeps N simulated kiosks continuously
registering new visitors and running full sessions (register -> resume ->
view content -> quiz -> submit -> card-quizzes -> stats) against the real
backend and DB, for a configured duration (default 3.5 hours), with
realistic pacing between steps so it behaves like real kiosk traffic
rather than a burst.

Every event is logged to BOTH the console and a timestamped log file.
Every individual session result is also appended to a JSONL file as an
audit trail (one line per session). A concurrent uptime poller runs the
whole time. At the end (or on Ctrl+C), a summary report is printed and
the DB is spot-checked for consistency.

Usage
-----
    python booth_soak_test.py --base-url https://192.168.1.11:8000 --db-path ./kiosk.db --insecure

    # Shorter smoke run before committing to the full soak:
    python booth_soak_test.py --duration-hours 0.1 --insecure

    # Stop early any time with Ctrl+C — it still writes the final report.

Requirements
------------
    pip install requests
"""

import argparse
import json
import logging
import os
import random
import signal
import sqlite3
import sys
import threading
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone

import requests
from requests.packages.urllib3.exceptions import InsecureRequestWarning

requests.packages.urllib3.disable_warnings(InsecureRequestWarning)


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser(description="Booth app multi-hour soak test")
    p.add_argument("--base-url", default="https://192.168.1.11:8000")
    p.add_argument("--db-path", default="kiosk.db")
    p.add_argument("--num-kiosks", type=int, default=4, help="Number of concurrent simulated kiosks")
    p.add_argument("--duration-hours", type=float, default=3.5, help="Total test duration in hours")
    p.add_argument("--card1-content-id", type=int, default=1)
    p.add_argument("--card-quiz-ids", type=int, nargs="*", default=[2, 3, 4])
    p.add_argument("--insecure", action="store_true", help="Skip TLS certificate verification")

    # Pacing — keeps this from hammering the server unrealistically
    p.add_argument("--think-min", type=float, default=0.3, help="Min seconds between API calls within a session")
    p.add_argument("--think-max", type=float, default=1.5, help="Max seconds between API calls within a session")
    p.add_argument("--pause-min", type=float, default=5.0, help="Min seconds between sessions on one kiosk")
    p.add_argument("--pause-max", type=float, default=20.0, help="Max seconds between sessions on one kiosk")

    # Uptime poller
    p.add_argument("--skip-uptime", action="store_true")
    p.add_argument("--uptime-endpoint", default="/content")
    p.add_argument("--uptime-interval", type=float, default=5.0)
    p.add_argument("--uptime-timeout", type=float, default=5.0)

    # Output
    p.add_argument("--log-dir", default="./soak_logs", help="Directory for the log file + JSONL session audit trail")
    p.add_argument("--progress-every-min", type=float, default=5.0, help="Print a running summary every N minutes")

    # DB check
    p.add_argument("--skip-db-check", action="store_true")
    p.add_argument("--db-check-sample", type=int, default=50, help="How many recent sessions to individually verify")

    return p.parse_args()


# --------------------------------------------------------------------------
# Logging setup — console + file, all events
# --------------------------------------------------------------------------

def setup_logging(log_dir):
    os.makedirs(log_dir, exist_ok=True)
    run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = os.path.join(log_dir, f"soak_test_{run_id}.log")
    jsonl_path = os.path.join(log_dir, f"soak_sessions_{run_id}.jsonl")
    summary_path = os.path.join(log_dir, f"soak_summary_{run_id}.json")

    logger = logging.getLogger("soak")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()

    fmt = logging.Formatter(
        "%(asctime)s.%(msecs)03d [%(threadName)-8s] %(levelname)-5s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    fh = logging.FileHandler(log_path, encoding="utf-8")
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(fmt)
    logger.addHandler(ch)

    return logger, log_path, jsonl_path, summary_path


# --------------------------------------------------------------------------
# Thread-safe session audit trail (JSONL) + running stats
# --------------------------------------------------------------------------

class SessionRecorder:
    def __init__(self, jsonl_path):
        self._lock = threading.Lock()
        self._path = jsonl_path
        self._f = open(jsonl_path, "a", encoding="utf-8")

    def record(self, session_dict):
        with self._lock:
            self._f.write(json.dumps(session_dict) + "\n")
            self._f.flush()

    def close(self):
        with self._lock:
            self._f.close()


class Stats:
    def __init__(self):
        self._lock = threading.Lock()
        self.total_sessions = 0
        self.successes = 0
        self.failures = 0
        self.per_kiosk = {}
        self.errors = {}  # error message -> count
        self.session_durations_ms = []

    def record(self, kiosk_label, success, duration_ms, error=None):
        with self._lock:
            self.total_sessions += 1
            self.session_durations_ms.append(duration_ms)
            k = self.per_kiosk.setdefault(kiosk_label, {"sessions": 0, "success": 0, "fail": 0})
            k["sessions"] += 1
            if success:
                self.successes += 1
                k["success"] += 1
            else:
                self.failures += 1
                k["fail"] += 1
                self.errors[error] = self.errors.get(error, 0) + 1

    def snapshot(self):
        with self._lock:
            avg_dur = (sum(self.session_durations_ms) / len(self.session_durations_ms)
                       if self.session_durations_ms else 0)
            return {
                "total_sessions": self.total_sessions,
                "successes": self.successes,
                "failures": self.failures,
                "success_rate_pct": round(100.0 * self.successes / self.total_sessions, 2) if self.total_sessions else 0,
                "avg_session_ms": round(avg_dur, 1),
                "per_kiosk": dict(self.per_kiosk),
                "top_errors": sorted(self.errors.items(), key=lambda kv: -kv[1])[:10],
            }


# --------------------------------------------------------------------------
# One simulated user session
# --------------------------------------------------------------------------

def sleep_think(think_min, think_max, stop_event):
    if stop_event.is_set():
        return
    time.sleep(random.uniform(think_min, think_max))


def run_one_session(logger, base_url, verify, kiosk_label, card1_id, card_quiz_ids,
                     think_min, think_max, stop_event):
    session = requests.Session()
    session.verify = verify
    name = f"LoadTest_{kiosk_label}_{int(time.time()*1000) % 1_000_000}_{random.randint(100,999)}"
    result = {
        "kiosk": kiosk_label, "name": name, "started_at": datetime.now(timezone.utc).isoformat(),
        "success": False, "user_id": None, "qr_code": None, "total_score_end": None,
        "steps_completed": [], "error": None,
    }
    t0 = time.perf_counter()

    try:
        r = session.post(f"{base_url}/register", json={"name": name}, timeout=10)
        r.raise_for_status()
        user = r.json()
        result["steps_completed"].append("register")
        result["user_id"] = user["id"]
        result["qr_code"] = user["qr_code"]
        logger.info(f"register ok user_id={user['id']} (session={name})")
        sleep_think(think_min, think_max, stop_event)

        r = session.get(f"{base_url}/resume/{result['qr_code']}", timeout=10)
        r.raise_for_status()
        result["steps_completed"].append("resume_by_qr")
        logger.info(f"resume_by_qr ok user_id={result['user_id']}")
        sleep_think(think_min, think_max, stop_event)

        r = session.post(f"{base_url}/content/{card1_id}/view?user_id={result['user_id']}", timeout=10)
        r.raise_for_status()
        result["steps_completed"].append("mark_viewed")
        logger.info(f"mark_viewed ok user_id={result['user_id']}")
        sleep_think(think_min, think_max, stop_event)

        r = session.post(f"{base_url}/content/{card1_id}/start-quiz?user_id={result['user_id']}", timeout=10)
        r.raise_for_status()
        questions = r.json()
        result["steps_completed"].append("start_quiz")
        logger.info(f"start_quiz ok user_id={result['user_id']} questions={len(questions)}")
        sleep_think(think_min, think_max, stop_event)

        for q in questions:
            r = session.post(f"{base_url}/quiz/answer", json={
                "user_id": result["user_id"], "question_id": q["question_id"], "selected_option": "a"
            }, timeout=10)
            r.raise_for_status()
            sleep_think(think_min * 0.5, think_max * 0.5, stop_event)  # answering is quicker per-question
        result["steps_completed"].append("answer_all_questions")
        logger.info(f"answer_all_questions ok user_id={result['user_id']}")

        r = session.post(f"{base_url}/quiz/submit?user_id={result['user_id']}&content_id={card1_id}", timeout=10)
        r.raise_for_status()
        result["steps_completed"].append("submit_quiz")
        logger.info(f"submit_quiz ok user_id={result['user_id']}")
        sleep_think(think_min, think_max, stop_event)

        for cid in card_quiz_ids:
            fake_score = random.choice([0, 10, 20, 30, 40, 50])
            r = session.post(
                f"{base_url}/content/{cid}/submit-card-quiz?user_id={result['user_id']}&score_earned={fake_score}",
                timeout=10
            )
            r.raise_for_status()
            sleep_think(think_min * 0.5, think_max * 0.5, stop_event)
        result["steps_completed"].append("submit_card_quizzes_2_4")
        logger.info(f"submit_card_quizzes_2_4 ok user_id={result['user_id']}")

        r = session.get(f"{base_url}/users/{result['user_id']}/stats", timeout=10)
        r.raise_for_status()
        stats = r.json()
        result["total_score_end"] = stats.get("total_score")
        result["steps_completed"].append("get_final_stats")
        logger.info(f"get_final_stats ok user_id={result['user_id']} score={result['total_score_end']}")

        result["success"] = True

    except Exception as e:
        result["error"] = str(e)
        logger.error(f"session FAILED (session={name}, user_id={result['user_id']}): {e}")

    result["duration_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    result["ended_at"] = datetime.now(timezone.utc).isoformat()
    return result


# --------------------------------------------------------------------------
# Kiosk worker loop — keeps running sessions until end_time or stop_event
# --------------------------------------------------------------------------

def kiosk_worker(kiosk_label, base_url, verify, card1_id, card_quiz_ids,
                  think_min, think_max, pause_min, pause_max,
                  end_time, stop_event, recorder, stats, logger):
    threading.current_thread().name = kiosk_label
    session_num = 0
    while time.time() < end_time and not stop_event.is_set():
        session_num += 1
        logger.info(f"--- starting session #{session_num} ---")
        result = run_one_session(logger, base_url, verify, kiosk_label, card1_id, card_quiz_ids,
                                  think_min, think_max, stop_event)
        recorder.record(result)
        stats.record(kiosk_label, result["success"], result["duration_ms"], result.get("error"))

        remaining = end_time - time.time()
        if remaining <= 0 or stop_event.is_set():
            break
        pause = min(random.uniform(pause_min, pause_max), remaining)
        if pause > 0:
            logger.info(f"pausing {pause:.1f}s before next visitor")
            time.sleep(pause)

    logger.info(f"kiosk worker finished — {session_num} sessions run")


# --------------------------------------------------------------------------
# Uptime poller (runs the whole soak duration)
# --------------------------------------------------------------------------

def uptime_worker(base_url, endpoint, verify, interval_s, timeout_s, end_time, stop_event, logger, uptime_state):
    threading.current_thread().name = "uptime"
    url = f"{base_url.rstrip('/')}{endpoint}"
    logger.info(f"uptime poller started — polling {url} every {interval_s}s")
    while time.time() < end_time and not stop_event.is_set():
        t0 = time.perf_counter()
        try:
            r = requests.get(url, timeout=timeout_s, verify=verify)
            dt_ms = (time.perf_counter() - t0) * 1000
            uptime_state["total"] += 1
            uptime_state["latencies"].append(dt_ms)
            if r.status_code < 400:
                uptime_state["ok"] += 1
            else:
                uptime_state["fail"] += 1
                uptime_state["failure_log"].append(
                    {"time": datetime.now(timezone.utc).isoformat(), "reason": f"HTTP {r.status_code}"})
                logger.warning(f"uptime check got HTTP {r.status_code}")
        except Exception as e:
            uptime_state["total"] += 1
            uptime_state["fail"] += 1
            uptime_state["failure_log"].append({"time": datetime.now(timezone.utc).isoformat(), "reason": str(e)})
            logger.warning(f"uptime check failed: {e}")

        elapsed = time.perf_counter() - t0
        time.sleep(max(0.0, interval_s - elapsed))
    logger.info("uptime poller finished")


# --------------------------------------------------------------------------
# Periodic progress reporter
# --------------------------------------------------------------------------

def progress_reporter(stats, uptime_state, end_time, interval_s, stop_event, logger):
    threading.current_thread().name = "progress"
    while time.time() < end_time and not stop_event.is_set():
        time.sleep(min(interval_s, max(0, end_time - time.time())))
        if stop_event.is_set():
            break
        snap = stats.snapshot()
        remaining_min = max(0, (end_time - time.time()) / 60)
        uptime_pct = (100.0 * uptime_state["ok"] / uptime_state["total"]) if uptime_state["total"] else 0
        logger.info(
            f"=== PROGRESS === sessions={snap['total_sessions']} "
            f"success={snap['successes']} fail={snap['failures']} "
            f"rate={snap['success_rate_pct']}% avg_session={snap['avg_session_ms']}ms "
            f"uptime={uptime_pct:.1f}% remaining={remaining_min:.0f}min"
        )


# --------------------------------------------------------------------------
# DB verification (read-only, samples recent sessions from the JSONL file)
# --------------------------------------------------------------------------

def verify_db(logger, db_path, jsonl_path, sample_size):
    logger.info(f"--- DB verification (sampling last {sample_size} sessions) ---")
    try:
        with open(jsonl_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except FileNotFoundError:
        logger.warning("no session JSONL file found — skipping DB check")
        return

    successes = [json.loads(l) for l in lines if json.loads(l).get("success")]
    sample = successes[-sample_size:]
    if not sample:
        logger.warning("no successful sessions to verify")
        return

    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=5)
    except Exception as e:
        logger.error(f"could not open DB read-only at {db_path}: {e}")
        return

    ok_count = 0
    problems = []
    try:
        cur = conn.cursor()
        for r in sample:
            uid = r["user_id"]
            cur.execute("SELECT total_score FROM users WHERE id = ?", (uid,))
            row = cur.fetchone()
            if not row:
                problems.append(f"user_id {uid} missing from users table")
                continue
            db_score = row[0]
            if db_score != r["total_score_end"]:
                problems.append(f"user_id {uid}: db total_score={db_score} != API {r['total_score_end']}")
                continue

            cur.execute("SELECT COUNT(*) FROM progress WHERE user_id = ?", (uid,))
            prog_count = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM quiz_attempts WHERE user_id = ? AND answered_at IS NOT NULL", (uid,))
            answered_count = cur.fetchone()[0]

            if prog_count == 0 or answered_count == 0:
                problems.append(f"user_id {uid}: prog_rows={prog_count} answered_questions={answered_count}")
                continue

            ok_count += 1
    finally:
        conn.close()

    logger.info(f"DB verification: {ok_count}/{len(sample)} sampled sessions fully consistent")
    if problems:
        logger.warning(f"{len(problems)} inconsistencies found:")
        for p in problems[:25]:
            logger.warning(f"  - {p}")
        if len(problems) > 25:
            logger.warning(f"  ... and {len(problems) - 25} more")
    else:
        logger.info("No inconsistencies found in sampled sessions.")


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def main():
    args = parse_args()
    verify = not args.insecure
    logger, log_path, jsonl_path, summary_path = setup_logging(args.log_dir)

    duration_s = args.duration_hours * 3600
    end_time = time.time() + duration_s
    stop_event = threading.Event()

    def _handle_sigint(signum, frame):
        logger.warning("Ctrl+C received — stopping workers and finalizing report...")
        stop_event.set()

    signal.signal(signal.SIGINT, _handle_sigint)

    logger.info("=" * 70)
    logger.info("Employee Engagement Booth — SOAK TEST")
    logger.info(f"Base URL     : {args.base_url}")
    logger.info(f"DB path      : {args.db_path}")
    logger.info(f"Kiosks       : {args.num_kiosks}")
    logger.info(f"Duration     : {args.duration_hours}h ({duration_s:.0f}s)")
    logger.info(f"TLS verify   : {verify}")
    logger.info(f"Log file     : {log_path}")
    logger.info(f"Session log  : {jsonl_path}")
    logger.info("=" * 70)

    recorder = SessionRecorder(jsonl_path)
    stats = Stats()
    uptime_state = {"total": 0, "ok": 0, "fail": 0, "latencies": [], "failure_log": []}

    threads = []

    for i in range(args.num_kiosks):
        t = threading.Thread(
            target=kiosk_worker,
            args=(f"kiosk{i+1}", args.base_url, verify, args.card1_content_id, args.card_quiz_ids,
                  args.think_min, args.think_max, args.pause_min, args.pause_max,
                  end_time, stop_event, recorder, stats, logger),
            daemon=True,
        )
        threads.append(t)
        t.start()

    if not args.skip_uptime:
        ut = threading.Thread(
            target=uptime_worker,
            args=(args.base_url, args.uptime_endpoint, verify, args.uptime_interval, args.uptime_timeout,
                  end_time, stop_event, logger, uptime_state),
            daemon=True,
        )
        threads.append(ut)
        ut.start()

    pt = threading.Thread(
        target=progress_reporter,
        args=(stats, uptime_state, end_time, args.progress_every_min * 60, stop_event, logger),
        daemon=True,
    )
    threads.append(pt)
    pt.start()

    # Wait for natural completion or Ctrl+C
    try:
        while time.time() < end_time and not stop_event.is_set():
            time.sleep(1)
    finally:
        stop_event.set()
        for t in threads:
            t.join(timeout=15)

    recorder.close()

    # --- Final report ---
    snap = stats.snapshot()
    uptime_pct = (100.0 * uptime_state["ok"] / uptime_state["total"]) if uptime_state["total"] else 0
    avg_latency = (sum(uptime_state["latencies"]) / len(uptime_state["latencies"])
                   if uptime_state["latencies"] else None)
    max_latency = max(uptime_state["latencies"]) if uptime_state["latencies"] else None

    logger.info("=" * 70)
    logger.info("FINAL REPORT")
    logger.info(f"Total sessions run : {snap['total_sessions']}")
    logger.info(f"Successful         : {snap['successes']}")
    logger.info(f"Failed             : {snap['failures']}")
    logger.info(f"Success rate       : {snap['success_rate_pct']}%")
    logger.info(f"Avg session time   : {snap['avg_session_ms']} ms")
    for kiosk, k in snap["per_kiosk"].items():
        logger.info(f"  {kiosk}: sessions={k['sessions']} success={k['success']} fail={k['fail']}")
    if snap["top_errors"]:
        logger.info("Top errors:")
        for err, count in snap["top_errors"]:
            logger.info(f"  ({count}x) {err}")
    logger.info(f"Uptime checks      : {uptime_state['total']}")
    logger.info(f"Uptime %           : {uptime_pct:.2f}%")
    logger.info(f"Avg latency        : {avg_latency:.1f} ms" if avg_latency else "Avg latency        : n/a")
    logger.info(f"Max latency        : {max_latency:.1f} ms" if max_latency else "Max latency        : n/a")
    logger.info("=" * 70)

    if not args.skip_db_check:
        verify_db(logger, args.db_path, jsonl_path, args.db_check_sample)

    summary = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "base_url": args.base_url,
        "duration_hours_requested": args.duration_hours,
        "duration_seconds_actual": round(time.time() - (end_time - duration_s), 1),
        "flow_stats": snap,
        "uptime": {
            "total_checks": uptime_state["total"],
            "ok": uptime_state["ok"],
            "fail": uptime_state["fail"],
            "uptime_pct": round(uptime_pct, 2),
            "avg_latency_ms": round(avg_latency, 1) if avg_latency else None,
            "max_latency_ms": round(max_latency, 1) if max_latency else None,
            "failure_log": uptime_state["failure_log"],
        },
        "log_file": log_path,
        "session_jsonl": jsonl_path,
    }
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    logger.info(f"Summary written to {summary_path}")

    sys.exit(0 if snap["failures"] == 0 and uptime_state["fail"] == 0 else 1)


if __name__ == "__main__":
    main()