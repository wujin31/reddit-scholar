from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

CitationStyle = Literal["apa", "mla"]


def _display_date(iso_date: str) -> str:
    value = iso_date.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(value)
    return parsed.strftime("%B %-d, %Y")


def format_citation(thread: dict[str, Any], style: CitationStyle) -> str:
    date = _display_date(thread["createdUtc"])
    title = thread["title"].removesuffix(".")
    sentence_title = title if title.endswith((".", "?", "!")) else f"{title}."
    mla_title = title if title.endswith((".", "?", "!")) else f"{title}."

    if style == "mla":
        return f'{thread["author"]}. "{mla_title}" Reddit, r/{thread["subreddit"]}, {date}, {thread["url"]}.'

    return f'{thread["author"]}. ({date}). {sentence_title} Reddit. {thread["url"]}'
