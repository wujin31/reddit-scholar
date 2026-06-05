import { formatCitation, reportToCsv, type ResearchReport, type RedditThread } from "@scholarsync/shared";
import fixture from "../../../packages/shared/fixtures/thread.json";

const thread = fixture as RedditThread;

export function analyzeThread(source: RedditThread) {
  const text = [source.title, ...source.excerpts.map((excerpt) => excerpt.excerpt)].join(" ").toLowerCase();
  const candidateTerms = [
    "archive",
    "community",
    "coordination",
    "libraries",
    "mutual aid",
    "neighborhood",
    "persistence",
    "tools"
  ];

  const keywords = candidateTerms.filter((term) => text.includes(term)).slice(0, 6);

  return {
    keywords,
    themes: ["Local knowledge networks", "Civic infrastructure", "Public memory"],
    summary:
      "The fixture discussion centers on durable neighborhood communication, trusted public institutions, and coordination practices before large social platforms."
  };
}

export function createMockReport(): ResearchReport {
  return {
    id: "report_mockscholar",
    createdAt: "2026-06-04T23:30:00.000Z",
    source: thread,
    citations: [
      { style: "apa", text: formatCitation(thread, "apa") },
      { style: "mla", text: formatCitation(thread, "mla") }
    ],
    analysis: analyzeThread(thread)
  };
}

export function exportMockReport(format: "json" | "csv") {
  const report = createMockReport();

  if (format === "csv") {
    return reportToCsv(report);
  }

  return JSON.stringify(report, null, 2);
}
