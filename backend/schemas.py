# backend/schemas.py
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel


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


class ProgressSummary(BaseModel):
    content_id: int
    status: str
    score_till_now: int

    class Config:
        from_attributes = True


class AssignedQuestionOut(BaseModel):
    question_id: int
    content_id: int
    topic_key: Optional[str] = None
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    selected_option: Optional[str] = None
    answered_at: Optional[datetime] = None

    class Config:
        from_attributes = False


class UserFullOut(UserOut):
    progress: List[ProgressSummary]
    assigned_questions: List[AssignedQuestionOut]


class ProgressOut(BaseModel):
    id: int
    user_id: int
    content_id: int
    status: str
    score_till_now: int

    class Config:
        from_attributes = True

class AnswerSubmit(BaseModel):
    user_id: int
    question_id: int
    selected_option: str  # "a" / "b" / "c" / "d"


class QuizResult(BaseModel):
    content_id: int
    score_earned: int
    total_score: int
    status: str

    class Config:
        from_attributes = True


class UserStatsOut(BaseModel):
    user_id: int
    total_score: int
    rank: int
    total_users: int

    class Config:
        from_attributes = True