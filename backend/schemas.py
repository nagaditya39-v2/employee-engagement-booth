from pydantic import BaseModel
from datetime import datetime


# user pattern, need to gen a user using only name
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
    

# just needs to fetch all the seeded data for menus
class ContentItemOut(BaseModel):
    id: int
    title: str
    content_type: str
    url: str
    number_of_questions: int

    class Config:
        from_attributes = True

# needs to create a progress entry if not there, if there do nothing
class ProgressOut(BaseModel):
    id: int
    user_id: int
    content_id: int
    status: str
    score_till_now: int

    class Config:
        from_attributes = True