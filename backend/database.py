from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy import Column, String, Integer, DateTime, Text, Boolean, JSON
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./mailpilot.db")

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    name = Column(String)
    picture = Column(String)
    access_token = Column(Text)
    refresh_token = Column(Text)
    token_expiry = Column(DateTime)
    ai_provider = Column(String, default="openai")
    ai_api_key = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

class Campaign(Base):
    __tablename__ = "campaigns"
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    recipient_emails = Column(JSON)  # list of emails
    company_name = Column(String)
    target_role = Column(String)
    offer = Column(String)
    tone = Column(String, default="professional")
    subject = Column(String)
    email_body = Column(Text)
    followup_subject = Column(String)
    followup_body = Column(Text)
    schedule_type = Column(String, default="now")  # now, once, recurring
    schedule_datetime = Column(DateTime, nullable=True)
    recurrence_days = Column(Integer, nullable=True)
    status = Column(String, default="draft")  # draft, scheduled, active, completed
    created_at = Column(DateTime, default=datetime.utcnow)

class EmailLog(Base):
    __tablename__ = "email_logs"
    id = Column(String, primary_key=True)
    campaign_id = Column(String, nullable=False)
    user_id = Column(String, nullable=False)
    recipient = Column(String, nullable=False)
    email_type = Column(String, default="initial")  # initial, followup
    subject = Column(String)
    status = Column(String, default="pending")  # pending, sent, replied, failed
    gmail_message_id = Column(String, nullable=True)
    gmail_thread_id = Column(String, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    replied_at = Column(DateTime, nullable=True)
    next_followup_at = Column(DateTime, nullable=True)
    followup_sent = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
