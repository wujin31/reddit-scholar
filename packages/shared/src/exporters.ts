import type { ResearchReport } from "./schemas";

const escapeCsv = (value: string | number) => {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
};

export function reportToCsv(report: ResearchReport) {
  const rows = [
    ["report_id", "thread_id", "subreddit", "title", "permalink", "keyword", "citation_apa"],
    ...report.analysis.keywords.map((keyword) => [
      report.id,
      report.source.id,
      report.source.subreddit,
      report.source.title,
      report.source.permalink,
      keyword,
      report.citations.find((citation) => citation.style === "apa")?.text ?? ""
    ])
  ];

  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}
