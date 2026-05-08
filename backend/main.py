from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid
import os
from dotenv import load_dotenv

from database import init_db, get_db, User, Campaign, EmailLog
from auth import get_auth_url, exchange_code, get_user_info, credentials_to_dict
from ai_generator import generate_email
from scheduler import start_scheduler, stop_scheduler, schedule_campaign, process_campaign_sending

load_dotenv()

app = FastAPI(title="MailPilot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:5173"), "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── STARTUP / SHUTDOWN ───────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    await init_db()
    start_scheduler()

@app.on_event("shutdown")
async def shutdown():
    stop_scheduler()

# ─── AUTH ─────────────────────────────────────────────────────────────────────

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
            user = User(
                id=user_id,
                email=user_info["email"],
                name=user_info.get("name"),
                picture=user_info.get("picture"),
                access_token=cred_dict["token"],
                refresh_token=cred_dict.get("refresh_token"),
            )
            db.add(user)

        await db.commit()
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        return RedirectResponse(f"{frontend_url}/dashboard?user_id={user_id}")

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/auth/me")
async def get_me(user_id: str = Query(...), db: AsyncSession = Depends(get_db)):
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

# ─── SETTINGS ─────────────────────────────────────────────────────────────────

class SettingsUpdate(BaseModel):
    ai_provider: str
    ai_api_key: str

@app.post("/settings")
async def update_settings(data: SettingsUpdate, user_id: str = Query(...), db: AsyncSession = Depends(get_db)):
    await db.execute(
        update(User).where(User.id == user_id).values(
            ai_provider=data.ai_provider,
            ai_api_key=data.ai_api_key
        )
    )
    await db.commit()
    return {"success": True}

# ─── AI GENERATION ────────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    company_name: str
    target_role: str
    offer: str
    tone: str = "professional"

@app.post("/generate")
async def generate(data: GenerateRequest, user_id: str = Query(...), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.ai_api_key:
        raise HTTPException(status_code=400, detail="AI API key not configured. Go to Settings.")

    try:
        generated = await generate_email(
            provider=user.ai_provider,
            api_key=user.ai_api_key,
            company_name=data.company_name,
            target_role=data.target_role,
            offer=data.offer,
            tone=data.tone
        )
        return generated
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")

# ─── CAMPAIGNS ────────────────────────────────────────────────────────────────

class CampaignCreate(BaseModel):
    name: str
    recipient_emails: List[str]
    company_name: str
    target_role: str
    offer: str
    tone: str = "professional"
    subject: str
    email_body: str
    followup_subject: Optional[str] = None
    followup_body: Optional[str] = None
    schedule_type: str = "now"  # now, once, recurring
    schedule_datetime: Optional[str] = None
    recurrence_days: Optional[int] = None

@app.post("/campaigns")
async def create_campaign(data: CampaignCreate, user_id: str = Query(...), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    campaign_id = str(uuid.uuid4())
    send_dt = None
    if data.schedule_datetime:
        try:
            send_dt = datetime.fromisoformat(data.schedule_datetime)
        except:
            pass

    campaign = Campaign(
        id=campaign_id,
        user_id=user_id,
        name=data.name,
        recipient_emails=data.recipient_emails,
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
        status="scheduled" if data.schedule_type != "now" else "sending",
    )
    db.add(campaign)
    await db.commit()

    # Trigger sending
    if data.schedule_type == "now":
        import asyncio
        asyncio.create_task(process_campaign_sending(campaign_id))
    elif send_dt:
        schedule_campaign(campaign_id, send_dt)

    return {"id": campaign_id, "status": campaign.status}

@app.get("/campaigns")
async def list_campaigns(user_id: str = Query(...), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Campaign).where(Campaign.user_id == user_id).order_by(Campaign.created_at.desc())
    )
    campaigns = result.scalars().all()
    
    output = []
    for c in campaigns:
        # Get stats
        logs_result = await db.execute(select(EmailLog).where(EmailLog.campaign_id == c.id))
        logs = logs_result.scalars().all()
        
        output.append({
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
                "sent": sum(1 for l in logs if l.status in ["sent", "followup_sent"]),
                "replied": sum(1 for l in logs if l.status == "replied"),
                "followup_sent": sum(1 for l in logs if l.followup_sent),
                "pending": sum(1 for l in logs if l.status == "pending"),
            }
        })
    
    return output

@app.get("/campaigns/{campaign_id}/logs")
async def get_campaign_logs(campaign_id: str, user_id: str = Query(...), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(EmailLog).where(EmailLog.campaign_id == campaign_id, EmailLog.user_id == user_id)
    )
    logs = result.scalars().all()
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
        for l in logs
    ]

@app.get("/stats")
async def get_stats(user_id: str = Query(...), db: AsyncSession = Depends(get_db)):
    campaigns_result = await db.execute(select(Campaign).where(Campaign.user_id == user_id))
    campaigns = campaigns_result.scalars().all()
    
    logs_result = await db.execute(select(EmailLog).where(EmailLog.user_id == user_id))
    logs = logs_result.scalars().all()
    
    return {
        "total_campaigns": len(campaigns),
        "total_sent": sum(1 for l in logs if l.status in ["sent", "followup_sent", "replied"]),
        "total_replied": sum(1 for l in logs if l.status == "replied"),
        "reply_rate": round(
            sum(1 for l in logs if l.status == "replied") / max(len(logs), 1) * 100, 1
        ),
        "active_campaigns": sum(1 for c in campaigns if c.status == "active"),
    }

@app.delete("/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, user_id: str = Query(...), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id, Campaign.user_id == user_id)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    await db.delete(campaign)
    await db.commit()
    return {"success": True}
