from database import SessionLocal
import models

db = SessionLocal()

content_items = [
    models.ContentItems(
        title="menu_1",
        content_type="video",
        url="menu_url_1",
        number_of_questions=5,
    ),
    models.ContentItems(
        title="menu_2",
        content_type="webpage",
        url="menu_url_2",
        number_of_questions=5,
    ),
    models.ContentItems(
        title="menu_3",
        content_type="interactive",
        url="menu_url_3",
        number_of_questions=5,
    ),
    models.ContentItems(
        title="menu_4",
        content_type="webpage",
        url="menu_url_4",
        number_of_questions=5,
    ),
]

db.add_all(content_items)
db.commit()
db.close()

print(f"Seeded {len(content_items)} content items.")