#!/usr/bin/env python3
"""
booth_load_test.py
===================
Test automation for the Employee Engagement Booth App.

What it does
------------
1. USER FLOW TEST — spins up N concurrent simulated users (default 4) that each:
     register -> resume by QR -> view Card 1 content -> preview/lock a topic
     -> start-quiz (topic-aware) -> answer every MCQ -> submit quiz
     -> submit a card-quiz score for Cards 2-4 -> fetch final stats
   All four users run in parallel threads to mimic four kiosks being used
   at the same moment (the actual event-day scenario).

2. DB VERIFICATION — after the flow completes, opens kiosk.db directly
   (read-only) and cross-checks that Users / Progress / QuizAttempts rows
   were actually written and are internally consistent for each test user.

3. UPTIME TEST — separately (or at the same time, with --concurrent-uptime)
   polls a lightweight endpoint on an interval for a configurable duration,
   and reports uptime %, average/最大 latency, and any failures with
   timestamps — useful for a soak test on the host laptop before doors open.

Usage
-----
    python booth_load_test.py --base-url https://192.168.1.11:8000 --db-path ./kiosk.db

    # Just the 4-user concurrent flow, skip uptime:
    python booth_load_test.py --skip-uptime

    # Just an uptime soak test for 10 minutes, polling every 5s:
    python booth_load_test.py --skip-flow --uptime-duration 600 --uptime-interval 5

    # Run flow and uptime test AT THE SAME TIME (closer to real event load):
    python booth_load_test.py --concurrent-uptime --uptime-duration 120

Requirements
------------
    pip install requests

Notes
-----
- The backend uses a self-signed mkcert certificate. If the machine running
  this script hasn't imported the mkcert root CA (like the kiosk laptops
  do via kiosk-setup.ps1), pass --insecure to skip TLS verification for
  testing purposes only.
- DB verification opens SQLite in read-only mode (uri=... mode=ro) so it
  can safely run against the live kiosk.db while the backend has it open.
"""

import argparse
import json
import random
import sqlite3
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone

import requests
from requests.packages.urllib3.exceptions import InsecureRequestWarning

requests.packages.urllib3.disable_warnings(InsecureRequestWarning)


# --------------------------------------------------------------------------
# Config / CLI
# --------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser(description="Booth app concurrent load + uptime test")
    p.add_argument("--base-url", default="https://192.168.1.11:8000",
                    help="Backend base URL (matches API_BASE_URL / HOST_URL)")
    p.add_argument("--db-path", default="kiosk.db",
                    help="Path to kiosk.db (run from the backend/ folder, or pass full path)")
    p.add_argument("--num-users", type=int, default=4, help="Number of concurrent simulated users")
    p.add_argument("--card1-content-id", type=int, default=1, help="Content ID for the video/topic card")
    p.add_argument("--card-quiz-ids", type=int, nargs="*", default=[2, 3, 4],
                    help="Content IDs for the myth/emoji/match card-quiz cards")
    p.add_argument("--insecure", action="store_true", help="Skip TLS certificate verification")
    p.add_argument("--skip-flow", action="store_true", help="Skip the 4-user workflow test")
    p.add_argument("--skip-uptime", action="store_true", help="Skip the uptime/soak test")
    p.add_argument("--skip-db-check", action="store_true", help="Skip the post-run DB verification")
    p.add_argument("--concurrent-uptime", action="store_true",
                    help="Run the uptime poller WHILE the user flow test runs, instead of after")
    p.add_argument("--uptime-endpoint", default="/content", help="Endpoint to poll for uptime checks")
    p.add_argument("--uptime-duration", type=int, default=60, help="Uptime test duration in seconds")
    p.add_argument("--uptime-interval", type=float, default=2.0, help="Seconds between uptime polls")
    p.add_argument("--uptime-timeout", type=float, default=5.0, help="Per-request timeout in seconds")
    p.add_argument("--results-file", default=None,
                    help="Optional path to write a JSON results summary")
    return p.parse_args()


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def ts():
    return datetime.now(timezone.utc).strftime("%H:%M:%S.%f")[:-3]


def log(user_label, msg, ok=True):
    marker = "OK " if ok else "FAIL"
    print(f"[{ts()}] [{user_label:>8}] {marker} {msg}")


# --------------------------------------------------------------------------
# Single simulated user's full journey
# --------------------------------------------------------------------------

@dataclass
class UserResult:
    label: str
    name: str
    success: bool = False
    user_id: int | None = None
    qr_code: str | None = None
    error: str | None = None
    total_score_end: int | None = None
    steps: list = field(default_factory=list)
    step_timings_ms: dict = field(default_factory=dict)


def run_user_flow(base_url, verify, label, card1_id, card_quiz_ids, session=None):
    s = session or requests.Session()
    s.verify = verify
    result = UserResult(label=label, name=f"LoadTest_{label}_{random.randint(1000,9999)}")

    def step(name, fn):
        t0 = time.perf_counter()
        try:
            out = fn()
            dt = (time.perf_counter() - t0) * 1000
            result.step_timings_ms[name] = round(dt, 1)
            result.steps.append(name)
            log(label, f"{name} ({dt:.0f}ms)")
            return out
        except Exception as e:
            dt = (time.perf_counter() - t0) * 1000
            result.step_timings_ms[name] = round(dt, 1)
            log(label, f"{name} -> {e}", ok=False)
            raise

    try:
        # 1. Register
        def _register():
            r = s.post(f"{base_url}/register", json={"name": result.name}, timeout=10)
            r.raise_for_status()
            return r.json()
        user = step("register", _register)
        result.user_id = user["id"]
        result.qr_code = user["qr_code"]

        # 2. Resume by QR (simulates scanning the badge back in)
        step("resume_by_qr", lambda: s.get(f"{base_url}/resume/{result.qr_code}", timeout=10).raise_for_status())

        # 3. Mark Card 1 content viewed
        step("mark_viewed", lambda: s.post(
            f"{base_url}/content/{card1_id}/view?user_id={result.user_id}", timeout=10
        ).raise_for_status())

        # 4. Start topic-aware quiz for Card 1 (no topic passed = falls back to full pool,
        #    mirroring what happens if a topic has no tagged questions yet)
        def _start_quiz():
            r = s.post(f"{base_url}/content/{card1_id}/start-quiz?user_id={result.user_id}", timeout=10)
            r.raise_for_status()
            return r.json()
        questions = step("start_quiz", _start_quiz)

        # 5. Answer every question (always pick option 'a' — deterministic, not testing scoring logic here)
        def _answer_all():
            for q in questions:
                r = s.post(f"{base_url}/quiz/answer", json={
                    "user_id": result.user_id,
                    "question_id": q["question_id"],
                    "selected_option": "a"
                }, timeout=10)
                r.raise_for_status()
            return True
        step("answer_all_questions", _answer_all)

        # 6. Submit Card 1 quiz
        def _submit_quiz():
            r = s.post(f"{base_url}/quiz/submit?user_id={result.user_id}&content_id={card1_id}", timeout=10)
            r.raise_for_status()
            return r.json()
        step("submit_quiz", _submit_quiz)

        # 7. Simulate cards 2-4 (myth/emoji/match) — client-computed score, hits submit-card-quiz directly
        def _submit_card_quizzes():
            for cid in card_quiz_ids:
                fake_score = random.choice([0, 10, 20, 30, 40, 50])
                r = s.post(
                    f"{base_url}/content/{cid}/submit-card-quiz"
                    f"?user_id={result.user_id}&score_earned={fake_score}",
                    timeout=10
                )
                r.raise_for_status()
            return True
        step("submit_card_quizzes_2_4", _submit_card_quizzes)

        # 8. Final stats check
        def _get_stats():
            r = s.get(f"{base_url}/users/{result.user_id}/stats", timeout=10)
            r.raise_for_status()
            return r.json()
        stats = step("get_final_stats", _get_stats)
        result.total_score_end = stats.get("total_score")

        result.success = True

    except Exception as e:
        result.error = str(e)
        result.success = False

    return result


# --------------------------------------------------------------------------
# Uptime / soak test
# --------------------------------------------------------------------------

@dataclass
class UptimeSummary:
    total_checks: int = 0
    successes: int = 0
    failures: int = 0
    latencies_ms: list = field(default_factory=list)
    failure_log: list = field(default_factory=list)

    @property
    def uptime_pct(self):
        return 100.0 * self.successes / self.total_checks if self.total_checks else 0.0

    @property
    def avg_latency_ms(self):
        return round(sum(self.latencies_ms) / len(self.latencies_ms), 1) if self.latencies_ms else None

    @property
    def max_latency_ms(self):
        return round(max(self.latencies_ms), 1) if self.latencies_ms else None


def run_uptime_test(base_url, endpoint, verify, duration_s, interval_s, timeout_s, stop_event=None):
    summary = UptimeSummary()
    url = f"{base_url.rstrip('/')}{endpoint}"
    end_time = time.time() + duration_s
    print(f"\n[{ts()}] --- Uptime test started: polling {url} every {interval_s}s for {duration_s}s ---")

    while time.time() < end_time:
        if stop_event is not None and stop_event.is_set():
            break
        t0 = time.perf_counter()
        try:
            r = requests.get(url, timeout=timeout_s, verify=verify)
            dt_ms = (time.perf_counter() - t0) * 1000
            summary.total_checks += 1
            summary.latencies_ms.append(dt_ms)
            if r.status_code < 400:
                summary.successes += 1
            else:
                summary.failures += 1
                summary.failure_log.append({"time": ts(), "reason": f"HTTP {r.status_code}"})
                log("uptime", f"HTTP {r.status_code} from {endpoint}", ok=False)
        except Exception as e:
            dt_ms = (time.perf_counter() - t0) * 1000
            summary.total_checks += 1
            summary.failures += 1
            summary.failure_log.append({"time": ts(), "reason": str(e)})
            log("uptime", f"request failed: {e}", ok=False)

        time.sleep(max(0.0, interval_s - (time.perf_counter() - t0) / 1000.0))

    print(f"[{ts()}] --- Uptime test finished ---")
    return summary


# --------------------------------------------------------------------------
# DB verification (read-only)
# --------------------------------------------------------------------------

def verify_db(db_path, user_results):
    print(f"\n[{ts()}] --- Verifying kiosk.db state (read-only) ---")
    ok_count = 0
    problems = []
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=5)
    except Exception as e:
        print(f"[{ts()}] Could not open DB at {db_path} read-only: {e}")
        return

    try:
        cur = conn.cursor()
        for ur in user_results:
            if not ur.success or ur.user_id is None:
                continue

            label_ok = True

            # Users row + total_score sanity
            cur.execute("SELECT name, total_score FROM users WHERE id = ?", (ur.user_id,))
            row = cur.fetchone()
            if not row:
                problems.append(f"[{ur.label}] user id {ur.user_id} missing from users table")
                label_ok = False
            else:
                db_name, db_score = row
                if db_score != ur.total_score_end:
                    problems.append(
                        f"[{ur.label}] users.total_score={db_score} != API-reported {ur.total_score_end}"
                    )
                    label_ok = False

            # Progress rows: expect one per content item touched (card1 + card_quiz_ids)
            cur.execute("SELECT content_id, status FROM progress WHERE user_id = ?", (ur.user_id,))
            prog_rows = cur.fetchall()
            statuses = {cid: status for cid, status in prog_rows}
            if not statuses:
                problems.append(f"[{ur.label}] no progress rows found")
                label_ok = False

            # QuizAttempts: card 1 should have one attempt row per assigned/answered question
            cur.execute("SELECT COUNT(*) FROM quiz_attempts WHERE user_id = ? AND answered_at IS NOT NULL",
                        (ur.user_id,))
            answered_count = cur.fetchone()[0]
            if answered_count == 0:
                problems.append(f"[{ur.label}] no answered quiz_attempts rows found")
                label_ok = False

            if label_ok:
                ok_count += 1
                log(ur.label, f"DB check passed (score={ur.total_score_end}, "
                               f"progress_rows={len(prog_rows)}, answered_questions={answered_count})")
            else:
                log(ur.label, "DB check FAILED (see problems below)", ok=False)

    finally:
        conn.close()

    print(f"\n[{ts()}] DB verification: {ok_count} user(s) fully consistent.")
    if problems:
        print("Problems found:")
        for p in problems:
            print(f"  - {p}")
    else:
        print("No inconsistencies found.")


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def main():
    args = parse_args()
    verify = not args.insecure

    print("=" * 70)
    print("Employee Engagement Booth — Load / Uptime Test")
    print(f"Base URL   : {args.base_url}")
    print(f"DB path    : {args.db_path}")
    print(f"Users      : {args.num_users}")
    print(f"TLS verify : {verify}")
    print("=" * 70)

    user_results = []
    uptime_summary = None
    stop_event = threading.Event()

    uptime_thread = None
    if not args.skip_uptime and args.concurrent_uptime:
        def _bg_uptime():
            nonlocal uptime_summary
            uptime_summary = run_uptime_test(
                args.base_url, args.uptime_endpoint, verify,
                args.uptime_duration, args.uptime_interval, args.uptime_timeout,
                stop_event=stop_event
            )
        uptime_thread = threading.Thread(target=_bg_uptime, daemon=True)
        uptime_thread.start()

    # --- 4 (or N) concurrent users ---
    if not args.skip_flow:
        print(f"\n[{ts()}] --- Starting {args.num_users} concurrent user flows ---")
        t0 = time.perf_counter()
        with ThreadPoolExecutor(max_workers=args.num_users) as pool:
            futures = [
                pool.submit(
                    run_user_flow, args.base_url, verify, f"kiosk{i+1}",
                    args.card1_content_id, args.card_quiz_ids
                )
                for i in range(args.num_users)
            ]
            for f in as_completed(futures):
                user_results.append(f.result())
        total_dt = time.perf_counter() - t0
        user_results.sort(key=lambda r: r.label)

        print(f"\n[{ts()}] --- User flow test finished in {total_dt:.1f}s ---")
        passed = sum(1 for r in user_results if r.success)
        print(f"Result: {passed}/{len(user_results)} users completed the full flow successfully.\n")
        for r in user_results:
            status = "PASS" if r.success else f"FAIL ({r.error})"
            print(f"  {r.label:>8}  user_id={r.user_id!s:<6}  score={r.total_score_end!s:<6}  {status}")

    if uptime_thread:
        uptime_thread.join()

    # --- sequential uptime test (if not already run concurrently) ---
    if not args.skip_uptime and not args.concurrent_uptime:
        uptime_summary = run_uptime_test(
            args.base_url, args.uptime_endpoint, verify,
            args.uptime_duration, args.uptime_interval, args.uptime_timeout
        )

    if uptime_summary:
        print(f"\n[{ts()}] --- Uptime summary ---")
        print(f"Checks          : {uptime_summary.total_checks}")
        print(f"Successes       : {uptime_summary.successes}")
        print(f"Failures        : {uptime_summary.failures}")
        print(f"Uptime          : {uptime_summary.uptime_pct:.2f}%")
        print(f"Avg latency     : {uptime_summary.avg_latency_ms} ms")
        print(f"Max latency     : {uptime_summary.max_latency_ms} ms")
        if uptime_summary.failure_log:
            print("Failure timestamps:")
            for f in uptime_summary.failure_log:
                print(f"  - {f['time']}: {f['reason']}")

    # --- DB verification ---
    if not args.skip_db_check and not args.skip_flow and user_results:
        verify_db(args.db_path, user_results)

    # --- optional JSON results dump ---
    if args.results_file:
        summary_obj = {
            "run_at": datetime.now(timezone.utc).isoformat(),
            "base_url": args.base_url,
            "users": [
                {
                    "label": r.label, "name": r.name, "user_id": r.user_id,
                    "success": r.success, "error": r.error,
                    "total_score_end": r.total_score_end,
                    "step_timings_ms": r.step_timings_ms,
                }
                for r in user_results
            ],
            "uptime": None if not uptime_summary else {
                "total_checks": uptime_summary.total_checks,
                "successes": uptime_summary.successes,
                "failures": uptime_summary.failures,
                "uptime_pct": uptime_summary.uptime_pct,
                "avg_latency_ms": uptime_summary.avg_latency_ms,
                "max_latency_ms": uptime_summary.max_latency_ms,
                "failure_log": uptime_summary.failure_log,
            },
        }
        with open(args.results_file, "w") as f:
            json.dump(summary_obj, f, indent=2)
        print(f"\n[{ts()}] Results written to {args.results_file}")

    # Non-zero exit if anything failed, useful for CI-style runs
    flow_failed = any(not r.success for r in user_results) if user_results else False
    uptime_failed = uptime_summary.failures > 0 if uptime_summary else False
    if flow_failed or uptime_failed:
        sys.exit(1)


if __name__ == "__main__":
    main()