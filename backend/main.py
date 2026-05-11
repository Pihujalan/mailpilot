from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from pydantic import BaseModel, field_validator, EmailStr
from typing import Optional, List
from collections import defaultdict
from datetime import datetime, timezone
import uuid
import os
import secrets
import logging
from dotenv import load_dotenv

from database import init_db, get_db, User, Campaign, EmailLog
from auth import (
    get_auth_url, exchange_code, get_user_info,
    credentials_to_dict, create_jwt, get_current_user,
)
from ai_generator import generate_email

load_dotenv()

logger = logging.getLogger(__name__)

# ─── Rate limiter ─────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address)

# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Re-register recurring campaigns into Beat's schedule on API startup.
    # Beat may have restarted and lost its in-memory schedule.
    try:
        from celery_worker import reload_recurring_campaigns_task
        reload_recurring_campaigns_task.delay()
    except Exception:
        logger.warning("Could not trigger recurring campaign reload — is Celery running?")
    yield

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="MailPilot API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}

# ─── Auth ─────────────────────────────────────────────────────────────────────

@app.get("/auth/login")
async def login():
    auth_url, state = get_auth_url()
    return {"auth_url": auth_url, "state": state}


@app.get("/auth/callback")
async def auth_callback(code: str = Query(...), db: AsyncSession = Depends(get_db)):
    try:
        credentials = exchange_code(code)
        user_info = get_user_info(credentials)
        cred_dict = credentials_to_dict(credentials)
        user_id = user_info["id"]

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if user:
            await db.execute(
                update(User).where(User.id == user_id).values(
                    access_token=cred_dict["token"],
                    refresh_token=cred_dict.get("refresh_token") or user.refresh_token,
                    name=user_info.get("name"),
                    picture=user_info.get("picture"),
                )
            )
        else:
            db.add(User(
                id=user_id,
                email=user_info["email"],
                name=user_info.get("name"),
                picture=user_info.get("picture"),
                access_token=cred_dict["token"],
                refresh_token=cred_dict.get("refresh_token"),
            ))

        await db.commit()

        # Issue a short-lived one-time code instead of putting the JWT in the URL.
        # The frontend exchanges it at /auth/token within 60 seconds.
        token = create_jwt(user_id)
        one_time_code = secrets.token_urlsafe(32)
        _auth_code_store[one_time_code] = token

        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        return RedirectResponse(f"{frontend_url}?code={one_time_code}")

    except Exception as e:
        logger.error("OAuth callback error", exc_info=True)
        raise HTTPException(status_code=400, detail="Authentication failed")


# In-memory one-time code store (TTL handled by JWT expiry; codes are single-use).
# For multi-instance deployments, move this to Redis.
_auth_code_store: dict[str, str] = {}


@app.post("/auth/token")
async def exchange_auth_code(code: str = Query(...)):
    """
    Frontend calls this once with the one-time code from the redirect URL.
    Returns the JWT and removes the code so it can't be reused.
    """
    token = _auth_code_store.pop(code, None)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid or expired auth code")
    return {"access_token": token, "token_type": "bearer"}


@app.get("/auth/me")
async def get_me(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "ai_provider": user.ai_provider,
        "has_api_key": bool(user.ai_api_key),
    }

# ─── Settings ─────────────────────────────────────────────────────────────────

VALID_PROVIDERS = {"openai", "claude", "gemini", "groq"}


class SettingsUpdate(BaseModel):
    ai_provider: str
    ai_api_key: str

    @field_validator("ai_provider")
    @classmethod
    def validate_provider(cls, v):
        if v not in VALID_PROVIDERS:
            raise ValueError(f"Provider must be one of {VALID_PROVIDERS}")
        return v

    @field_validator("ai_api_key")
    @classmethod
    def validate_key(cls, v):
        if len(v) < 10:
            raise ValueError("API key looks too short")
        return v


@app.post("/settings")
async def update_settings(
    data: SettingsUpdate,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.ai_provider = data.ai_provider
    user.ai_api_key = data.ai_api_key  # encrypted via property setter
    await db.commit()
    return {"success": True}

# ─── AI Generation ────────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    company_name: str
    target_role: str
    offer: str
    tone: str = "professional"


@app.post("/generate")
@limiter.limit("20/minute")
async def generate(
    request: Request,
    data: GenerateRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.ai_api_key:
        raise HTTPException(status_code=400, detail="AI API key not configured. Go to Settings.")

    try:
        return await generate_email(
            provider=user.ai_provider,
            api_key=user.ai_api_key,
            company_name=data.company_name,
            target_role=data.target_role,
            offer=data.offer,
            tone=data.tone,
        )
    except Exception:
        logger.error("AI generation failed", exc_info=True)
        raise HTTPException(status_code=500, detail="AI generation failed. Please check your API key and try again.")

# ─── Campaigns ────────────────────────────────────────────────────────────────

class CampaignCreate(BaseModel):
    name: str
    recipient_emails: List[EmailStr]
    company_name: str
    target_role: str
    offer: str
    tone: str = "professional"
    subject: str
    email_body: str
    followup_subject: Optional[str] = None
    followup_body: Optional[str] = None
    schedule_type: str = "now"
    schedule_datetime: Optional[str] = None
    recurrence_days: Optional[int] = None

    @field_validator("recipient_emails")
    @classmethod
    def limit_recipients(cls, v):
        if len(v) > 500:
            raise ValueError("Max 500 recipients per campaign")
        return v

    @field_validator("schedule_type")
    @classmethod
    def validate_schedule(cls, v):
        if v not in {"now", "once", "recurring"}:
            raise ValueError("schedule_type must be now, once, or recurring")
        return v

    @field_validator("recurrence_days")
    @classmethod
    def validate_recurrence(cls, v):
        if v is not None and v < 1:
            raise ValueError("recurrence_days must be at least 1")
        return v


@app.post("/campaigns")
async def create_campaign(
    data: CampaignCreate,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    campaign_id = str(uuid.uuid4())
    send_dt = None
    if data.schedule_datetime:
        try:
            send_dt = datetime.fromisoformat(data.schedule_datetime)
        except Exception:
            raise HTTPException(status_code=422, detail="Invalid schedule_datetime format")

    campaign = Campaign(
        id=campaign_id,
        user_id=user_id,
        name=data.name,
        recipient_emails=[str(e) for e in data.recipient_emails],
        company_name=data.company_name,
        target_role=data.target_role,
        offer=data.offer,
        tone=data.tone,
        subject=data.subject,
        email_body=data.email_body,
        followup_subject=data.followup_subject,
        followup_body=data.followup_body,
        schedule_type=data.schedule_type,
        schedule_datetime=send_dt,
        recurrence_days=data.recurrence_days,
        status="sending" if data.schedule_type == "now" else "scheduled",
    )
    db.add(campaign)
    await db.commit()

    from celery_worker import send_campaign, schedule_recurring_campaign

    if data.schedule_type == "now":
        send_campaign.delay(campaign_id)

    elif data.schedule_type == "recurring" and data.recurrence_days:
        # Persist the schedule into Beat via the helper — this works across processes.
        schedule_recurring_campaign(campaign_id, data.recurrence_days)
        send_campaign.delay(campaign_id, True)

    elif data.schedule_type == "once" and send_dt:
        eta = send_dt if send_dt.tzinfo else send_dt.replace(tzinfo=timezone.utc)
        send_campaign.apply_async(args=[campaign_id], eta=eta)

    return {"id": campaign_id, "status": campaign.status}


@app.get("/campaigns")
async def list_campaigns(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Campaign)
        .where(Campaign.user_id == user_id)
        .order_by(Campaign.created_at.desc())
    )
    campaigns = result.scalars().all()
    if not campaigns:
        return []

    campaign_ids = [c.id for c in campaigns]
    logs_result = await db.execute(
        select(EmailLog).where(EmailLog.campaign_id.in_(campaign_ids))
    )
    logs_by_campaign = defaultdict(list)
    for log in logs_result.scalars().all():
        logs_by_campaign[log.campaign_id].append(log)

    return [
        {
            "id": c.id,
            "name": c.name,
            "company_name": c.company_name,
            "target_role": c.target_role,
            "recipient_count": len(c.recipient_emails or []),
            "status": c.status,
            "schedule_type": c.schedule_type,
            "schedule_datetime": c.schedule_datetime.isoformat() if c.schedule_datetime else None,
            "recurrence_days": c.recurrence_days,
            "created_at": c.created_at.isoformat(),
            "stats": {
                "sent": sum(1 for l in logs_by_campaign[c.id] if l.status in ["sent", "followup_sent"]),
                "replied": sum(1 for l in logs_by_campaign[c.id] if l.status == "replied"),
                "followup_sent": sum(1 for l in logs_by_campaign[c.id] if l.followup_sent),
                "pending": sum(1 for l in logs_by_campaign[c.id] if l.status == "pending"),
            },
        }
        for c in campaigns
    ]


@app.get("/campaigns/{campaign_id}/logs")
async def get_campaign_logs(
    campaign_id: str,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    camp = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id, Campaign.user_id == user_id)
    )
    if not camp.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Campaign not found")

    result = await db.execute(select(EmailLog).where(EmailLog.campaign_id == campaign_id))
    return [
        {
            "id": l.id,
            "recipient": l.recipient,
            "email_type": l.email_type,
            "subject": l.subject,
            "status": l.status,
            "sent_at": l.sent_at.isoformat() if l.sent_at else None,
            "replied_at": l.replied_at.isoformat() if l.replied_at else None,
            "followup_sent": l.followup_sent,
            "next_followup_at": l.next_followup_at.isoformat() if l.next_followup_at else None,
        }
        for l in result.scalars().all()
    ]


@app.get("/stats")
async def get_stats(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaigns = (await db.execute(select(Campaign).where(Campaign.user_id == user_id))).scalars().all()
    logs = (await db.execute(select(EmailLog).where(EmailLog.user_id == user_id))).scalars().all()

    total_replied = sum(1 for l in logs if l.status == "replied")
    return {
        "total_campaigns": len(campaigns),
        "total_sent": sum(1 for l in logs if l.status in ["sent", "followup_sent", "replied"]),
        "total_replied": total_replied,
        "reply_rate": round(total_replied / max(len(logs), 1) * 100, 1),
        "active_campaigns": sum(1 for c in campaigns if c.status == "active"),
    }


@app.delete("/campaigns/{campaign_id}")
async def delete_campaign(
    campaign_id: str,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id, Campaign.user_id == user_id)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    await db.execute(delete(EmailLog).where(EmailLog.campaign_id == campaign_id))
    await db.delete(campaign)
    await db.commit()

    from celery_worker import unschedule_recurring_campaign
    unschedule_recurring_campaign(campaign_id)

    return {"success": True}