from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import os
from dotenv import load_dotenv

load_dotenv()

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
]

CLIENT_CONFIG = {
    "web": {
        "client_id": os.getenv("GOOGLE_CLIENT_ID"),
        "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": [os.getenv("GOOGLE_REDIRECT_URI")],
    }
}

def create_flow():
    flow = Flow.from_client_config(
        CLIENT_CONFIG,
        scopes=SCOPES,
        redirect_uri=os.getenv("GOOGLE_REDIRECT_URI")
    )
    return flow

def get_auth_url():
    flow = create_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent"
    )
    return auth_url, state

def exchange_code(code: str):
    flow = create_flow()
    flow.fetch_token(code=code)
    credentials = flow.credentials
    return credentials

def get_user_info(credentials: Credentials):
    service = build("oauth2", "v2", credentials=credentials)
    user_info = service.userinfo().get().execute()
    return user_info

def credentials_to_dict(credentials: Credentials):
    return {
        "token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "token_uri": credentials.token_uri,
        "client_id": credentials.client_id,
        "client_secret": credentials.client_secret,
        "scopes": credentials.scopes,
    }

def dict_to_credentials(cred_dict: dict):
    return Credentials(
        token=cred_dict["token"],
        refresh_token=cred_dict.get("refresh_token"),
        token_uri=cred_dict["token_uri"],
        client_id=cred_dict["client_id"],
        client_secret=cred_dict["client_secret"],
        scopes=cred_dict.get("scopes"),
    )

def refresh_credentials_if_needed(credentials: Credentials):
    if credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())
    return credentials
