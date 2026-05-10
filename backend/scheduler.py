from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.date import DateTrigger
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from database import AsyncSessionLocal, Campaign, EmailLog, User
from email_sender import send_email, check_for_reply
from datetime import datetime, timedelta
import uuid
import os

scheduler = AsyncIOScheduler()

def _build_cred_dict(user: User) -> dict:
    """Build a proper credential dict using env vars for client_id/secret."""
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


async def process_campaign_sending(campaign_id: str, is_recurring: bool = False):
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(select(Campaign).where(Campaign.id == campaign_id))
            campaign = result.scalar_one_or_none()
            if not campaign:
                return

            result = await session.execute(select(User).where(User.id == campaign.user_id))
            user = result.scalar_one_or_none()
            if not user:
                return

            cred_dict = _build_cred_dict(user)
            recipients = campaign.recipient_emails or []

            for recipient in recipients:
                if not is_recurring:
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
            print(f"Campaign {campaign_id} sending complete (recurring={is_recurring})")

        except Exception as e:
            print(f"Error processing campaign {campaign_id}: {e}")


async def check_replies_job():
    """Runs every 2 minutes to check for replies."""
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                select(EmailLog).where(
                    EmailLog.status.in_(["sent", "followup_sent"]),
                    EmailLog.gmail_thread_id.isnot(None)
                )
            )
            logs = result.scalars().all()

            for log in logs:
                user_result = await session.execute(select(User).where(User.id == log.user_id))
                user = user_result.scalar_one_or_none()
                if not user:
                    continue

                cred_dict = _build_cred_dict(user)

                has_reply = await check_for_reply(
                    cred_dict,
                    log.gmail_thread_id,
                    log.gmail_message_id,
                    user.email,
                )
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
    """Runs every hour to send scheduled follow-ups."""
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
                camp_result = await session.execute(select(Campaign).where(Campaign.id == log.campaign_id))
                campaign = camp_result.scalar_one_or_none()
                if not campaign or not campaign.followup_body:
                    continue

                user_result = await session.execute(select(User).where(User.id == log.user_id))
                user = user_result.scalar_one_or_none()
                if not user:
                    continue

                cred_dict = _build_cred_dict(user)

                send_result = await send_email(
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
                        status="followup_sent" if send_result["success"] else log.status
                    )
                )

            await session.commit()

        except Exception as e:
            print(f"Error in followup job: {e}")


def start_scheduler():
    scheduler.add_job(check_replies_job, IntervalTrigger(minutes=2), id="reply_checker", replace_existing=True)
    scheduler.add_job(send_followups_job, IntervalTrigger(hours=1), id="followup_sender", replace_existing=True)
    scheduler.start()
    print("Scheduler started")


def stop_scheduler():
    scheduler.shutdown()


def schedule_campaign(campaign_id: str, schedule_type: str, send_at: datetime = None, recurrence_days: int = None):
    """
    schedule_type='once'      → DateTrigger at send_at
    schedule_type='recurring' → send immediately, then IntervalTrigger every recurrence_days days
    """
    import asyncio

    if schedule_type == "recurring" and recurrence_days:
        asyncio.create_task(process_campaign_sending(campaign_id, is_recurring=True))
        scheduler.add_job(
            process_campaign_sending,
            IntervalTrigger(days=recurrence_days),
            args=[campaign_id, True],
            id=f"campaign_{campaign_id}",
            replace_existing=True,
        )
        print(f"Recurring campaign {campaign_id} scheduled every {recurrence_days} day(s)")

    elif schedule_type == "once" and send_at and send_at > datetime.utcnow():
        scheduler.add_job(
            process_campaign_sending,
            DateTrigger(run_date=send_at),
            args=[campaign_id],
            id=f"campaign_{campaign_id}",
            replace_existing=True,
        )
        print(f"One-time campaign {campaign_id} scheduled for {send_at}")

    else:
        import asyncio
        asyncio.create_task(process_campaign_sending(campaign_id))