from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List
import uuid
import qrcode
import io

from database import get_db
import models
import schemas
from config import HOST_URL

app = FastAPI()

@app.get("/")
def root_url():
    return {"message": "you've come to the root page"}

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

@app.get("/resume/{qr_code}", response_model=schemas.UserOut)
def resume_user(qr_code: str, db: Session = Depends(get_db)):

    user = db.query(models.Users).filter(models.Users.qr_code == qr_code).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user

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