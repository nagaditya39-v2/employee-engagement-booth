from fastapi import FastAPI, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
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