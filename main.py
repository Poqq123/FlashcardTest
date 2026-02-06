# main.py
import urllib.parse
import firebase_admin
from firebase_admin import auth, credentials
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

# ==========================================
# 1. DATABASE SETUP (Supabase)
# ==========================================

# I preserved your specific URL from the code you shared.
# Note: If your password has special characters, this URL might still fail unless encoded.
# If it worked before, it will work now.
SQLALCHEMY_DATABASE_URL = "postgresql://postgres.sfxtsemiitbruxmdurva:3vnfynax2026@aws-0-us-west-2.pooler.supabase.com:6543/postgres"

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Define the Table Structure
# UPGRADE: Added 'user_id' column
class CardDB(Base):
    __tablename__ = "flashcards"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)  # <--- Stores the Firebase UID
    question = Column(String)
    answer = Column(String)

# Create the table in the cloud if it doesn't exist
# Note: If the table already exists without user_id, you might need to delete it in Supabase first!
Base.metadata.create_all(bind=engine)


# ==========================================
# 2. FIREBASE AUTH SETUP (The Gatekeeper)
# ==========================================

# Initialize Firebase Admin SDK (only once)
# Ensure 'service-account.json' is in the same folder!
if not firebase_admin._apps:
    try:
        cred = credentials.Certificate("service-account.json")
        firebase_admin.initialize_app(cred)
        print("Firebase Admin Initialized Successfully")
    except Exception as e:
        print(f"Error loading service-account.json: {e}")

# Dependency: Verifies the token and returns the User ID (uid)
def get_current_user(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization token provided")
    
    try:
        # Client sends "Bearer eyJhbGci..." -> We remove "Bearer " to get just the token
        token = authorization.split(" ")[1]
        
        # Verify with Firebase
        decoded_token = auth.verify_id_token(token)
        uid = decoded_token['uid']
        return uid
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ==========================================
# 3. APP SETUP
# ==========================================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class CardSchema(BaseModel):
    question: str
    answer: str


# ==========================================
# 4. API ENDPOINTS (Protected)
# ==========================================

@app.get("/")
def read_root():
    return {"message": "Flashcard API is running with Auth!"}

@app.get("/cards")
def get_cards(user_id: str = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Fetch only the cards that belong to the logged-in user.
    """
    # UPGRADE: Filter by user_id
    return db.query(CardDB).filter(CardDB.user_id == user_id).all()

@app.post("/cards")
def create_card(card: CardSchema, user_id: str = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Create a new card and attach the user's ID to it.
    """
    # UPGRADE: Save with user_id
    new_card = CardDB(question=card.question, answer=card.answer, user_id=user_id)
    db.add(new_card)
    db.commit()
    db.refresh(new_card)
    return {"message": "Card added", "id": new_card.id}

@app.delete("/cards/{card_id}")
def delete_card(card_id: int, user_id: str = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Delete a card, but ONLY if it belongs to the logged-in user.
    """
    # UPGRADE: Check ownership before deleting
    card = db.query(CardDB).filter(CardDB.id == card_id, CardDB.user_id == user_id).first()
    
    if not card:
        raise HTTPException(status_code=404, detail="Card not found or access denied")
    
    db.delete(card)
    db.commit()
    return {"message": "Deleted"}

@app.put("/cards/{card_id}")
def update_card(card_id: int, card_data: CardSchema, user_id: str = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Update a card, but ONLY if it belongs to the logged-in user.
    """
    # UPGRADE: Check ownership before updating
    db_card = db.query(CardDB).filter(CardDB.id == card_id, CardDB.user_id == user_id).first()
    
    if not db_card:
        raise HTTPException(status_code=404, detail="Card not found or access denied")
    
    db_card.question = card_data.question
    db_card.answer = card_data.answer
    db.commit()
    return {"message": "Updated"}