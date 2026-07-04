### Dev setup

---
## 1. Architecture, in brief

- **Stack:** Angular (frontend) + FastAPI/Python (backend) + SQLite.
- **Model:** one host machine runs backend + DB + serves the built frontend. Kiosk laptops and guest phones are just browsers pointed at the host's IP — there's no separate frontend deployment.
- **Two-window UI model:** the kiosk's main window (`Menu`) never navigates away — it just shows status badges. A second monitor window (opened via `window.open('content-window', ...)`) handles the actual content viewing and quiz, then reverts to a static idle page. The quiz window talks back to the Menu window via `window.opener.postMessage()`; **Menu owns the reset-to-Resume behavior**, not the quiz page.
- **Progress is tied to the user, not the device** — resumable from any kiosk via QR scan or manual ID entry, backed by `Progress` and `QuizAttempts` tables.
- **HTTPS is only required for the event/LAN scenario**, because `getUserMedia()` (used for QR scanning) requires a secure context. `localhost` is a browser-recognized secure-context exception — **you do not need mkcert or HTTPS for local development.** Plain HTTP on `localhost` is fine for everything, including camera access.

---

## 2. Repo layout

```
employee-engagement-booth/
├── backend/
│   ├── main.py              # FastAPI app, all routes, WebSocket manager
│   ├── models.py            # SQLAlchemy models
│   ├── schemas.py           # Pydantic request/response schemas
│   ├── database.py          # engine, SessionLocal, Base, get_db()
│   ├── config.py            # HOST_URL (used for QR code generation)
│   ├── create_tables.py     # run once to create the SQLite schema
│   ├── seed_data.py         # wipe-and-reseed ContentItems + QuizQuestions
│   ├── check_tables.py      # quick sanity-check script
│   ├── requirements.txt
│   ├── venv/                # not committed
│   ├── certs/               # mkcert output — only relevant for event day
│   └── *.ps1                # event-day automation — not needed for dev
└── frontend/employee-engagement-booth-app/
    └── src/app/
        ├── constants.ts          # API_BASE_URL — see note in Section 4
        ├── screen_config.ts      # second-monitor offset/resolution
        ├── app.routes.ts
        ├── services/api.ts       # all HTTP calls
        └── pages/
            ├── resume/           # default idle screen, resume by ID or QR
            ├── register/         # name-only sign-up
            ├── qr-display/       # shows QR + ID after registering
            ├── menu/             # main kiosk window
            ├── quiz/             # second-monitor window
            └── leaderboard/      # WebSocket-driven live standings
```

---

## 3. One-time environment setup

**Prerequisites:** Python 3.12, Node 24 + npm 11, Angular CLI, Git.

```powershell
git clone <your-repo-url>
cd employee-engagement-booth
```

**Backend:**

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python create_tables.py
python seed_data.py
```

**Frontend:**

```powershell
cd frontend\employee-engagement-booth-app
npm install
```

---

## 4. Running locally (dev mode)

**Backend** — plain HTTP, no SSL flags needed for local dev:

```powershell
cd backend
venv\Scripts\activate
uvicorn main:app --reload --port 8000
```

`--reload` gives you hot-reload on backend changes. This is different from event day, where you'd use `start-host.ps1` with SSL flags and no `--reload`.

**Frontend** — use `ng serve` rather than a static build, so you get hot-reload too:

```powershell
cd frontend\employee-engagement-booth-app
ng serve
```

This serves on `http://localhost:4200`. FastAPI's CORS config already allows `http://localhost:4200` explicitly (plus a wildcard `*` for event-day LAN access), so no CORS changes are needed.

### ⚠️ `constants.ts` / `config.py` are shared between dev and event configs

`API_BASE_URL` in `constants.ts` and `HOST_URL` in `config.py` currently hold **whatever IP was last used for an event** (e.g. `192.168.1.6`), not `localhost`. For local dev, you'll want to point `constants.ts` at:

```typescript
export const API_BASE_URL = 'http://localhost:8000';
```

**Remember to not accidentally commit this dev value**, and remember to point it back to the LAN IP before an event (this is exactly what `start-host.ps1` automates on the host side — it doesn't touch anything while you're just running `ng serve` locally). If this back-and-forth gets annoying, an easy improvement would be splitting this into Angular's `environment.ts` / `environment.prod.ts` files instead of a single hardcoded constant — flagging this as a nice-to-have, not yet done.

---

## 5. Database

Wipe-and-reseed pattern, safe to run anytime:

```powershell
python seed_data.py
```

- Wipes `QuizQuestions` then `ContentItems` (FK order matters).
- Reseeds with **pinned IDs** (`ContentItems.id` 1–4) so existing `Progress`/`QuizAttempts` rows referencing them survive a reseed.
- **Never touches** `Users`, `Progress`, or `QuizAttempts` — so real event data is safe even if you reseed content mid-event.
- Current pool: 7 questions per content item, 5 drawn per quiz (`ContentItems.number_of_questions`).

Quick check:

```powershell
python check_tables.py
```

### Schema summary

| Table | Purpose |
|---|---|
| `Users` | id, name, qr_code (unique), total_score, created_date |
| `ContentItems` | 4 fixed rows — title, content_type, url, number_of_questions |
| `QuizQuestions` | question pool per content item, `points` varies per question |
| `Progress` | one row per (user, content) — status + score for that content item |
| `QuizAttempts` | one row per assigned question — locks the draw the moment questions are assigned; `selected_option`/`is_correct`/`answered_at` are null until answered |

`Progress` = dashboard-level status per content item. `QuizAttempts` = per-question audit trail and the actual locking mechanism.

---

## 6. API reference

| Method | Path | Notes |
|---|---|---|
| GET | `/` | Health check |
| POST | `/register` | Creates user, generates `qr_code` via `uuid4()` |
| GET | `/qr/{qr_code}` | Streams a PNG QR image |
| GET | `/resume/{qr_code}` | Enriched: user + all 4 progress rows (synthesizes `not_started`) + assigned questions |
| GET | `/users/{user_id}` | Resume by manual numeric ID |
| GET | `/content` | List all 4 content items |
| POST | `/content/{content_id}/view?user_id=` | Marks viewed, creates `Progress` row if missing |
| GET | `/progress/{user_id}` | Per-user progress across all content |
| POST | `/content/{content_id}/start-quiz?user_id=` | Draws questions, locks via `QuizAttempts` — **idempotent**, see gotcha below |
| POST | `/quiz/answer` | Submits one answer |
| POST | `/quiz/submit?user_id=&content_id=` | Tallies score, updates totals, broadcasts to leaderboard WS |
| GET | `/test-display` | Static HTML for second-screen idle state |
| WS | `/ws/leaderboard` | Sends standings on connect, broadcasts on every `quiz/submit` |
| GET | `/{full_path:path}` | SPA catch-all — serves the Angular build, falls back to `index.html` |

`quiz/submit` is the only `async def` endpoint, since it `await`s the WebSocket broadcast.

---

## 7. Frontend routes

| Path | Component | Notes |
|---|---|---|
| `` | — | redirects to `/resume` |
| `/resume` | Resume | default idle screen; also where Menu resets to post-quiz |
| `/register` | Register | name-only sign-up |
| `/qr/:userId/:qrCode` | QrDisplay | shown right after registering |
| `/menu/:userId` | Menu | main kiosk window |
| `/quiz/:userId/:contentId` | Quiz | opens in the second-monitor window |
| `/leaderboard` | Leaderboard | WebSocket live standings |

There is no `/login` route — it was retired in favor of the separate `/resume` and `/register` pages. If you find a stale reference to `/login` anywhere (docs, bookmarks), it needs updating.

---

## 8. Known gotchas when testing locally

- **`start-quiz` is idempotent and can't be rerolled** short of a direct DB edit. If you're manually retesting the full flow, **always register a fresh test user** rather than reusing one that's already been assigned questions for a content item.
- **Any async callback outside Angular's zone needs `zone.run()`.** This includes WebSocket handlers (see `leaderboard.ts`) and anything from `html5-qrcode`'s scan loop (see the QR scanner in the Resume page) — otherwise the UI silently doesn't update even though the underlying state is correct.
- **`html5-qrcode` teardown must be awaited in order**: `await scanner.stop()` before `.clear()`, or you'll hit race-condition bugs on unmount.
- **Mixed content blocks silently.** A QR code generated while `HOST_URL` was `http://` won't scan on an `https://` page — this looks like a scanner bug but is browser security behavior. Re-register the test user to get a fresh QR if you're testing across a protocol change.
- **WebSocket URL must match protocol**: `wss://` when `API_BASE_URL` is `https://`, `ws://` when it's `http://`. Locally with `http://localhost:8000` this isn't an issue; it only bites when testing over HTTPS/LAN.
- **`postMessage` between Menu and Quiz windows depends on `window.opener` staying intact.** If you close and manually reopen the Menu window during testing, the quiz-complete message won't be received and the badge won't update — this is a known v1 limitation, not a bug to chase.

---

## 9. Testing

Each page/service has a generated `*.spec.ts` — currently smoke tests only (`should create`). Run with:

```powershell
ng test
```

No backend test suite exists yet; `check_tables.py` is the closest thing to a sanity check.

---
