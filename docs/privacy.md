# Privacy and Data Handling Draft

ScholarSync v1 stores only the minimum data needed for personal research reports.

## Stored data

- Reddit post ID, subreddit name, permalink, title, author display name, score, and creation timestamp.
- Public comment IDs, author display names, timestamps, scores, and short excerpts.
- Derived citation metadata, keywords, and export files.

## Data not stored in v1

- Full thread archives.
- Private messages, modmail, deleted private data, email addresses, IP addresses, or browsing history.
- Any data used for model training.

## Retention and deletion

Reports are intended to be deletable by the local user. A production build must include explicit deletion controls before storing live Reddit API data.

## User expectations

ScholarSync should make clear that it handles public Reddit content for personal research workflows and should honor subreddit or user-level removal requirements where applicable.
