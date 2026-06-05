# Local Setup

## Requirements

- Node.js 20 or newer.
- npm 10 or newer.
- Python 3.11 or newer.

## Install

```sh
npm install
```

## Run the dashboard

```sh
npm run dev
```

The initial app uses mock Reddit fixtures, so Reddit OAuth credentials are not required.

## Test the worker

```sh
npm run test:python
```

## Future Reddit OAuth

Create a server-side `.env.local` only after official Reddit OAuth access is available:

```sh
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_REDIRECT_URI=http://localhost:3000/api/auth/reddit/callback
REDDIT_USER_AGENT=scholarsync:personal-research-reader:0.1.0
```
