# LinkedIn posting bot

Posts to your LinkedIn profile on a schedule using LinkedIn’s official API. The local **Desk** UI lets you generate, edit, queue, and publish. Content is locked to **Odoo, applied AI, and technology**.

This does **not** scrape LinkedIn, auto-comment, or mass-follow. Those tactics violate LinkedIn’s terms and get accounts restricted. Growth here comes from useful niche posts at peak hours, then you replying in the first hour.

## How it works

1. Niche lives in `content/profile.md` (Odoo / AI / tech).
2. Open the UI with `npm run ui` → [http://127.0.0.1:4567](http://127.0.0.1:4567).
3. Generate or write a post, edit it, queue it. About 40% of auto-drafts get a landscape image; you can force image on/off in the Desk UI. The bot keeps **at least 5 posts** in the queue. The scheduler publishes at **Tue/Wed/Thu 9:15 Asia/Kolkata**.
4. If the queue is empty and `AUTO_PUBLISH=true`, it generates a post and publishes it.

Default is **queue-only**. Keep auto-publish off until the drafts sound like you. Deploy on Render so posting continues when your laptop is off.

## Setup

### 1. Install

```bash
cd linkedin-automate
cp .env.example .env
npm install
```

### 2. Create a LinkedIn app

1. Open [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps) and create an app.
2. On **Products**, add:
   - **Sign In with LinkedIn using OpenID Connect**
   - **Share on LinkedIn** (`w_member_social`)
3. On **Auth**, add redirect URL `http://localhost:3456/callback`.
4. Copy the Client ID and Client Secret into `.env` as `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`.

Optional: in Auth settings, enable refresh tokens so GitHub Actions can keep posting after 60 days.

### 3. Sign in

```bash
npm run auth
```

A browser window opens. After you approve access, tokens are stored in `.data/tokens.json` (gitignored).

Check:

```bash
npm run status
```

### 4. Niche

`content/profile.md` and `content/topics.md` are already pointed at Odoo, applied AI, and technology. Edit them in the UI **Niche** tab so they match your real work.

### 5. OpenAI key (only for AI drafts)

Put `OPENAI_API_KEY` in `.env`. Any OpenAI-compatible endpoint works via `OPENAI_BASE_URL`.

You can skip this and write posts in the Queue tab.

## Daily usage

```bash
npm run ui                            # dashboard + scheduler, opens the browser
```

Or from the CLI:

```bash
npm run draft                         # generate a draft
npm run approve                       # move the latest draft into the queue
npm run fill-queue                    # generate until 5 posts are queued
npm run post -- --dry-run             # print the next post, do not publish
npm run post                          # publish the next queued post now
```

## Schedule

In `.env`:

| Variable | Default | Meaning |
|---|---|---|
| `SCHEDULE` | `3x` | `daily`, `weekdays`, `3x` (Tue/Wed/Thu peak), or `weekly` |
| `POST_HOUR` / `POST_MINUTE` | `9` / `15` | Local time. 9:15am is when desk-workers open LinkedIn |
| `POST_WEEKDAY` | `tuesday` | Used when `SCHEDULE=weekly` |
| `TIMEZONE` | `Asia/Kolkata` | IANA timezone |
| `AUTO_PUBLISH` | `false` | Generate + publish when the queue is empty |
| `QUEUE_MIN` | `5` | Keep this many approved posts ready |
| `IMAGE_CHANCE` | `0.4` | Share of auto-drafts that get an image |

### Option A — Render + GitHub Actions (laptop can be off)

Live Desk UI: [linkedin-automate-z4g7.onrender.com](https://linkedin-automate-z4g7.onrender.com) (HTTP basic auth; set `UI_PASSWORD`).

The **GitHub Action** `.github/workflows/linkedin-post.yml` is what publishes Tue–Thu at 09:15 IST while your laptop is off. The Render web service hosts the white/blue Desk UI.

Render’s **Starter** plan (always-on + a disk at `/var/data`) needs a card on [Billing](https://dashboard.render.com/billing). Until that is added, the service runs on the free plan and sleeps when idle — use the GitHub Action for the schedule, and open the Render URL when you want the UI.

1. Repo: [github.com/tracencode/linkedin-automate](https://github.com/tracencode/linkedin-automate).
2. GitHub Actions secrets: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_PERSON_URN`, `OPENAI_API_KEY`.
3. After LinkedIn tokens expire (~60 days), run `npm run auth` locally and update the access-token secret (and Render env if you use the hosted UI).

`render.yaml` is the Starter + disk layout to apply after billing is on.

### Option B — GitHub Actions

1. Push this repo to GitHub.
2. Add Actions secrets:
   - `LINKEDIN_CLIENT_ID`
   - `LINKEDIN_CLIENT_SECRET`
   - `LINKEDIN_REFRESH_TOKEN` (from `.data/tokens.json`)
   - `LINKEDIN_PERSON_URN` (from `.data/tokens.json`)
   - `OPENAI_API_KEY` (if you want auto-drafts)
3. The workflow `.github/workflows/linkedin-post.yml` runs Tue–Thu at 09:15 IST.
4. It commits queue/history changes after each run.

If LinkedIn rotates the refresh token, `npm run status` locally and update the secret.

### Option C — Local process

```bash
npm run ui      # dashboard + scheduler
npm start       # scheduler only, no UI
```

## Growth notes that actually matter

LinkedIn’s algorithm rewards dwell time and comments, not hashtag spam.

- Post when your audience is at a desk. Weekday mornings beat Sunday nights.
- One idea per post. Specific story or tactic beats a thread of platitudes.
- End with a question people can answer from their own work.
- Reply to comments in the first hour. The bot cannot do that for you — that reply window is where followers come from.
- Three good posts a week outperform daily mediocre ones. Start with `SCHEDULE=3x` if you are unsure.
- Do not buy engagement, run comment pods, or scrape profiles.

## API notes

Personal apps should keep `LINKEDIN_POST_API=ugc`. That is the [Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin) product, which posts via `/v2/ugcPosts`.

The newer `/rest/posts` API is for Marketing / Community Management partners. Set `LINKEDIN_POST_API=rest` only if your app has that access.

## Layout

```
content/profile.md     who you are and how you sound
content/topics.md      rotating angles
content/queue/         approved posts, oldest first
content/drafts/        unreviewed AI drafts
content/history/       published copies
content/history.json   ledger used to avoid double-posting
src/ui/                Desk UI (white/blue), local or Render
src/                   CLI, LinkedIn client, scheduler
```
