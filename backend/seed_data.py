from database import SessionLocal
import models

db = SessionLocal()

# Wipe existing config data (questions first — FK constraint)
db.query(models.QuizQuestions).delete()
db.query(models.ContentItems).delete()
db.commit()

# Reseed content items (pinned IDs so Progress/QuizAttempts references stay valid)
content_items = [
    models.ContentItems(id=1, title="TEACH ME IN 60 SECONDS", content_type="video", url="menu_url_1", number_of_questions=5),
    models.ContentItems(id=2, title="AI MYTHBUSTERS", content_type="quiz", url="menu_url_2", number_of_questions=5),
    models.ContentItems(id=3, title="EMOJI PUZZLE", content_type="quiz", url="menu_url_3", number_of_questions=5),
    models.ContentItems(id=4, title="MATCH THE TECH", content_type="quiz", url="menu_url_4", number_of_questions=5),
]

db.add_all(content_items)
db.commit()

# Reseed questions (7 in pool per content item, quiz draws 5)
for content_id in range(1, 5):
    for i in range(1, 8):
        q = models.QuizQuestions(
            content_id=content_id,
            question_text=f"Content {content_id} — Question {i}: What is 2+2?",
            option_a="3",
            option_b="4",
            option_c="5",
            option_d="6",
            correct_option="b",
            points=10
        )
        db.add(q)

db.commit()
db.close()
print("Reseeded content items and quiz questions.")