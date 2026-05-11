import httpx
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert cold email copywriter. You write personalized, concise, and compelling cold emails that get replies.
Your emails are:
- Short (150-200 words max for initial, 100 words for follow-up)
- Personalized to the company and role
- Clear about the offer/value proposition
- Have a specific, low-friction CTA
- Never sound spammy or generic

Always respond with valid JSON only, no markdown, no explanation."""

def build_prompt(company_name: str, target_role: str, offer: str, tone: str) -> str:
    tone_desc = {
        "professional": "formal and professional",
        "friendly": "warm, conversational and approachable",
        "direct": "straight to the point, no fluff",
        "confident": "bold and confident, like a market leader"
    }.get(tone, "professional")

    return f"""Generate a cold outreach email campaign for the following:

Company: {company_name}
Target Role: {target_role}
Offer/Service: {offer}
Tone: {tone_desc}

Respond ONLY with this JSON structure:
{{
  "subject": "email subject line",
  "body": "full email body with line breaks as \\n",
  "followup_subject": "follow-up subject line",
  "followup_body": "follow-up email body",
  "personalization_reason": "one sentence explaining why this email is personalized to this company"
}}"""


def _parse_json_response(content: str) -> dict:
    """Strip markdown fences and parse JSON. Raises ValueError on failure."""
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```", 2)[-1] if cleaned.count("```") >= 2 else cleaned
        cleaned = cleaned.lstrip("json").strip().rstrip("```").strip()
    return json.loads(cleaned)


async def generate_with_openai(api_key: str, prompt: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.7,
                "max_tokens": 1000
            }
        )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        return _parse_json_response(content)


async def generate_with_claude(api_key: str, prompt: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json"
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 1000,
                "system": SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": prompt}]
            }
        )
        response.raise_for_status()
        data = response.json()
        content = data["content"][0]["text"]
        return _parse_json_response(content)


async def generate_with_gemini(api_key: str, prompt: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}",
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"parts": [{"text": f"{SYSTEM_PROMPT}\n\n{prompt}"}]}],
                "generationConfig": {"temperature": 0.7, "maxOutputTokens": 1000}
            }
        )
        response.raise_for_status()
        data = response.json()
        content = data["candidates"][0]["content"]["parts"][0]["text"]
        return _parse_json_response(content)


async def generate_with_groq(api_key: str, prompt: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.7,
                "max_tokens": 1000
            }
        )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        return _parse_json_response(content)


async def generate_email(
    provider: str,
    api_key: str,
    company_name: str,
    target_role: str,
    offer: str,
    tone: str
) -> dict:
    prompt = build_prompt(company_name, target_role, offer, tone)

    generators = {
        "openai": generate_with_openai,
        "claude": generate_with_claude,
        "gemini": generate_with_gemini,
        "groq": generate_with_groq,
    }

    generator = generators.get(provider)
    if not generator:
        raise ValueError(f"Unknown provider: {provider}")

    try:
        return await generator(api_key, prompt)
    except httpx.HTTPStatusError as e:
        # Log the real error (includes status code and provider) but don't surface it
        logger.error("Provider %s returned HTTP %s", provider, e.response.status_code)
        raise RuntimeError("AI provider returned an error. Check your API key.")
    except (json.JSONDecodeError, KeyError) as e:
        logger.error("Failed to parse response from provider %s: %s", provider, e)
        raise RuntimeError("AI provider returned an unexpected response format.")