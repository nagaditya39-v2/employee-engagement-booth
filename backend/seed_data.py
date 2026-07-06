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

# ── Content item 1 ("TEACH ME IN 60 SECONDS") — one topic per short video ──
# topic_key here MUST match the "id" field of each entry in
# frontend/.../src/assets/json/topics.json, or the quiz falls back to the
# whole pool instead of the picked topic's questions.
TOPIC_QUESTIONS = {
    "ai-basics": [
        ("Generative AI models create new content by learning patterns from:",
         "Large training datasets", "Random noise only", "Manually written rules", "The user's personal files", "a"),
        ("Which of these is an example of generative AI output?",
         "A spreadsheet formula", "An AI-written email draft", "A printed spreadsheet", "A physical whiteboard", "b"),
        ("A key risk when using generative AI at work is:",
         "It never makes mistakes", "It can sometimes produce inaccurate information", "It requires no review", "It replaces all human judgment", "b"),
        ("Before using AI-generated content in official work, employees should:",
         "Publish it immediately", "Review and verify it", "Ignore it entirely", "Delete the original source", "b"),
        ("Generative AI is best described as a tool that:",
         "Thinks exactly like a human", "Predicts likely patterns based on training data", "Has consciousness", "Only works offline", "b"),
    ],
    "cybersecurity": [
        ("The most common way attackers gain access to company systems is:",
         "Phishing emails", "Weather changes", "Office furniture", "Coffee machines", "a"),
        ("A strong password should include:",
         "Your name and birthday", "A short common word", "A mix of letters, numbers, and symbols", "The word 'password'", "c"),
        ("If you receive a suspicious email asking for your login details, you should:",
         "Reply with your password", "Click the link to check", "Report it to IT/security", "Forward it to friends", "c"),
        ("Multi-factor authentication (MFA) adds security by:",
         "Requiring a second verification step", "Removing the need for passwords", "Slowing down your computer", "Sharing your password with others", "a"),
        ("Leaving your laptop unlocked when away from your desk is:",
         "Perfectly safe", "A security risk", "Required by policy", "Good for battery life", "b"),
    ],
    "sustainability": [
        ("Which everyday action reduces energy waste in the office?",
         "Leaving lights on overnight", "Turning off monitors when not in use", "Printing every document twice", "Running AC with windows open", "b"),
        ("Recycling paper and electronics at work helps:",
         "Increase landfill waste", "Reduce environmental impact", "Slow down operations", "Increase costs only", "b"),
        ("A simple way to cut commuting emissions is:",
         "Carpooling or public transport", "Driving alone every day", "Idling in traffic longer", "Avoiding all travel planning", "a"),
        ("Sustainable sourcing means choosing suppliers that:",
         "Ignore environmental standards", "Follow responsible environmental practices", "Only focus on lowest price", "Have no policies at all", "b"),
        ("Reducing single-use plastics in the office is an example of:",
         "Waste reduction", "Increased waste", "A cybersecurity practice", "A hiring policy", "a"),
    ],
    "innovation": [
        ("An innovation mindset encourages employees to:",
         "Avoid all risk", "Experiment and learn from failure", "Repeat only past solutions", "Ignore customer feedback", "b"),
        ("A 'minimum viable product' (MVP) is used to:",
         "Launch a fully perfect product first", "Test an idea quickly with minimal features", "Avoid customer feedback", "Replace all planning", "b"),
        ("Cross-team collaboration often leads to:",
         "Slower, worse ideas", "More diverse and creative solutions", "Less innovation", "Fewer perspectives", "b"),
        ("Which best describes a 'fail fast' approach?",
         "Avoiding any testing", "Quickly testing ideas to learn early", "Waiting years before feedback", "Never changing plans", "b"),
        ("Encouraging employees to share ideas openly helps:",
         "Slow down innovation", "Build a stronger innovation culture", "Reduce trust", "Increase secrecy", "b"),
    ],
    "teamwork": [
        ("Diverse teams often perform better because they:",
         "Think identically", "Bring varied perspectives to problems", "Avoid all disagreement", "Work in isolation", "b"),
        ("Effective teamwork relies heavily on:",
         "Clear communication", "Working in silence", "Avoiding feedback", "Competing against teammates", "a"),
        ("A key benefit of collaboration is:",
         "Slower problem solving", "Faster, better solutions through shared knowledge", "Less accountability", "More misunderstandings", "b"),
        ("When a teammate disagrees with your idea, a good response is:",
         "Dismiss them immediately", "Listen and discuss the reasoning", "Ignore the project", "Report them to HR", "b"),
        ("Trust within a team is built by:",
         "Consistent, honest communication", "Withholding information", "Avoiding collaboration", "Competing for credit", "a"),
    ],
}

for topic_key, questions in TOPIC_QUESTIONS.items():
    for question_text, opt_a, opt_b, opt_c, opt_d, correct in questions:
        db.add(models.QuizQuestions(
            content_id=1,
            topic_key=topic_key,
            question_text=question_text,
            option_a=opt_a,
            option_b=opt_b,
            option_c=opt_c,
            option_d=opt_d,
            correct_option=correct,
            points=10
        ))

# Reseed questions for content items 2-4 (7 in pool per item, quiz draws 5) — unchanged
for content_id in range(2, 5):
    for i in range(1, 8):
        q = models.QuizQuestions(
            content_id=content_id,
            topic_key=None,
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
print("Reseeded content items and quiz questions (with per-topic tagging for content item 1).")