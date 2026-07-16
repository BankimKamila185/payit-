import psycopg2
from psycopg2.extras import RealDictCursor

try:
    conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/payit")
    print("Successfully connected to PostgreSQL!")
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # Check tables list
    cur.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
    """)
    tables = cur.fetchall()
    print("Tables in database:")
    for t in tables:
        print(f" - {t['table_name']}")
        
    # Check sample banks
    cur.execute("SELECT * FROM banks LIMIT 3")
    banks = cur.fetchall()
    print("Sample banks:")
    for b in banks:
        print(b)
        
    conn.close()
except Exception as e:
    print("Error connecting or querying PostgreSQL:", e)
