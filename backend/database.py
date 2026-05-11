from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy import Column, String, Integer, DateTime, Text, Boolean, JSON
from datetime import datetime, timezone
from cryptography.fernet import Fernet
import logging
import os
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ─── Connection ───────────────────────────────────────────────────────────────

_raw_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./mailpilot.db")
if _raw_url.startswith("postgres://"):
    _raw_url = _raw_url.replace("postgres://", "postgresql+asyncpg://", 1)

DATABASE_URL = _raw_url

_connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    connect_args=_connect_args,
)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# ─── Encryption ───────────────────────────────────────────────────────────────

_FERNET_KEY = os.getenv("FERNET_KEY")
if not _FERNET_KEY:
    logger.warning(
        "FERNET_KEY is not set — AI API keys will be stored unencrypted. "
        "Set FERNET_KEY in production."
    )
_fernet = Fernet(_FERNET_KEY.encode()) if _FERNET_KEY else None


def encrypt(value: str) -> str:
    if not value or not _fernet:
        return value
    return _fernet.encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    if not value or not _fernet:
        return value
    try:
        return _fernet.decrypt(value.encode()).decode()
    except Exception:
        logger.error("Failed to decrypt value — key mismatch or corrupted data")
        return value


def now_utc():
    return datetime.now(timezone.utc)

# ─── Models ───────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id            = Column(String, primary_key=True)
    email         = Column(String, unique=True, nullable=False)
    name          = Column(String)
    picture       = Column(String)
    access_token  = Column(Text)
    refresh_token = Column(Text)
    token_expiry  = Column(DateTime(timezone=True))
    ai_provider   = Column(String, default="openai")
    _ai_api_key   = Column("ai_api_key", Text)
    created_at    = Column(DateTime(timezone=True), default=now_utc)

    @property
    def ai_api_key(self) -> str:
        return decrypt(self._ai_api_key)

    @ai_api_key.setter
    def ai_api_key(self, value: str):
        self._ai_api_key = encrypt(value)


class Campaign(Base):
    __tablename__ = "campaigns"

    id                = Column(String, primary_key=True)
    user_id           = Column(String, nullable=False)
    name              = Column(String, nullable=False)
    recipient_emails  = Column(JSON)
    company_name      = Column(String)
    target_role       = Column(String)
    offer             = Column(String)
    tone              = Column(String, default="professional")
    subject           = Column(String)
    email_body        = Column(Text)
    followup_subject  = Column(String)
    followup_body     = Column(Text)
    schedule_type     = Column(String, default="now")
    schedule_datetime = Column(DateTime(timezone=True), nullable=True)
    recurrence_days   = Column(Integer, nullable=True)
    status            = Column(String, default="draft")
    created_at        = Column(DateTime(timezone=True), default=now_utc)


class EmailLog(Base):
    __tablename__ = "email_logs"

    id               = Column(String, primary_key=True)
    campaign_id      = Column(String, nullable=False)
    user_id          = Column(String, nullable=False)
    recipient        = Column(String, nullable=False)
    email_type       = Column(String, default="initial")
    subject          = Column(String)
    status           = Column(String, default="pending")
    gmail_message_id = Column(String, nullable=True)
    gmail_thread_id  = Column(String, nullable=True)
    sent_at          = Column(DateTime(timezone=True), nullable=True)
    replied_at       = Column(DateTime(timezone=True), nullable=True)
    next_followup_at = Column(DateTime(timezone=True), nullable=True)
    followup_sent    = Column(Boolean, default=False)
    created_at       = Column(DateTime(timezone=True), default=now_utc)


# ─── Init ─────────────────────────────────────────────────────────────────────

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session