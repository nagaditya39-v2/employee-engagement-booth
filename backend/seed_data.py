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
        ("At its core, how does cybersecurity get defined?",
         "Designing faster network hardware", "Protecting software, systems, and networks from threats and unauthorized snooping",
         "Monitoring employee internet usage for productivity", "Creating complex encryption algorithms for personal use", "b"),
        ("What is described as the \"absolute holy grail\" and foundation of cybersecurity?",
         "The Digital Defense Shield", "The Encryption Matrix", "The CIA triad (Confidentiality, Integrity, and Availability)", "The Firewall Protocol", "c"),
        ("What is the specific definition of \"vulnerabilities\"?",
         "External hackers trying to access a system", "Internal system flaws", "Accidental deletion of files by employees", "Physical damage to server hardware", "b"),
        ("How are \"threats\" distinguished from vulnerabilities?",
         "Threats are software bugs, vulnerabilities are hardware issues", "Threats are the actual external malicious actors",
         "Threats are internal errors, vulnerabilities are external attacks", "There is no distinction; the terms are interchangeable", "b"),
        ("Which type of attack is described as \"completely overloading your network resources\"?",
         "Malware", "Phishing scams", "DOS attacks", "Data breaches", "c"),
        ("Which of these is NOT mentioned as a way to \"fight back\" against cyber threats?",
         "Built-in security", "Digital hygiene", "Increasing internet bandwidth", "Two-factor authentication", "c"),
    ],
    "rag": [
        ("What does a Retrieval-Augmented Generation (RAG) system combine a large language model with?",
         "A manual data entry interface", "An external knowledge source", "An older version of the language model", "A video processing tool", "b"),
        ("What is a primary reason organizations use RAG technology?",
         "To increase the length of generated responses", "To reduce hallucinations and improve accuracy",
         "To entirely replace customer support agents", "To automatically rewrite their databases", "b"),
        ("How does RAG allow AI assistants to use proprietary or domain-specific knowledge?",
         "By constantly retraining the language model", "By using the knowledge as context without needing to retrain the model",
         "By rewriting the original query", "By deleting old training data", "b"),
        ("What is the first step in the three-step process of a RAG system?",
         "Retrieving relevant content from a knowledge base", "Converting a user's query into a searchable representation",
         "Passing information to the language model", "Generating a context-aware response", "b"),
        ("During the second step of the RAG workflow, what action is performed?",
         "The language model generates the final answer", "The user's query is transformed into a searchable format",
         "The system retrieves the most relevant content from a knowledge base", "The system asks the user for clarification", "c"),
        ("In the final step of a RAG system's operation, what is passed to the language model?",
         "Only the retrieved information", "Only the original user query",
         "Both the user's query and the retrieved information", "A request to retrain the model", "c"),
        ("Which of the following is NOT a common use case for RAG?",
         "Enterprise search", "Customer support", "Video rendering", "Knowledge management", "c"),
    ],
    "proxy-servers": [
        ("What is the fundamental role of a proxy server?",
         "To act as a direct replacement for an internet service provider", "To act as an intermediary between a client and a destination server",
         "To permanently store all internet traffic data", "To generate original web content for destination servers", "b"),
        ("Which type of proxy represents clients and manages outbound requests?",
         "Reverse proxy", "Transparent proxy", "Forward proxy", "Backend proxy", "c"),
        ("Which is a primary function of a reverse proxy?",
         "Handling incoming client requests and distributing traffic across backend servers", "Masking the identity of a client from external websites",
         "Monitoring a single user's home network activity", "Bypassing an organization's internal security policies", "a"),
        ("How do organizations use proxy servers to reduce bandwidth usage?",
         "By limiting the number of computers on a network", "Through caching content",
         "By encrypting all data packets", "By hiding internal network details", "b"),
        ("When a client connects to a proxy, can the proxy inspect, modify, filter, or block traffic before it reaches its destination?",
         "True, always", "False, never", "Only with additional third-party software", "Only for HTTPS traffic", "a"),
    ],
    "prompt-engineering": [
        ("What is the primary definition of prompt engineering?",
     "The process of building new large language models from scratch",
     "The practice of designing and refining instructions to guide generative AI models",
     "The method of retraining AI models using large datasets",
     "The automatic generation of AI hardware components",
     "b"),

    ("Which of the following elements should be provided to make a prompt effective?",
     "Random keywords and unstructured data",
     "Clear objectives, context, constraints, and examples",
     "Complex coding algorithms",
     "Server credentials and API keys",
     "b"),

    ("Which of the following is a specific technique used in prompt engineering?",
     "Hardware acceleration",
     "Chain-of-thought guidance",
     "Server-side rendering",
     "Data tokenization",
     "b"),

    ("In what areas do organizations commonly use prompt engineering?",
     "Customer support, software development, and content creation",
     "Physical manufacturing and logistics",
     "Designing office floor plans",
     "Repairing broken hardware",
     "a"),

    ("What is one of the major benefits of using well-designed prompts for an organization?",
     "It allows them to maximize the value of large language models without retraining them",
     "It completely eliminates the need for software developers",
     "It allows companies to run models without electricity",
     "It guarantees zero errors in every AI interaction",
     "a")
    ],
    "nlp": [
        ("What is the primary function of Natural Language Processing (NLP)?:",
         "To process and render high-resolution video graphics", "To enable computers to understand, interpret, generate, and interact with human language", "To increase the processing speed of computer networks", "To build physical robotic hardware", "b"),
        ("Which three fields does NLP combine to process text and speech?",
         "Linguistics, machine learning, and deep learning", "Mathematics, biology, and chemistry", "Psychology, sociology, and economics", "Hardware engineering, networking, and cloud computing", "a"),
        ("Which of the following is NOT mentioned as a common application of NLP?",
         "Chatbots", "Sentiment analysis", "3D modeling", "Text summarization", "c"),
        ("What is one of the initial stages NLP uses to process raw language?",
         "Visual rendering", "Tokenization", "Data encryption", "Predictive modeling", "b"),
        ("What type of models do modern NLP systems rely on to recognize patterns and understand context?",
         "Simple rule-based algorithms", "Transformer-based language models", "Relational database models", "Linear regression models", "b"),
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