from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from database import Base

class Users(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index= True)
    name = Column(String,nullable=False)
    qr_code = Column(String, unique=True, nullable=False)
    total_score = Column(Integer, default=0)
    created_date = Column(DateTime(timezone=True), server_default=func.now())

class ContentItems(Base):
    __tablename__ = "content_items"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    url = Column(String, nullable=False)
    number_of_questions = Column(Integer, default=5)

class QuizQuestions(Base):
    __tablename__ = "quiz_questions"

    id = Column(Integer, primary_key=True)
    content_id = Column(Integer, ForeignKey("content_items.id"), nullable=False)
    question_text = Column(String, nullable=False)
    option_a = Column(String, nullable=False)
    option_b = Column(String, nullable=False)
    option_c = Column(String, nullable=False)
    option_d = Column(String, nullable=False)
    correct_option = Column(String, nullable=False)
    points = Column(Integer, default=1)

class Progress(Base):
    __tablename__ = "progress"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content_id = Column(Integer, ForeignKey("content_items.id"), nullable=False)
    status = Column(String, default="not_started")
    score_till_now = Column(Integer, default=0)

    __table_args__ = (UniqueConstraint("user_id","content_id"),) 

class QuizAttempts(Base):
    __tablename__ = "quiz_attempts"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    content_id = Column(Integer, ForeignKey("content_items.id"))
    question_id = Column(Integer, ForeignKey("quiz_questions.id"))
    selected_option = Column(String, nullable=True)
    is_correct = Column(Boolean, nullable=True)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())
    answered_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (UniqueConstraint("user_id","question_id"),)