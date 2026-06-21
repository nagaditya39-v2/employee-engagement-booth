from pydantic import BaseModel
from datetime import datetime


class UserCreate(BaseModel):
    name: str


class UserOut(BaseModel):
    id: int
    name: str
    qr_code: str
    total_score: int
    created_date: datetime

    class Config:
        from_attributes = True