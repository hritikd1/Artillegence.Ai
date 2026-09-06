"""
Quick script to reset or create a user password for Artillegence AI.
Usage: python reset_password.py
"""
import sqlite3
import bcrypt
import os

db_path = "users.db"
print("=== Artillegence AI - Password Reset Tool ===\n")

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

# List users
rows = conn.execute("SELECT id, email FROM users").fetchall()
print(f"Existing users ({len(rows)}):")
for r in rows:
    print(f"  [{r['id']}] {r['email']}")

print()
email = input("Enter email to reset (or new email to create): ").strip()
password = input("Enter new password: ").strip()

if not email or not password:
    print("Error: email and password cannot be empty!")
    conn.close()
    exit(1)

salt = bcrypt.gensalt()
hashed = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
if existing:
    conn.execute("UPDATE users SET hashed_password = ? WHERE email = ?", (hashed, email))
    conn.commit()
    print(f"\n Password updated for {email}")
else:
    conn.execute("INSERT INTO users (email, hashed_password) VALUES (?, ?)", (email, hashed))
    conn.commit()
    print(f"\n New user created: {email}")

conn.close()
print("\nYou can now log in with these credentials.")
