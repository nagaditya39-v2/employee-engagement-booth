from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from typing import List

import uuid, qrcode, io, random, models, schemas, os

from database import get_db
from config import HOST_URL

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://127.0.0.1:4200", "*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, data: dict):
        for connection in self.active_connections:
            await connection.send_json(data)

manager = ConnectionManager()


@app.websocket("/ws/leaderboard")
async def leaderboard_ws(websocket: WebSocket, db: Session = Depends(get_db)):
    await manager.connect(websocket)
    try:
        # Send current standings immediately on connect
        users = db.query(models.Users).order_by(models.Users.total_score.desc()).all()
        standings = [{"id": u.id, "name": u.name, "score": u.total_score} for u in users]
        await websocket.send_json(standings)

        # Keep connection alive, wait for client to disconnect
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.post("/register", response_model=schemas.UserOut)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    qr_token = str(uuid.uuid4())

    new_user = models.Users(
        name=user.name,
        qr_code=qr_token,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user

@app.get("/qr/{qr_code}")
def get_qr_code(qr_code: str):
    resume_url = f"{HOST_URL}/resume/{qr_code}"

    img = qrcode.make(resume_url)

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)

    return StreamingResponse(buffer, media_type="image/png")

@app.get("/resume/{qr_code}", response_model=schemas.UserFullOut)
def resume_user(qr_code: str, db: Session = Depends(get_db)):
    user = db.query(models.Users).filter(models.Users.qr_code == qr_code).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Build progress list (all 4 items, synthesize not_started for untouched ones)
    all_content = db.query(models.ContentItems).all()
    existing_progress = db.query(models.Progress).filter(models.Progress.user_id == user.id).all()
    progress_by_content_id = {p.content_id: p for p in existing_progress}

    progress_list = []
    for content in all_content:
        if content.id in progress_by_content_id:
            p = progress_by_content_id[content.id]
            progress_list.append(schemas.ProgressSummary(
                content_id=p.content_id,
                status=p.status,
                score_till_now=p.score_till_now
            ))
        else:
            progress_list.append(schemas.ProgressSummary(
                content_id=content.id,
                status="not_started",
                score_till_now=0
            ))

    # Build assigned questions list (only for content already quizzed)
    attempts = db.query(models.QuizAttempts, models.QuizQuestions).join(
        models.QuizQuestions, models.QuizAttempts.question_id == models.QuizQuestions.id
    ).filter(models.QuizAttempts.user_id == user.id).all()

    assigned_questions = []
    for attempt, question in attempts:
        assigned_questions.append(schemas.AssignedQuestionOut(
            question_id=question.id,
            content_id=attempt.content_id,
            question_text=question.question_text,
            option_a=question.option_a,
            option_b=question.option_b,
            option_c=question.option_c,
            option_d=question.option_d,
            selected_option=attempt.selected_option,
            answered_at=attempt.answered_at
        ))

    return schemas.UserFullOut(
        id=user.id,
        name=user.name,
        qr_code=user.qr_code,
        total_score=user.total_score,
        created_date=user.created_date,
        progress=progress_list,
        assigned_questions=assigned_questions
    )

@app.get("/users/{user_id}", response_model=schemas.UserOut)
def get_user_by_id(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.Users).filter(models.Users.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user

@app.get("/content", response_model=List[schemas.ContentItemOut])
def get_all_content(db: Session = Depends(get_db)):
    return db.query(models.ContentItems).all()

@app.post("/content/{content_id}/view", response_model=schemas.ProgressOut)
def mark_content_viewed(content_id: int, user_id: int, db: Session = Depends(get_db)):
    progress = db.query(models.Progress).filter(models.Progress.user_id == user_id, models.Progress.content_id == content_id).first()

    if not progress:
        new_progress = models.Progress(
            user_id = user_id,
            content_id = content_id,
            status = "viewed"
        )

        db.add(new_progress)
        db.commit()
        db.refresh(new_progress)

        return new_progress
    else:
        return progress

@app.get("/progress/{user_id}", response_model=List[schemas.ProgressOut])
def get_user_progress(user_id: int, db: Session = Depends(get_db)):
    all_content = db.query(models.ContentItems).all()
    existing_progress = db.query(models.Progress).filter(models.Progress.user_id == user_id).all()

    # lookup
    progress_by_content_id = {p.content_id: p for p in existing_progress}

    result = []
    for content in all_content:
        if content.id in progress_by_content_id:
            result.append(progress_by_content_id[content.id])
        else:
            result.append(models.Progress(
                id=0,
                user_id=user_id,
                content_id=content.id,
                status="not_started",
                score_till_now=0
            ))

    return result

@app.get("/test-display", response_model=None)
def test_display():
    return HTMLResponse("""
        <html>
        <body style="background:#1a1a2e; color:white; font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0;">
            <h1>Display window ready — click a card to load content here</h1>
        </body>
        </html>
    """)

@app.post("/content/{content_id}/start-quiz", response_model=List[schemas.AssignedQuestionOut])
def start_quiz(content_id: int, user_id: int, db: Session = Depends(get_db)):
    content = db.query(models.ContentItems).filter(models.ContentItems.id == content_id).first()
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")

    user = db.query(models.Users).filter(models.Users.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # If already assigned, return existing attempts instead of rerolling
    existing_attempts = db.query(models.QuizAttempts, models.QuizQuestions).join(
        models.QuizQuestions, models.QuizAttempts.question_id == models.QuizQuestions.id
    ).filter(
        models.QuizAttempts.user_id == user_id,
        models.QuizAttempts.content_id == content_id
    ).all()

    if existing_attempts:
        return [
            schemas.AssignedQuestionOut(
                question_id=q.id,
                content_id=content_id,
                question_text=q.question_text,
                option_a=q.option_a,
                option_b=q.option_b,
                option_c=q.option_c,
                option_d=q.option_d,
                selected_option=a.selected_option,
                answered_at=a.answered_at
            )
            for a, q in existing_attempts
        ]

    # Draw fresh questions from the pool
    pool = db.query(models.QuizQuestions).filter(models.QuizQuestions.content_id == content_id).all()
    if not pool:
        raise HTTPException(status_code=400, detail="No questions available for this content item")

    draw_count = min(content.number_of_questions, len(pool))
    drawn = random.sample(pool, draw_count)

    assigned = []
    for q in drawn:
        attempt = models.QuizAttempts(
            user_id=user_id,
            content_id=content_id,
            question_id=q.id,
            selected_option=None,
            is_correct=None
        )
        db.add(attempt)
        assigned.append(q)

    # Lock the quiz in Progress
    progress = db.query(models.Progress).filter(
        models.Progress.user_id == user_id,
        models.Progress.content_id == content_id
    ).first()

    if progress:
        progress.status = "quiz_assigned"
    else:
        progress = models.Progress(
            user_id=user_id,
            content_id=content_id,
            status="quiz_assigned",
            score_till_now=0
        )
        db.add(progress)

    db.commit()

    return [
        schemas.AssignedQuestionOut(
            question_id=q.id,
            content_id=content_id,
            question_text=q.question_text,
            option_a=q.option_a,
            option_b=q.option_b,
            option_c=q.option_c,
            option_d=q.option_d,
            selected_option=None,
            answered_at=None
        )
        for q in assigned
    ]


@app.post("/quiz/answer", response_model=schemas.AssignedQuestionOut)
def answer_question(payload: schemas.AnswerSubmit, db: Session = Depends(get_db)):
    attempt = db.query(models.QuizAttempts).filter(
        models.QuizAttempts.user_id == payload.user_id,
        models.QuizAttempts.question_id == payload.question_id
    ).first()

    if not attempt:
        raise HTTPException(status_code=404, detail="Quiz attempt not found — question wasn't assigned to this user")

    if attempt.answered_at is not None:
        raise HTTPException(status_code=400, detail="Question already answered")

    question = db.query(models.QuizQuestions).filter(models.QuizQuestions.id == payload.question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    attempt.selected_option = payload.selected_option
    attempt.is_correct = (payload.selected_option == question.correct_option)
    attempt.answered_at = func.now()

    db.commit()
    db.refresh(attempt)

    return schemas.AssignedQuestionOut(
        question_id=question.id,
        content_id=attempt.content_id,
        question_text=question.question_text,
        option_a=question.option_a,
        option_b=question.option_b,
        option_c=question.option_c,
        option_d=question.option_d,
        selected_option=attempt.selected_option,
        answered_at=attempt.answered_at
    )


@app.post("/quiz/submit", response_model=schemas.QuizResult)
async def submit_quiz(user_id: int, content_id: int, db: Session = Depends(get_db)):
    user = db.query(models.Users).filter(models.Users.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    attempts = db.query(models.QuizAttempts, models.QuizQuestions).join(
        models.QuizQuestions, models.QuizAttempts.question_id == models.QuizQuestions.id
    ).filter(
        models.QuizAttempts.user_id == user_id,
        models.QuizAttempts.content_id == content_id
    ).all()

    if not attempts:
        raise HTTPException(status_code=400, detail="No quiz assigned for this user/content")

    unanswered = [a for a, q in attempts if a.answered_at is None]
    if unanswered:
        raise HTTPException(status_code=400, detail=f"{len(unanswered)} question(s) still unanswered")

    score_earned = sum(q.points for a, q in attempts if a.is_correct)

    progress = db.query(models.Progress).filter(
        models.Progress.user_id == user_id,
        models.Progress.content_id == content_id
    ).first()
    progress.status = "quiz_completed"
    progress.score_till_now = score_earned

    user.total_score = (user.total_score or 0) + score_earned

    db.commit()

    # Broadcast updated standings to leaderboard
    all_users = db.query(models.Users).order_by(models.Users.total_score.desc()).all()
    standings = [{"id": u.id, "name": u.name, "score": u.total_score} for u in all_users]
    await manager.broadcast(standings)

    return schemas.QuizResult(
        content_id=content_id,
        score_earned=score_earned,
        total_score=user.total_score,
        status=progress.status
    )

static_dir = os.path.join(os.path.dirname(__file__), "../frontend/employee-engagement-booth-app/dist/employee-engagement-booth-app/browser")

# app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")

@app.get("/{full_path:path}", response_class=FileResponse)
def serve_spa(full_path: str):
    file_path = os.path.join(static_dir, full_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    return FileResponse(os.path.join(static_dir, "index.html"))
