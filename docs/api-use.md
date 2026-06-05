# API Use Description

ScholarSync is a personal research-oriented Reddit reader. It is intended to help one user or a small private group review public Reddit discussions, create citations, and export limited metadata for research notes.

## Intended Reddit API access

- Use official OAuth for authorization.
- Read public posts and public comments that the authenticated user is permitted to view.
- Read enough thread metadata to create citations and short report summaries.
- Respect API limits and avoid parallel bulk collection.

## Not intended

- No scraping or use of unofficial credentials.
- No bulk archiving.
- No model training on Reddit content.
- No re-identification, deanonymization, or enrichment of Reddit users.
- No redistribution of full Reddit thread archives.

## Future OAuth variables

The web app will read future credentials from server-side environment variables only:

- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_REDIRECT_URI`
- `REDDIT_USER_AGENT`

Client secrets must never be exposed in browser bundles.
