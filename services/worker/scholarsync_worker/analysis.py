from __future__ import annotations

from collections import Counter
from re import findall
from typing import Any

STOPWORDS = {
    "and",
    "before",
    "could",
    "from",
    "have",
    "into",
    "that",
    "the",
    "their",
    "this",
    "were",
    "with",
}


def analyze_thread(thread: dict[str, Any]) -> dict[str, Any]:
    """Return deterministic lightweight analysis for fixture-backed reports."""
    excerpts = thread.get("excerpts", [])
    text = " ".join([thread.get("title", ""), *[item.get("excerpt", "") for item in excerpts]])
    words = [word for word in findall(r"[a-zA-Z][a-zA-Z-]{3,}", text.lower()) if word not in STOPWORDS]
    counts = Counter(words)
    keywords = [word for word, _ in counts.most_common(6)]

    return {
        "keywords": keywords,
        "themes": ["local knowledge networks", "civic infrastructure", "public memory"],
        "summary": (
            "The discussion emphasizes durable public notices, trusted institutions, "
            "and repeated coordination in local communities."
        ),
    }
