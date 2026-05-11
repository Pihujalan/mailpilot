"""
celery_worker.py

Local dev:
  celery -A celery_worker worker --beat --loglevel=info
"""

import asyncio
from celery import Celery
from datetime import datetime, timezone, timedelta
import uuid
import os
import ssl
from dotenv import load_dotenv

load_dotenv()

# ─── App ──────────────────────────────────────────────────────────────────────

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery("mailpilot", broker=REDIS_URL, backend=REDIS_URL)

# Only apply SSL config for rediss:// (TLS) connections
_ssl_config = (
    {"ssl_cert_reqs": ssl.CERT_REQUIRED}
    if REDIS_URL.startswith("rediss://")
    else {}
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
    **({"broker_use_ssl": _ssl_config, "redis_backend_use_ssl": _ssl_config} if _ssl_config else {}),
    beat_schedule={
        "check-replies-every-2-min": {
            "task": "celery_worker.check_replies_task",
            "schedule": 120.0,
        },
        "send-followups-every-hour": {
            "task": "celery_worker.send_followups_task",
            "schedule": 3600.0,
        },
        # Recurring campaigns are loaded from DB at startup — see load_recurring_campaigns_task
        "load-recurring-campaigns-on-startup": {
            "task": "celery_worker.reload_recurring_campaigns_task",
            "schedule": 3600.0,  # re-sync every hour in case of Beat restart
        },
    },
)

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _run(coro):
    """Run an async coroutine from a sync Celery task using asyncio.run()."""
    return asyncio.run(coro)


def _build_cred_dict(user) -> dict:
    return {
        "token": user.access_token,
        "refresh_token": user.refresh_token,
        "token_uri": "https://oauth2.googleapis.com/token",
        "client_id": os.getenv("GOOGLE_CLIENT_ID"),
        "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
        "scopes": [
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/gmail.readonly",
        ],
    }

# ─── Tasks ────────────────────────────────────────────────────────────────────

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60, name="celery_worker.send_campaign")
def send_campaign(self, campaign_id: str, is_recurring: bool = False):
    try:
        _run(_send_campaign_async(campaign_id, is_recurring))
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(name="celery_worker.check_replies_task")
def check_replies_task():
    _run(_check_replies_async())


@celery_app.task(name="celery_worker.send_followups_task")
def send_followups_task():
    _run(_send_followups_async())


@celery_app.task(name="celery_worker.reload_recurring_campaigns_task")
def reload_recurring_campaigns_task():
    """
    Re-registers all active recurring campaigns into Beat's schedule.
    Called hourly so that Beat restarts don't silently drop recurring jobs.
    The API no longer mutates celery_app.conf.beat_schedule directly —
    it writes to the DB and lets this task (or schedule_recurring_campaign)
    handle Beat registration.
    """
    _run(_reload_recurring_campaigns_async())


def schedule_recurring_campaign(campaign_id: str, recurrence_days: int):
    """
    Called by the API after creating a recurring campaign.
    Registers the periodic task into Beat's live schedule AND persists it
    so reload_recurring_campaigns_task can restore it after a restart.
    """
    celery_app.conf.beat_schedule[f"campaign-{campaign_id}"] = {
        "task": "celery_worker.send_campaign",
        "schedule": recurrence_days * 86400.0,
        "args": [campaign_id, True],
    }


def unschedule_recurring_campaign(campaign_id: str):
    """Called by the API when a recurring campaign is deleted."""
    celery_app.conf.beat_schedule.pop(f"campaign-{campaign_id}", None)

# ─── Async implementations ────────────────────────────────────────────────────

async def _send_campaign_async(campaign_id: str, is_recurring: bool = False):
    from database import AsyncSessionLocal, Campaign, EmailLog, User
    from email_sender import send_email
    from sqlalchemy import select, update

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Campaign).where(Campaign.id == campaign_id))
        campaign = result.scalar_one_or_none()
        if not campaign:
            return

        result = await session.execute(select(User).where(User.id == campaign.user_id))
        user = result.scalar_one_or_none()
        if not user:
            return

        cred_dict = _build_cred_dict(user)
        now = datetime.now(timezone.utc)

        for recipient in (campaign.recipient_emails or []):
            if not is_recurring:
                existing = await session.execute(
                    select(EmailLog).where(
                        EmailLog.campaign_id == campaign_id,
                        EmailLog.recipient == recipient,
                        EmailLog.email_type == "initial",
                    )
                )
                if existing.scalar_one_or_none():
                    continue

            result = await send_email(
                cred_dict=cred_dict,
                sender_email=user.email,
                to=recipient,
                subject=campaign.subject,
                body=campaign.email_body,
            )

            log = EmailLog(
                id=str(uuid.uuid4()),
                campaign_id=campaign_id,
                user_id=user.id,
                recipient=recipient,
                email_type="initial",
                subject=campaign.subject,
                status="sent" if result["success"] else "failed",
                gmail_message_id=result.get("message_id"),
                gmail_thread_id=result.get("thread_id"),
                sent_at=now if result["success"] else None,
                next_followup_at=now + timedelta(days=3) if result["success"] else None,
            )
            session.add(log)

            if result.get("updated_creds"):
                await session.execute(
                    update(User).where(User.id == user.id).values(
                        access_token=result["updated_creds"]["token"],
                        refresh_token=result["updated_creds"].get("refresh_token") or user.refresh_token,
                    )
                )

        await session.execute(
            update(Campaign).where(Campaign.id == campaign_id).values(status="active")
        )
        await session.commit()


async def _check_replies_async():
    from database import AsyncSessionLocal, EmailLog, User
    from email_sender import check_for_reply
    from sqlalchemy import select, update

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(EmailLog, User)
            .join(User, User.id == EmailLog.user_id)
            .where(
                EmailLog.status.in_(["sent", "followup_sent"]),
                EmailLog.gmail_thread_id.isnot(None),
            )
        )
        rows = result.all()

        for log, user in rows:
            has_reply = await check_for_reply(
                _build_cred_dict(user),
                log.gmail_thread_id,
                log.gmail_message_id,
                user.email,
            )
            if has_reply:
                await session.execute(
                    update(EmailLog).where(EmailLog.id == log.id).values(
                        status="replied",
                        replied_at=datetime.now(timezone.utc),
                    )
                )

        await session.commit()


async def _send_followups_async():
    from database import AsyncSessionLocal, Campaign, EmailLog, User
    from email_sender import send_email
    from sqlalchemy import select, update

    async with AsyncSessionLocal() as session:
        now = datetime.now(timezone.utc)
        result = await session.execute(
            select(EmailLog, Campaign, User)
            .join(Campaign, Campaign.id == EmailLog.campaign_id)
            .join(User, User.id == EmailLog.user_id)
            .where(
                EmailLog.status == "sent",
                EmailLog.followup_sent == False,
                EmailLog.next_followup_at <= now,
                Campaign.followup_body.isnot(None),
            )
        )
        rows = result.all()

        for log, campaign, user in rows:
            send_result = await send_email(
                cred_dict=_build_cred_dict(user),
                sender_email=user.email,
                to=log.recipient,
                subject=campaign.followup_subject or f"Re: {campaign.subject}",
                body=campaign.followup_body,
                thread_id=log.gmail_thread_id,
            )
            await session.execute(
                update(EmailLog).where(EmailLog.id == log.id).values(
                    followup_sent=True,
                    status="followup_sent" if send_result["success"] else log.status,
                )
            )

        await session.commit()


async def _reload_recurring_campaigns_async():
    """
    Loads all active recurring campaigns from the DB and re-registers them
    into Beat's schedule. Safe to call multiple times (idempotent).
    """
    from database import AsyncSessionLocal, Campaign
    from sqlalchemy import select

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Campaign).where(
                Campaign.schedule_type == "recurring",
                Campaign.recurrence_days.isnot(None),
                Campaign.status.in_(["active", "scheduled", "sending"]),
            )
        )
        campaigns = result.scalars().all()

    for campaign in campaigns:
        schedule_recurring_campaign(campaign.id, campaign.recurrence_days)


app = celery_app