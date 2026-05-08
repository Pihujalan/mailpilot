import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from auth import dict_to_credentials, refresh_credentials_if_needed

def build_gmail_service(cred_dict: dict):
    credentials = dict_to_credentials(cred_dict)
    credentials = refresh_credentials_if_needed(credentials)
    service = build("gmail", "v1", credentials=credentials)
    return service, credentials

def create_message(sender: str, to: str, subject: str, body: str, thread_id: str = None):
    message = MIMEMultipart("alternative")
    message["to"] = to
    message["from"] = sender
    message["subject"] = subject
    
    # Plain text
    text_part = MIMEText(body, "plain")
    
    # HTML version
    html_body = body.replace("\n", "<br>")
    html_part = MIMEText(f"""
    <html><body style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333; max-width: 600px;">
        {html_body}
    </body></html>
    """, "html")
    
    message.attach(text_part)
    message.attach(html_part)
    
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    result = {"raw": raw}
    if thread_id:
        result["threadId"] = thread_id
    return result

async def send_email(cred_dict: dict, sender_email: str, to: str, subject: str, body: str, thread_id: str = None):
    try:
        service, updated_creds = build_gmail_service(cred_dict)
        message = create_message(sender_email, to, subject, body, thread_id)
        sent = service.users().messages().send(userId="me", body=message).execute()
        return {
            "success": True,
            "message_id": sent.get("id"),
            "thread_id": sent.get("threadId"),
            "updated_creds": {
                "token": updated_creds.token,
                "refresh_token": updated_creds.refresh_token,
                "token_uri": updated_creds.token_uri,
                "client_id": updated_creds.client_id,
                "client_secret": updated_creds.client_secret,
                "scopes": list(updated_creds.scopes) if updated_creds.scopes else [],
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

async def check_for_reply(cred_dict: dict, thread_id: str, original_message_id: str) -> bool:
    try:
        service, _ = build_gmail_service(cred_dict)
        thread = service.users().threads().get(userId="me", id=thread_id).execute()
        messages = thread.get("messages", [])
        # If more than 1 message in thread, someone replied
        if len(messages) > 1:
            for msg in messages:
                if msg["id"] != original_message_id:
                    # Check it's not from us (check headers)
                    headers = {h["name"]: h["value"] for h in msg["payload"].get("headers", [])}
                    return True
        return False
    except Exception:
        return False
