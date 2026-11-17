# Giving the agent a browser

This is how you drive a page in the app, and ask it questions.

It uses [agent-browser](https://github.com/vercel-labs/agent-browser), a CLI
built for exactly this — one command per action, an answer on stdout.

## Once, per machine

```bash
npm install -g agent-browser
agent-browser install
```

The factory workflows install it before the agent starts, so in CI
`agent-browser` is already on the PATH.

## Asking your own question

Start the app with `npm run dev` first. The examples below use
`http://localhost:5173`, the dev server's default address — if `npm run dev`
printed a different one, use that.

A screenshot is pixels. To verify a fix you need a yes or a no, so read the
DOM:

```bash
agent-browser open http://localhost:5173/courses
agent-browser find placeholder "Search courses..." fill "typescript"
agent-browser find role button click --name "Search"

# Did the search reach the URL?
agent-browser get url

# How many course cards came back?
agent-browser get count 'a[href^="/courses/"]'

# What does the empty state say, if there is one?
agent-browser get text main

# Did anything break?
agent-browser errors
agent-browser console
```

The commands worth knowing: `open`, `click`, `fill`,
`find <role|text|label|placeholder> …`, `wait`, `get text|html|attr|count|url`,
`is visible|enabled|checked`, `eval`, `snapshot` (the accessibility tree, with
refs), `screenshot`, `console`, `errors`, `close`. `agent-browser --help` has
the rest.

**Ask the page, do not ask the person.** A change you have not looked at is a
change you are reporting on trust.

Screenshots are PR evidence: a before and an after for a change that shows in
the UI.

## Signing in and reaching a page

Most pages need a signed-in user. Sign in the way the DevUI panel does: post a
user id to `/api/switch-user` from inside the page, so the browser keeps the
cookie.

```bash
agent-browser open http://localhost:5173/
agent-browser eval "fetch('/api/switch-user', {method: 'POST', body: new URLSearchParams({userId: '5'})}).then(r => r.status)"
agent-browser open http://localhost:5173/courses/introduction-to-typescript/lessons/1
```

`npm run db:seed` always creates the same data, so these work on any fresh
database:

| User        | id  | Role       | Useful for                                                                    |
| ----------- | --- | ---------- | ----------------------------------------------------------------------------- |
| Alex Rivera | 1   | admin      | `/admin/*`                                                                    |
| Sarah Chen  | 2   | instructor | teaches `introduction-to-typescript` (course 1)                               |
| Emma Wilson | 5   | student    | enrolled in `introduction-to-typescript` and `building-rest-apis-with-nodejs` |

| Page, as Emma                                 | Path                                               |
| --------------------------------------------- | -------------------------------------------------- |
| A lesson with a video, notes and discussion   | `/courses/introduction-to-typescript/lessons/1`    |
| A lesson with a quiz                          | `/courses/introduction-to-typescript/lessons/3`    |
| A lesson she has not bought (the locked view) | `/courses/design-systems-with-tailwind/lessons/40` |

For anything else, query `data.db` with `sqlite3`.

## Two things that will bite you

**Hydration lags "networkidle".** The button is in the server HTML before
React attaches its `onClick`, so the first click can be a silent no-op. Poll
for the click's effect and click again, rather than waiting a fixed time.

**Vite re-optimizes on the first load.** On a fresh checkout, the first page
load discovers dependencies Vite has not pre-bundled, and pushes a full-page
reload a moment after the response has finished. Absorb it once against a
throwaway load before the real loop; otherwise it lands mid-interaction and
every click after it hits a page that is already navigating away.
