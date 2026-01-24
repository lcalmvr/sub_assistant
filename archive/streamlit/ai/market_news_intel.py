"""
Market News AI helpers

Generates:
- bullet summary (markdown bullets)
- suggested tags

Uses OpenAI if configured; falls back to lightweight heuristics.
"""

from __future__ import annotations

import os
import json
import re
from typing import Any

from openai import OpenAI


_MODEL = os.getenv("MARKET_NEWS_AI_MODEL", os.getenv("TOWER_AI_MODEL", "gpt-5.1"))


def _client() -> OpenAI:
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY not set")
    return OpenAI(api_key=key)


_TAG_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("ransomware", re.compile(r"ransomware|extortion|decrypt", re.I)),
    ("breach", re.compile(r"breach|data leak|exfiltrat", re.I)),
    ("claims", re.compile(r"claim|loss ratio|litigation|lawsuit", re.I)),
    ("pricing", re.compile(r"pricing|rate(s)?\\b|premium(s)?\\b|hard market|soft market", re.I)),
    ("capacity", re.compile(r"capacity|limit(s)?\\b|tower|reinsur", re.I)),
    ("regulation", re.compile(r"sec\\b|nydfs|gdpr|hipaa|regulat|rulemaking|consent decree", re.I)),
    ("vulnerability", re.compile(r"cve-|vulnerab|zero[- ]day|patch", re.I)),
    ("incident-response", re.compile(r"incident response|forensic|breach coach|notification", re.I)),
    ("systemic-risk", re.compile(r"systemic|widespread|mass exploit|supply chain|critical infrastructure", re.I)),
    ("ai", re.compile(r"\\bai\\b|artificial intelligence|llm|model", re.I)),
]


def _heuristic_tags(text: str, limit: int = 6) -> list[str]:
    tags: list[str] = []
    for tag, pat in _TAG_RULES:
        if pat.search(text):
            tags.append(tag)
        if len(tags) >= limit:
            break
    return tags


def _heuristic_bullets(text: str, limit: int = 4) -> list[str]:
    t = (text or "").strip()
    if not t:
        return []
    # Split into sentences-ish and keep short.
    parts = re.split(r"(?<=[.!?])\\s+", t)
    bullets: list[str] = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if len(p) > 180:
            p = p[:177].rstrip() + "…"
        bullets.append(p)
        if len(bullets) >= limit:
            break
    if not bullets and t:
        bullets = [t[:180] + ("…" if len(t) > 180 else "")]
    return bullets


def suggest_bullets_and_tags(
    *,
    title: str | None,
    url: str | None,
    takeaway: str | None,
    excerpt: str | None,
    max_bullets: int = 5,
    max_tags: int = 8,
) -> dict[str, Any]:
    """
    Returns:
      {
        "bullets": [str],
        "tags": [str],
        "used_ai": bool,
      }
    """
    title = (title or "").strip()
    url = (url or "").strip()
    takeaway = (takeaway or "").strip()
    excerpt = (excerpt or "").strip()

    # Build grounding text (no fetching; user-provided only).
    context_parts = []
    if title:
        context_parts.append(f"TITLE: {title}")
    if url:
        context_parts.append(f"URL: {url}")
    if takeaway:
        context_parts.append(f"UW_TAKEAWAY: {takeaway}")
    if excerpt:
        context_parts.append(f"EXCERPT: {excerpt}")
    context = "\n".join(context_parts).strip()

    if not context:
        return {"bullets": [], "tags": [], "used_ai": False}

    # Prefer AI when available (better tags and bullet quality).
    try:
        client = _client()
        system = (
            "You are an underwriting market-news assistant. "
            "Given user-provided info (title/url/takeaway/excerpt), produce a concise bullet summary and suggested tags. "
            "Do NOT invent facts not present in the input; if the input lacks detail, keep bullets generic and short."
        )
        user = f"""
Create:
1) 3–{max_bullets} bullets summarizing the key underwriting-relevant points (max 18 words each).
2) {max_tags} or fewer short tags (lowercase, hyphenated ok) capturing themes (e.g., ransomware, pricing, regulation).

Input:
{context}

Return strictly as JSON:
{{
  "bullets": ["..."],
  "tags": ["..."]
}}
""".strip()

        rsp = client.chat.completions.create(
            model=_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        content = rsp.choices[0].message.content or "{}"
        data = json.loads(content)
        bullets = [str(b).strip() for b in (data.get("bullets") or []) if str(b).strip()][:max_bullets]
        tags = [str(t).strip().lower() for t in (data.get("tags") or []) if str(t).strip()][:max_tags]
        return {"bullets": bullets, "tags": tags, "used_ai": True}
    except Exception:
        # Fallback: heuristics from available text.
        combined = " ".join([title, takeaway, excerpt]).strip()
        bullets = _heuristic_bullets(combined, limit=min(4, max_bullets))
        tags = _heuristic_tags(combined, limit=min(6, max_tags))
        return {"bullets": bullets, "tags": tags, "used_ai": False}

