# main.py
import os
from typing import Optional

import jwt
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from jwt import InvalidTokenError, PyJWKClient
from jwt.exceptions import PyJWKClientError
from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker

# ==========================================
# 1. DATABASE SETUP (Supabase)
# ==========================================

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is required")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class CollectionDB(Base):
    __tablename__ = "collections"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    name = Column(String)
    class_name = Column(String, nullable=True)


class CardDB(Base):
    __tablename__ = "flashcards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    question = Column(String)
    answer = Column(String)
    collection_id = Column(Integer, nullable=True, index=True)


def ensure_schema() -> None:
    """
    Backfill missing columns/indexes for existing databases.
    create_all() creates new tables but does not alter existing ones.
    """
    inspector = inspect(engine)
    if "flashcards" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("flashcards")}
    with engine.begin() as connection:
        if "user_id" not in existing_columns:
            connection.execute(text("ALTER TABLE flashcards ADD COLUMN user_id VARCHAR"))
        if "collection_id" not in existing_columns:
            connection.execute(text("ALTER TABLE flashcards ADD COLUMN collection_id INTEGER"))

        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_flashcards_user_id ON flashcards (user_id)"))
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_flashcards_collection_id ON flashcards (collection_id)")
        )


Base.metadata.create_all(bind=engine)
ensure_schema()


# ==========================================
# 2. SUPABASE AUTH SETUP (The Gatekeeper)
# ==========================================

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
SUPABASE_JWT_ISSUER = os.getenv("SUPABASE_JWT_ISSUER", f"{SUPABASE_URL}/auth/v1" if SUPABASE_URL else "")
SUPABASE_JWKS_CLIENT = (
    PyJWKClient(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json") if SUPABASE_URL else None
)


def decode_supabase_token(token: str) -> dict:
    try:
        header = jwt.get_unverified_header(token)
        algorithm = header.get("alg")
        if not algorithm:
            raise HTTPException(status_code=401, detail="Invalid token header")

        decode_kwargs = {
            "algorithms": [algorithm],
            "options": {"verify_aud": False},
        }
        if SUPABASE_JWT_ISSUER:
            decode_kwargs["issuer"] = SUPABASE_JWT_ISSUER

        if algorithm.startswith("HS"):
            if not SUPABASE_JWT_SECRET:
                raise HTTPException(
                    status_code=500,
                    detail="Server auth misconfigured: missing SUPABASE_JWT_SECRET",
                )
            return jwt.decode(token, SUPABASE_JWT_SECRET, **decode_kwargs)

        if SUPABASE_JWKS_CLIENT is None:
            raise HTTPException(
                status_code=500,
                detail="Server auth misconfigured: missing SUPABASE_URL",
            )

        signing_key = SUPABASE_JWKS_CLIENT.get_signing_key_from_jwt(token)
        return jwt.decode(token, signing_key.key, **decode_kwargs)
    except HTTPException:
        raise
    except (InvalidTokenError, PyJWKClientError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_current_user(authorization: str = Header(None)) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization token provided")

    try:
        parts = authorization.split(" ", 1)
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise ValueError("Malformed authorization header")

        decoded_token = decode_supabase_token(parts[1])
        user_id = decoded_token.get("sub")
        if not user_id:
            raise ValueError("Token is missing subject")
        return user_id
    except HTTPException:
        raise
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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class CardSchema(BaseModel):
    question: str
    answer: str
    collection_id: Optional[int] = None


class CollectionSchema(BaseModel):
    name: str
    class_name: Optional[str] = None


def get_owned_collection(collection_id: int, user_id: str, db: Session) -> CollectionDB:
    collection = (
        db.query(CollectionDB)
        .filter(CollectionDB.id == collection_id, CollectionDB.user_id == user_id)
        .first()
    )
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found or access denied")
    return collection


# ==========================================
# 4. API ENDPOINTS (Protected)
# ==========================================

@app.get("/")
def read_root():
    return {"message": "Flashcard API is running with Auth and Collections!"}


@app.get("/collections")
def get_collections(user_id: str = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(CollectionDB)
        .filter(CollectionDB.user_id == user_id)
        .order_by(CollectionDB.name.asc())
        .all()
    )


@app.post("/collections")
def create_collection(
    collection: CollectionSchema,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    name = collection.name.strip()
    class_name = collection.class_name.strip() if collection.class_name else None

    if not name:
        raise HTTPException(status_code=400, detail="Collection name is required")

    duplicate = (
        db.query(CollectionDB)
        .filter(
            CollectionDB.user_id == user_id,
            CollectionDB.name == name,
            CollectionDB.class_name == class_name,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="A matching collection already exists")

    new_collection = CollectionDB(user_id=user_id, name=name, class_name=class_name)
    db.add(new_collection)
    db.commit()
    db.refresh(new_collection)

    return {
        "message": "Collection added",
        "id": new_collection.id,
        "name": new_collection.name,
        "class_name": new_collection.class_name,
    }


@app.delete("/collections/{collection_id}")
def delete_collection(
    collection_id: int,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    collection = get_owned_collection(collection_id, user_id, db)

    db.query(CardDB).filter(
        CardDB.user_id == user_id,
        CardDB.collection_id == collection.id,
    ).update({CardDB.collection_id: None}, synchronize_session=False)

    db.delete(collection)
    db.commit()
    return {"message": "Collection deleted"}


@app.get("/collections/{collection_id}/cards")
def get_cards_for_collection(
    collection_id: int,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_collection(collection_id, user_id, db)

    return (
        db.query(CardDB)
        .filter(CardDB.user_id == user_id, CardDB.collection_id == collection_id)
        .all()
    )


@app.get("/cards")
def get_cards(
    collection_id: Optional[int] = Query(default=None),
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cards_query = db.query(CardDB).filter(CardDB.user_id == user_id)

    if collection_id is not None:
        get_owned_collection(collection_id, user_id, db)
        cards_query = cards_query.filter(CardDB.collection_id == collection_id)

    return cards_query.all()


@app.post("/cards")
def create_card(
    card: CardSchema,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    question = card.question.strip()
    answer = card.answer.strip()

    if not question or not answer:
        raise HTTPException(status_code=400, detail="Question and answer are required")

    if card.collection_id is not None:
        get_owned_collection(card.collection_id, user_id, db)

    new_card = CardDB(
        question=question,
        answer=answer,
        user_id=user_id,
        collection_id=card.collection_id,
    )
    db.add(new_card)
    db.commit()
    db.refresh(new_card)
    return {"message": "Card added", "id": new_card.id}


@app.delete("/cards/{card_id}")
def delete_card(card_id: int, user_id: str = Depends(get_current_user), db: Session = Depends(get_db)):
    card = db.query(CardDB).filter(CardDB.id == card_id, CardDB.user_id == user_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found or access denied")

    db.delete(card)
    db.commit()
    return {"message": "Deleted"}


@app.put("/cards/{card_id}")
def update_card(
    card_id: int,
    card_data: CardSchema,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_card = db.query(CardDB).filter(CardDB.id == card_id, CardDB.user_id == user_id).first()
    if not db_card:
        raise HTTPException(status_code=404, detail="Card not found or access denied")

    question = card_data.question.strip()
    answer = card_data.answer.strip()
    if not question or not answer:
        raise HTTPException(status_code=400, detail="Question and answer are required")

    if card_data.collection_id is not None:
        get_owned_collection(card_data.collection_id, user_id, db)

    db_card.question = question
    db_card.answer = answer
    db_card.collection_id = card_data.collection_id
    db.commit()
    return {"message": "Updated"}
