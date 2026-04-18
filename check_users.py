import sqlite3
conn = sqlite3.connect('users.db')
conn.row_factory = sqlite3.Row
try:
    rows = conn.execute('SELECT id, email FROM users').fetchall()
    print(f'Users in DB: {len(rows)}')
    for r in rows:
        print(f'  - {r["email"]}')
except Exception as e:
    print(f'Error: {e}')
finally:
    conn.close()
