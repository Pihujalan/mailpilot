from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.date import DateTrigger
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from database import AsyncSessionLocal, Campaign, EmailLog, User
from email_sender import send_email, check_for_reply
from datetime import datetime, timedelta
import uuid
import json

scheduler = AsyncIOScheduler()

async def get_user_creds(user_id: str, session: AsyncSession):
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.access_token:
        return None, None
    cred_dict = {
        "token": user.access_token,
        "refresh_token": user.refresh_token,
        "token_uri": "https://oauth2.googleapis.com/token",
        "client_id": user.id,  # stored separately
        "client_secret": "",
        "scopes": ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"],
    }
    return cred_dict, user

async def process_campaign_sending(campaign_id: str):
    async with AsyncSessionLocal() as session:
        try:
            # Get campaign
            result = await session.execute(select(Campaign).where(Campaign.id == campaign_id))
            campaign = result.scalar_one_or_none()
            if not campaign:
                return

            # Get user with full credentials
            result = await session.execute(select(User).where(User.id == campaign.user_id))
            user = result.scalar_one_or_none()
            if not user:
                return

            cred_dict = {
                "token": user.access_token,
                "refresh_token": user.refresh_token,
                "token_uri": "https://oauth2.googleapis.com/token",
                "client_id": user.id,
                "client_secret": "",
                "scopes": ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"],
            }

            recipients = campaign.recipient_emails or []
            
            for recipient in recipients:
                # Check if already sent to this recipient
                existing = await session.execute(
                    select(EmailLog).where(
                        EmailLog.campaign_id == campaign_id,
                        EmailLog.recipient == recipient,
                        EmailLog.email_type == "initial"
                    )
                )
                if existing.scalar_one_or_none():
                    continue

                result = await send_email(
                    cred_dict=cred_dict,
                    sender_email=user.email,
                    to=recipient,
                    subject=campaign.subject,
                    body=campaign.email_body
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
                    sent_at=datetime.utcnow() if result["success"] else None,
                    next_followup_at=datetime.utcnow() + timedelta(days=3) if result["success"] else None,
                )
                session.add(log)

                # Update user tokens if refreshed
                if result.get("updated_creds"):
                    await session.execute(
                        update(User).where(User.id == user.id).values(
                            access_token=result["updated_creds"]["token"]
                        )
                    )

            await session.execute(
                update(Campaign).where(Campaign.id == campaign_id).values(status="active")
            )
            await session.commit()

        except Exception as e:
            print(f"Error processing campaign {campaign_id}: {e}")

async def check_replies_job():
    """Runs every 30 minutes to check for replies"""
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                select(EmailLog).where(
                    EmailLog.status == "sent",
                    EmailLog.gmail_thread_id.isnot(None)
                )
            )
            logs = result.scalars().all()

            for log in logs:
                user_result = await session.execute(select(User).where(User.id == log.user_id))
                user = user_result.scalar_one_or_none()
                if not user:
                    continue

                cred_dict = {
                    "token": user.access_token,
                    "refresh_token": user.refresh_token,
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "client_id": user.id,
                    "client_secret": "",
                    "scopes": ["https://www.googleapis.com/auth/gmail.readonly"],
                }

                has_reply = await check_for_reply(cred_dict, log.gmail_thread_id, log.gmail_message_id)
                if has_reply:
                    await session.execute(
                        update(EmailLog).where(EmailLog.id == log.id).values(
                            status="replied",
                            replied_at=datetime.utcnow()
                        )
                    )
                    print(f"Reply detected from {log.recipient} on campaign {log.campaign_id}")

            await session.commit()

        except Exception as e:
            print(f"Error in reply check job: {e}")

async def send_followups_job():
    """Runs every hour to send scheduled follow-ups"""
    async with AsyncSessionLocal() as session:
        try:
            now = datetime.utcnow()
            result = await session.execute(
                select(EmailLog).where(
                    EmailLog.status == "sent",
                    EmailLog.followup_sent == False,
                    EmailLog.next_followup_at <= now
                )
            )
            logs = result.scalars().all()

            for log in logs:
                # Get campaign for followup content
                camp_result = await session.execute(select(Campaign).where(Campaign.id == log.campaign_id))
                campaign = camp_result.scalar_one_or_none()
                if not campaign or not campaign.followup_body:
                    continue

                user_result = await session.execute(select(User).where(User.id == log.user_id))
                user = user_result.scalar_one_or_none()
                if not user:
                    continue

                cred_dict = {
                    "token": user.access_token,
                    "refresh_token": user.refresh_token,
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "client_id": user.id,
                    "client_secret": "",
                    "scopes": ["https://www.googleapis.com/auth/gmail.send"],
                }

                result = await send_email(
                    cred_dict=cred_dict,
                    sender_email=user.email,
                    to=log.recipient,
                    subject=campaign.followup_subject or f"Re: {campaign.subject}",
                    body=campaign.followup_body,
                    thread_id=log.gmail_thread_id
                )

                await session.execute(
                    update(EmailLog).where(EmailLog.id == log.id).values(
                        followup_sent=True,
                        status="followup_sent" if result["success"] else log.status
                    )
                )

            await session.commit()

        except Exception as e:
            print(f"Error in followup job: {e}")

def start_scheduler():
    scheduler.add_job(check_replies_job, IntervalTrigger(minutes=30), id="reply_checker", replace_existing=True)
    scheduler.add_job(send_followups_job, IntervalTrigger(hours=1), id="followup_sender", replace_existing=True)
    scheduler.start()
    print("Scheduler started")

def stop_scheduler():
    scheduler.shutdown()

def schedule_campaign(campaign_id: str, send_at: datetime = None):
    if send_at and send_at > datetime.utcnow():
        scheduler.add_job(
            process_campaign_sending,
            DateTrigger(run_date=send_at),
            args=[campaign_id],
            id=f"campaign_{campaign_id}",
            replace_existing=True
        )
    else:
        import asyncio
        asyncio.create_task(process_campaign_sending(campaign_id))
