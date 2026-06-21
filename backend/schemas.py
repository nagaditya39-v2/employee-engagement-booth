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
    
class ContentItemOut(BaseModel):
    id: int
    title: str
    content_type: str
    url: str
    number_of_questions: int

    class Config:
        from_attributes = True