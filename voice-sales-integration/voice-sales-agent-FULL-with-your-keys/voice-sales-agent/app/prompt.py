"""Business config loading and prompt construction."""
from __future__ import annotations

import json
import re
from pathlib import Path

import yaml

END_MARKER = "[[END_CALL]]"
END_MARKER_RE = re.compile(r"\[\[\s*END_CALL\s*\]\]")


WORK_TYPES = {
    "appointments": ("Book appointments. Collect the service wanted, preferred date and time, name and phone. "
                     "Offer only times inside business hours. Say the booking is requested and the team will confirm."),
    "support": ("Handle customer support. Understand the problem, collect order or account reference, name, phone "
                "and email, and say a ticket is being created for the team."),
    "orders": ("Take orders and order enquiries. Collect items, quantities, delivery or pickup preference, name, "
               "phone and address when needed. Never take card details; say payment is handled separately."),
    "sales": "Answer questions about products and capture interested callers as leads for a follow-up.",
    "reception": ("Act as the front desk. Answer general questions, take a message (who it is for, what it is about), "
                  "and collect name and phone for a callback."),
}


def business_from_dict(data: dict | None) -> dict:
    data = dict(data or {})
    data.setdefault("company", "Our Company")
    data.setdefault("agent_name", "Assistant")
    data.setdefault("greeting", f"Thanks for calling {data['company']}. How can I help you today?")
    data.setdefault("goodbye", "Thanks for calling. Goodbye!")
    return data


def load_business(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    if isinstance(data.get("business"), dict):  # agent.yaml keeps the business under `business:`
        data = data["business"]
    data.setdefault("company", "Our Company")
    data.setdefault("agent_name", "Assistant")
    data.setdefault("greeting", f"Thanks for calling {data['company']}. How can I help you today?")
    data.setdefault("goodbye", "Thanks for calling. Goodbye!")
    return data


def build_system_prompt(biz: dict, channel: str, meta: dict | None = None) -> str:
    meta = meta or {}
    lines: list[str] = []
    a = lines.append
    a(f"You are {biz['agent_name']}, the voice assistant and sales consultant for {biz['company']}.")
    if biz.get("personality"):
        a(str(biz["personality"]).strip())
    if biz.get("about"):
        a(f"\nABOUT THE BUSINESS:\n{str(biz['about']).strip()}")
    if biz.get("business_hours"):
        a(f"Business hours: {biz['business_hours']}.")

    if biz.get("products"):
        a("\nPRODUCTS AND PRICES (only quote what is listed here):")
        for p in biz["products"]:
            a(f"- {p.get('name')}: {p.get('price', 'ask a consultant')}. {p.get('description', '')}".strip())
    if biz.get("faq"):
        a("\nFREQUENTLY ASKED QUESTIONS:")
        for f in biz["faq"]:
            a(f"Q: {f.get('q')}\nA: {f.get('a')}")
    if biz.get("policies"):
        a("\nPOLICIES:")
        for p in biz["policies"]:
            a(f"- {p}")

    a(f"\nYOUR GOAL: {biz.get('goal', 'Help the caller and capture their details for a follow-up.')}")
    if biz.get("collect"):
        a("Naturally collect these details during the conversation, one at a time: " + "; ".join(biz["collect"]) + ".")
    a(
        "When you have the details, read them back in one short summary (name, phone, email spelled slowly, and any "
        "date, time or request) and ask the caller to confirm. Fix anything they correct, then say what happens next."
    )

    if channel == "phone":
        caller = meta.get("from")
        if caller:
            a(f"The caller's phone number from caller ID is {caller}; confirm it instead of asking them to repeat it.")
        a("You are on a live PHONE CALL.")
    else:
        a("You are in a live VOICE/CHAT conversation on the company website.")

    a(
        "\nSPEAKING STYLE RULES (very important, your words are converted to speech):\n"
        "- Keep every reply to one to three short sentences. Never give long monologues.\n"
        "- Ask only ONE question at a time.\n"
        "- No markdown, no bullet points, no emojis, no asterisks, no URLs read out letter by letter.\n"
        "- Say numbers and prices the way a person would say them out loud.\n"
        "- Never invent facts, prices, or availability that are not given above; offer a callback instead.\n"
        "- If you did not understand, politely ask the caller to repeat.\n"
        "- Be honest that you are an AI assistant if asked.\n"
        f"- When the conversation is complete and you have said goodbye, end your final message with {END_MARKER} "
        "(this hangs up the call). Never use it before saying goodbye."
    )
    return "\n".join(lines)


EXTRACTION_PROMPT = """You extract structured sales lead data from a call transcript.
Return ONLY a JSON object (no prose, no code fences) with exactly these keys:
{"name": string|null, "phone": string|null, "email": string|null, "company": string|null,
 "interest": string|null, "budget": string|null, "timeline": string|null,
 "preferred_callback_time": string|null,
 "request_type": "appointment"|"support"|"order"|"message"|"question"|null,
 "appointment_date": string|null, "appointment_time": string|null, "service": string|null,
 "details_confirmed": boolean,
 "outcome": "sale"|"lead"|"support"|"callback"|"appointment"|"order"|"no_action",
 "summary": string (2-3 sentences), "next_step": string|null}
Rules: use null when unknown; never guess; the email must be a valid address written with @ and a dot
(convert spoken forms like "john dot smith at gmail dot com"); keep the phone number as digits with a leading + if given.

TRANSCRIPT:
"""


def render_transcript(turns: list[dict]) -> str:
    return "\n".join(f"{'Caller' if t['role'] == 'user' else 'Agent'}: {t['text']}" for t in turns)


def parse_json_object(text: str) -> dict | None:
    if not text:
        return None
    text = text.strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
    try:
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if m:
        try:
            obj = json.loads(m.group(0))
            return obj if isinstance(obj, dict) else None
        except json.JSONDecodeError:
            return None
    return None
