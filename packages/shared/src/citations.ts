import type { CitationStyle, RedditThread } from "./schemas";

const formatDate = (isoDate: string) => {
  const date = new Date(isoDate);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(date);
};

export function formatCitation(thread: RedditThread, style: CitationStyle) {
  const date = formatDate(thread.createdUtc);
  const title = thread.title.replace(/\.$/, "");
  const sentenceTitle = /[.?!]$/.test(title) ? title : `${title}.`;
  const mlaTitle = /[.?!]$/.test(title) ? title : `${title}.`;

  if (style === "mla") {
    return `${thread.author}. "${mlaTitle}" Reddit, r/${thread.subreddit}, ${date}, ${thread.url}.`;
  }

  return `${thread.author}. (${date}). ${sentenceTitle} Reddit. ${thread.url}`;
}
