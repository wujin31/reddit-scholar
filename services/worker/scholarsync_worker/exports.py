from __future__ import annotations

import csv
from io import StringIO
from typing import Any


def report_to_csv(report: dict[str, Any]) -> str:
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["report_id", "thread_id", "subreddit", "title", "permalink", "keyword", "citation_apa"])

    apa = next((item["text"] for item in report["citations"] if item["style"] == "apa"), "")
    for keyword in report["analysis"]["keywords"]:
        writer.writerow(
            [
                report["id"],
                report["source"]["id"],
                report["source"]["subreddit"],
                report["source"]["title"],
                report["source"]["permalink"],
                keyword,
                apa,
            ]
        )

    return output.getvalue()
