# fff-website

Private community site for our friend group: login-protected, mobile-first,
and built module by module. It bundles a shared **calendar**, a **forum**, a
**file library**, a **member directory**, an **admin** console, and
**Klub 100** — a collaborative tool for building and playing the group's
100-song drinking mix.

The interface is bilingual — **Danish is the default and the source of
truth**, with English as a secondary locale (kept in sync by the type system);
members switch language from their profile. The whole app is dark-theme only
and designed for phones first (~390 px), scaling up to desktop.

## Features

### Klub 100

The 100-song drinking game, from idea to party night:

- **Projects** — any member can start a mix (e.g. "Sommerfest 2026"); the
  creator (or an admin) curates it.
- **Suggesting songs** — Spotify-powered search, a touch-friendly picker for
  the song's best ~1-minute segment (optionally a second segment for
  "2×1-minute" songs), a placement hint (early / middle / late) with a note,
  and "Open in Spotify" links to audition tracks.
- **Cheers recordings** — every song gets a ≤10 s "Cheers!" clip, recorded
  in the browser or uploaded, attachable by any member.
- **Voting & curation** — one vote per member per suggestion; the owner
  accepts songs onto the numbered 1–100 tracklist, reorders (drag-and-drop
  or move-to-position), rejects, and restores.
- **Live party playback** — the host connects a Spotify Premium account
  (OAuth + PKCE) and presses play once: the site plays each song's segment
  through the Spotify Web Playback SDK with fades, plays the song's cheers
  between segments, and runs the whole mix unattended. Includes pre-flight
  checks, a big dark now-playing screen with pause/skip, a screen wake
  lock, and crash-safe resume ("resume from #47") persisted server-side.
- **Export** — owners can download a ZIP with `manifest.json`/`.csv`
  (tracklist, segment times, links) and all cheers recordings, for
  assembling a mix offline.

Note: Spotify's dev-mode rules cap connected accounts at 5 and require
Premium for playback hosting — only the party host needs to connect. See
`docs/klub100-prd.md` §6.3 for the platform-constraint research log and
`docs/klub100-phase2-prd.md` for the playback design.

### Calendar

- Ad-hoc events (a one-off date) and recurring events (e.g. "first Wednesday
  of every month", "every 24 December").
- Recurring events keep their content **per occurrence**, so each month/year
  starts blank and can be written up on its own.
- A rich-text description with attachments per event; the files show up in the
  Files section too.
- Personal **iCal subscription feed** — members enable a private link and get
  the calendar on their phone; the link can be regenerated to revoke old URLs.

### Forum

- Categories, threads and replies, all written with the shared rich-text
  editor (pictures and file attachments included — attachments also land in
  Files).
- Threads can be pinned and locked.
- A special **"Events" category** is kept in sync automatically: every
  calendar event gets its own discussion thread.

### Files

- Shared library for photos, small videos and documents, organised into
  optional **folders**.
- Uploads are stored under randomized names and streamed through an
  authenticated route — nothing is served publicly.
- Owners (and admins) can delete their files.

### Members & profiles

- Member directory with names, join dates and bios.
- Profile page to edit your name/bio, change your password, and switch the
  interface language.
- Beyond the plain admin flag, members can hold extra **roles** (e.g. the
  *bestyrelse* with honorary titles), which can gate access to modules.

### Home

- The dashboard greets you and links to every module you can access.
- It flags **new activity since you last visited** each section — numbered
  badges on the Calendar / Forum / Chat / Files / Members cards plus a short
  "recent activity" list — so you can see at a glance what's happened. Klub 100
  is a shared workspace rather than a feed, so it carries no badge.
- The same numbers add up to the count on the installed app's icon, and each
  badge-raising event (new thread or reply, new event, new upload, new member)
  also sends a **push notification** to everyone else.
- Each member decides which of those they want on their phone: the profile has
  a list of **notification toggles** (channel messages, DMs, mentions, forum,
  calendar, files, new members) that applies to all their devices. Switching
  one off only silences the push — the in-app badges keep counting.

### Admin

- Admin-only page to create, rename, (de)activate and delete user accounts,
  manage roles/titles, and reset passwords. There is no self-signup — this is
  a private site.
- An **activity log** records notable actions (logins, uploads, calendar and
  forum changes, account management) for admins to review.

Everything sits behind the login (middleware protects all routes by
default). Features are self-contained modules with a shared design system and
a rich-text editor (`src/modules/content/`) reused by the calendar and forum.

## Stack

- [Next.js](https://nextjs.org/) (App Router, TypeScript) — frontend + API in one app
- [Auth.js / NextAuth v5](https://authjs.dev/) — email + password login, JWT sessions
- [Prisma](https://www.prisma.io/) + SQLite — database
- [Tailwind CSS v4](https://tailwindcss.com/) — styling (dark theme only)
- Spotify Web API + Web Playback SDK — Klub 100 search & live playback
- Docker + Caddy on a Hetzner Cloud server — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Local development

```bash
cp .env.example .env          # defaults work out of the box
npm install
npm run db:migrate            # create/update the local SQLite db
npm run create-user -- --email you@example.com --name "You" --password secret123 --admin
npm run dev                   # http://localhost:3000
```

Klub 100's Spotify features need app credentials in `.env`
(`SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`; the UI degrades gracefully
without them). The per-user connect flow additionally needs the redirect
URI registered in the Spotify dashboard — see the Spotify section of
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

Useful commands:

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` / `npm run typecheck` | Lint / type-check |
| `npm run db:migrate` | Create & apply a migration after schema changes |
| `npm run db:studio` | Browse the database in Prisma Studio |
| `npm run create-user` | Create or update a user from the CLI |

## Adding a feature module

Features are self-contained modules. To add one (say, a `polls` module):

1. Put its server actions and components in `src/modules/polls/`.
2. Add its pages under `src/app/(app)/polls/` — everything inside the
   `(app)` route group is automatically behind the login.
3. Register it in `src/modules/registry.ts` — the nav bar and dashboard pick
   it up from there.
4. Add its user-facing strings to `src/lib/i18n/dictionaries/da.ts` (the
   source of truth) and `en.ts` — never hardcode text.
5. If it needs data, extend `prisma/schema.prisma` and run `npm run db:migrate`.

See the `files` module for the reference implementation, and `CLAUDE.md` for
the full architecture notes.

## Deployment

Pushing to `main` builds a Docker image and deploys it to the Hetzner server
automatically via GitHub Actions. Setup instructions, secrets, and backup
strategy: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
