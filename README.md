# ScholarSync

ScholarSync is a personal Reddit research reader skeleton. It is designed for low-volume, OAuth-authorized use with public Reddit content and real citation/export workflows.

The first milestone uses deterministic fixtures instead of live Reddit API calls. This keeps the app useful for development while the API posture, privacy policy, and OAuth setup are kept explicit.

## Project layout

- `apps/web` - Next.js dashboard and report API routes.
- `services/worker` - Python citation, keyword, and export helpers.
- `packages/shared` - shared TypeScript schemas and fixture data.
- `docs` - API-use, privacy, compliance, and setup notes.

## Local setup

```sh
npm install
npm run dev
```

Python worker tests use the standard library:

```sh
npm run test:python
```

## Reddit API posture

ScholarSync is not a hidden general-purpose Reddit client. The intended use is a personal or small private research reader that uses official OAuth, stores only necessary metadata and short excerpts in v1, and avoids bulk archiving, scraping, re-identification, or model training.
