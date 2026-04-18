import sqlite3
import jwt
import bcrypt
import os
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "artillegence_super_secret_jwt_key_v2")
if SECRET_KEY == "artillegence_super_secret_jwt_key_v2":
    print("  [AUTH] WARNING: Using default JWT_SECRET_KEY  set JWT_SECRET_KEY in .env for production!")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day

_bearer_scheme = HTTPBearer(auto_error=False)

router = APIRouter(prefix="/api/auth", tags=["auth"])

def get_db():
    db_path = "users.db"
    if os.path.exists("/data"):
        db_path = "/data/users.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL
        )
    ''')
    
    # Check if we need to seed the default admin
    cur = conn.cursor()
    admin_email = "deores121@gmail.com"
    # Admin@123 (bcrypt hash)
    admin_pass = "$2b$12$ZpMgInoH9eBfI/v3I5w3Z.XnUfV9PjT.U6Xl.rT9G6v6CqI5H1qK6"
    
    cur.execute("SELECT id FROM users WHERE email = ?", (admin_email,))
    existing = cur.fetchone()
    if not existing:
        print("  [AUTH] No admin found, seeding default...")
        cur.execute("INSERT INTO users (email, hashed_password) VALUES (?, ?)", (admin_email, admin_pass))
    else:
        # FORCE UPDATE: Ensure current password is Admin@123 for this restoration session
        print("  [AUTH] Resetting admin credentials for restoration...")
        cur.execute("UPDATE users SET hashed_password = ? WHERE email = ?", (admin_pass, admin_email))
    
    conn.commit()
    conn.close()

# Initialize DB on import
init_db()

class UserCreate(BaseModel):
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

def verify_password(plain_password: str, hashed_password: str):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password: str):
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def require_auth(
    credentials: HTTPAuthorizationCredentials = Security(_bearer_scheme)
) -> dict:
    """
    FastAPI dependency  validates the Bearer JWT and returns the payload.
    Raises HTTP 401 if the token is missing, expired, or invalid.
    """
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired  please log in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

@router.post("/register")
def register(user: UserCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        hashed_password = get_password_hash(user.password)
        cur.execute("INSERT INTO users (email, hashed_password) VALUES (?, ?)", (user.email, hashed_password))
        conn.commit()
        
        # generate token immediately upon registration 
        access_token = create_access_token(data={"sub": user.email})
        return {"access_token": access_token, "token_type": "bearer", "msg": "User created successfully"}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Email already registered")
    finally:
        conn.close()

@router.post("/login")
def login(user: UserLogin):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE email = ?", (user.email,))
    db_user = cur.fetchone()
    conn.close()

    if not db_user:
        print(f"  [AUTH] Login failed: User not found for {user.email}")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not verify_password(user.password, db_user["hashed_password"]):
        print(f"  [AUTH] Login failed: Incorrect password for {user.email}")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    print(f"  [AUTH] Login success: {user.email}")
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}
