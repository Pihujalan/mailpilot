# MailPilot 🚀
AI-powered cold outreach automation. Generate personalized emails, send via Gmail, schedule follow-ups, and track replies.

## Setup

### 1. Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

### 3. Google OAuth Setup
Your `.env` already has the credentials from the JSON file.

**Important — add your Gmail account as a test user:**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to your project → OAuth consent screen
3. Under "Test users" → Add your Gmail address
4. This is required while the app is in "Testing" mode

### 4. Configure AI Provider
1. Open http://localhost:5173
2. Sign in with Google
3. Go to Settings → paste your API key (OpenAI, Anthropic, Gemini, or Groq)

## Features
- ✅ Gmail OAuth login — send from your own Gmail
- ✅ AI email generation (GPT / Claude / Gemini / Groq)
- ✅ 3-step campaign builder
- ✅ Schedule: now / once / every X days
- ✅ Auto follow-up after 3 days if no reply
- ✅ Reply detection via IMAP (checks every 30 min)
- ✅ Campaign dashboard with live stats
- ✅ Per-campaign email logs

## Stack
- **Frontend**: React + Vite + Tailwind
- **Backend**: FastAPI + SQLite + APScheduler
- **Auth**: Google OAuth2
- **Email**: Gmail API
- **AI**: OpenAI / Anthropic / Google Gemini / Groq
