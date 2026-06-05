export type CitationStyle = "apa" | "mla";

export type RedditCommentExcerpt = {
  id: string;
  author: string;
  createdUtc: string;
  score: number;
  excerpt: string;
};

export type RedditThread = {
  id: string;
  subreddit: string;
  title: string;
  author: string;
  permalink: string;
  url: string;
  createdUtc: string;
  score: number;
  commentCount: number;
  excerpts: RedditCommentExcerpt[];
};

export type Citation = {
  style: CitationStyle;
  text: string;
};

export type ThreadAnalysis = {
  keywords: string[];
  themes: string[];
  summary: string;
};

export type ResearchReport = {
  id: string;
  createdAt: string;
  source: RedditThread;
  citations: Citation[];
  analysis: ThreadAnalysis;
};

export type ExportFormat = "json" | "csv";
