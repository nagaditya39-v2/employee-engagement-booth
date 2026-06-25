import sqlite3 

conn = sqlite3.connect('kiosk.db'); 
print(conn.execute('SELECT COUNT(*) FROM quiz_questions').fetchone()); 
conn.close()