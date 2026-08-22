# FFF improvement backlog

Every item from the August 2026 site review, written up so that a **fresh
Claude session with no memory of that review can pick up any single item and
implement it**. Each brief carries its own evidence, approach, acceptance
criteria and traps.

- **Derived from:** `docs/website-review-2026-08.md` (the narrative version —
  read it for the reasoning; read this one to do the work).
- **Baseline:** everything below was verified against `490e407`. Line numbers
  drift — treat them as "look near here", and re-grep before trusting one.

---

## How to use this document

**As the owner:** scan the [index](#index), pick an item, and start a session
with something like *"Read `docs/backlog.md` and implement FFF-03."* The IDs
are stable and are never reused or renumbered — if an item is dropped, its row
stays with status `Dropped`. Update the **Status** column as things land.

**Actions only you can take** are collected in
[Manual actions](#manual-actions-owner-only) and repeated inside each item
under *Manual steps*. Nothing marked ⚠️ can be finished by an agent alone.

---

## Orientation for a new session

*Everything in this section is what a fresh agent would otherwise spend an
hour rediscovering. `CLAUDE.md` in the repo root is the authoritative version
— this is the short brief.*

### What the site is

**FFF — Fælles Formiddags Fædre** is a private, login-protected clubhouse for
one small closed group of Danish dads with a board (`bestyrelse`) holding joke
honorary titles. No signup, no public surface, no growth motive. It is
**mobile-first** — members use it as an installed PWA on phones — **dark theme
only**, and **Danish is the source of truth** with English as a secondary
locale.

It does two jobs, and knowing which one an item serves usually settles design
questions:

- **Coordination** (the next few weeks): calendar with recurring traditions +
  ad hoc events, per-occurrence RSVPs, forum, real-time chat, Klub 100.
- **Shared memory** (the last five years): photos, videos, per-occurrence
  write-ups, the folder archive. Irreplaceable, and the half most of the
  "Fix first" items protect.

### Stack and shape

Next.js 15 App Router + TypeScript · NextAuth v5 (credentials + JWT) · Prisma
+ SQLite (WAL) · Tailwind v4 · Docker + Caddy on one Hetzner box.
~31 000 lines, 7 feature modules, 31 migrations.

### House rules that are easy to violate

These are enforced by convention and review, not by the compiler. Breaking one
is the most likely way a change gets sent back:

1. **Never hardcode a user-facing string.** Every one lives in
   `src/lib/i18n/dictionaries/da.ts` (source of truth) *and* `en.ts` (must
   satisfy `typeof da`, so a missing key is a type error). This includes error
   messages returned from server actions.
2. **Every mutating server action starts with `requireSession()` or
   `requireAdmin()`** (`src/lib/auth.ts`) and returns
   `{ error?: string; ok?: boolean }`.
3. **Only `src/lib/storage.ts` may touch `fs`.** Its contract is deliberately
   S3-shaped (opaque flat keys, stream writes, ranged reads) so the eventual
   move to object storage is a change to that one file.
4. **Nothing may navigate the window to a file URL.** In the installed PWA
   there is no browser chrome, so a plain `<a href="/api/files/…">` strands the
   member on iOS's document preview with no way back. Bytes reach members via
   `src/lib/download.ts` / `<SaveButton>`.
5. **A schema change is always committed with its migration**
   (`npm run db:migrate`). Production runs `prisma migrate deploy` on startup.
6. **Use the SVG icon set** (`src/components/icons.tsx`) and the shared class
   recipes (`src/components/ui.tsx`) — never unicode glyphs or one-off styles.
   (Chat currently violates this; that's FFF-18.)
7. **New modules** go in `src/modules/<id>/` + `src/app/(app)/<id>/` +
   `src/modules/registry.ts`. The `files` module is the reference
   implementation.
8. **Push notifications** are filtered **server-side before sending**
   (`src/lib/push.ts`), never in `public/sw.js` — a push that arrives and shows
   nothing makes Chrome post its own notice and makes Safari cancel the
   subscription. Every payload names a category from
   `src/lib/push-categories.ts`, and a new category needs a label in both
   dictionaries.
9. **Upload size is capped in four places that must stay in sync:**
   `next.config.ts` (`serverActions.bodySizeLimit` **and**
   `experimental.middlewareClientMaxBodySize`), `deploy/Caddyfile`
   (`request_body max_size`), and `src/modules/files/types.ts`
   (`MAX_FILE_SIZE`).
10. **Design mobile-first at ~390 px** before desktop: touch targets ≥ 44 px,
    no hover-only interactions, bottom sheets rather than floating modals.

### Commands

```bash
npm run dev          # dev server (needs .env + a migrated db)
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run build        # also catches type errors in pages/actions
npm run db:migrate   # prisma migrate dev — after any schema.prisma change
npm run create-user -- --email a@b.c --name "Name" --password secret123 --admin
```

**There is no test suite yet** (that's FFF-04). Until there is, "verified"
means lint + typecheck + build pass *and* the change was driven in a browser.

### Verifying at the surface

The repo ships a skill for this: **`.claude/skills/verify/SKILL.md`** — read it
before trying to run the app. The traps it documents, briefly:

- **Use `npm run dev`, never `npm start`** — `output: "standalone"` makes
  `next start` silently break server actions.
- Replacing `prisma/dev.db` requires restarting the dev server.
- Drive it with Playwright at **390 × 844**, using the preinstalled browser at
  `/opt/pw-browsers/...` — do not run `playwright install`.
- Don't assert with `textContent("body")`: the root layout serializes the whole
  i18n dictionary into every page, so any string "appears" everywhere.

### Branching, CI and deployment

- Work on a branch. CI (`.github/workflows/ci.yml`) runs lint + typecheck +
  build on every PR and non-main push.
- **Every non-main push also redeploys the single shared staging container** at
  `test.fffloge.dk` (`staging.yml`, concurrency group `staging`,
  cancel-in-progress). Two branches in flight fight over it — coordinate.
  Staging has its own database volume; production data is never touched.
- **Merging to `main` deploys to production automatically** (`deploy.yml`:
  build image → ghcr.io → SSH → `docker compose pull && up -d`). Migrations run
  on container start.
- Rollback is editing the image tag on the server to a previous commit SHA.

### Where things live

| Concern | File |
|---|---|
| Auth guards, `requireSession` / `requireAdmin` / `requireRole` | `src/lib/auth.ts` |
| Edge-safe auth config (JWT callbacks, route authorization) | `src/lib/auth.config.ts` |
| Route protection (everything private by default) | `src/middleware.ts` |
| Module registry (drives nav + dashboard) | `src/modules/registry.ts` |
| Design system class recipes + module accents | `src/components/ui.tsx` |
| SVG icons | `src/components/icons.tsx` |
| Dictionaries | `src/lib/i18n/dictionaries/{da,en}.ts` |
| Badge counts / "new since last visit" | `src/lib/badge.ts`, `src/lib/activity.ts` |
| Push send + category filtering | `src/lib/push.ts`, `src/lib/push-categories.ts`, `src/lib/notify.ts` |
| Object storage (the only `fs` boundary) | `src/lib/storage.ts` |
| Recurrence math | `src/modules/calendar/recurrence.ts` |
| iCal feed | `src/modules/calendar/ics.ts` |
| In-process realtime bus + presence (SSE) | `src/lib/realtime.ts` |
| Audit log writer | `src/lib/audit.ts` |
| Deployment, backups, Spotify setup | `docs/DEPLOYMENT.md` |

---

## Index

Severity/value is what the item is worth; effort is a rough size for one
focused session. ⚠️ = needs something only the owner can do.

| ID | Item | Area | Value | Effort | Manual | Status |
|---|---|---|---|---|---|---|
| [FFF-01](#fff-01--member-deletion-destroys-group-content-and-orphans-the-bytes) | Member deletion destroys group content, orphans bytes | Data | Critical | M | ⚠️ | Done (manual step open) |
| [FFF-02](#fff-02--make-backups-a-running-verified-system) | Make backups a running, verified system | Ops | Critical | M | ⚠️ | Open |
| [FFF-03](#fff-03--error-not-found-and-loading-boundaries) | Error, not-found and loading boundaries | UX | High | S | – | Open |
| [FFF-04](#fff-04--a-first-test-suite) | A first test suite | Quality | High | M | – | Open |
| [FFF-05](#fff-05--login-throttle-and-failed-login-audit) | Login throttle + failed-login audit | Security | Medium | S | – | Open |
| [FFF-06](#fff-06--instant-session-revocation) | Instant session revocation | Security | Medium | S | – | Open |
| [FFF-07](#fff-07--disk-usage-gauge-and-warning) | Disk usage gauge + warning | Ops | Medium | S | – | Open |
| [FFF-08](#fff-08--dependency-hygiene) | Dependency hygiene | Security | High | S | ⚠️ | Open |
| [FFF-09](#fff-09--valarm-in-the-ical-feed) | `VALARM` in the iCal feed | Calendar | High | XS | – | Open |
| [FFF-10](#fff-10--a-scheduler) | A scheduler | Infra | High | M | – | Open |
| [FFF-11](#fff-11--event-reminders-and-rsvp-nudges) | Event reminders + RSVP nudges | Calendar | Highest | M | – | Open |
| [FFF-12](#fff-12--next-event-card-on-the-dashboard) | "Next event" card on the dashboard | Home | High | S | – | Open |
| [FFF-13](#fff-13--global-search) | Global search | Archive | High | L | – | Open |
| [FFF-14](#fff-14--member-pages-and-birthdays) | Member pages + birthdays | Members | Medium | M | ⚠️ | Open |
| [FFF-15](#fff-15--photo-timeline-and-a-year-ago-today) | Photo timeline + "a year ago today" | Archive | High | M | – | Open |
| [FFF-16](#fff-16--invite-links-and-self-service-password-reset) | Invite links + self-service reset | Onboarding | Medium | M | ⚠️ | Open |
| [FFF-17](#fff-17--cap-the-mobile-tab-bar-at-five) | Cap the mobile tab bar at five | UX | Medium | S | – | Open |
| [FFF-18](#fff-18--bring-chat-back-to-the-icon-set) | Bring chat back to the icon set | Design | Low | S | – | Open |
| [FFF-19](#fff-19--refresh-the-readme-and-the-klub-100-prd) | Refresh the README and the Klub 100 PRD | Docs | Low | S | – | Open |

### Suggested order

Blocks, not a strict sequence — each is one coherent piece of work.

1. **Stop the bleeding** — FFF-09 (an hour, immediate benefit), FFF-01, FFF-03.
2. **Protect the archive** — FFF-02, FFF-07.
3. **Make it worth opening** — FFF-10 → FFF-11 → FFF-12. This is the block the
   club actually notices.
4. **Make five years findable** — FFF-13, FFF-15, FFF-14.
5. **Threaded through** — FFF-08, FFF-04, FFF-17, FFF-18, FFF-05, FFF-06,
   FFF-19, FFF-16.

### Dependencies

```
FFF-10 (scheduler) ──┬──▶ FFF-11 (reminders)
                     ├──▶ FFF-14 (birthday greetings — the page itself doesn't need it)
                     ├──▶ FFF-15 ("a year ago today" — the timeline itself doesn't need it)
                     └──▶ FFF-02 (the "last backup" freshness check)

FFF-09 is independent of FFF-10 — ship it first, on its own.
FFF-04 (tests) is worth landing before FFF-01 and FFF-13, which touch shared invariants.
```

---

## Manual actions (owner only)

Collected here so none of them get lost. Each is repeated in its item.

| # | For | What you need to do |
|---|---|---|
| 1 | **FFF-02** | **Buy off-server storage** (a Hetzner Storage Box is the obvious fit — see `docs/DEPLOYMENT.md` §6) and create its credentials. |
| 2 | **FFF-02** | **Add the backup secrets to `/opt/fff-website/.env` on the server** over SSH. Deploy secrets live only on the server — the deploy workflow rewrites `SITE_DOMAIN`/`AUTH_URL` and nothing else, so an agent cannot put them there. |
| 3 | **FFF-02** | **Store the restic repository password somewhere off the server** (password manager). If the box dies with the only copy of that password, the backups are unrecoverable — this is the single most important manual step in the document. |
| 4 | **FFF-02** | **Run one restore drill** and note how long it took. A backup that has never been restored is a hypothesis. |
| 5 | **FFF-01** | **Take a manual backup, then run the orphan sweep against production** over SSH: `npm run sweep-orphans` reports, `npm run sweep-orphans -- --delete` removes. It deletes files off the volume, so it should not run unattended. |
| 6 | **FFF-08** | **Review and merge Dependabot PRs** as they arrive, and eyeball an uploaded photo on staging after the `sharp` major bump. |
| 7 | **FFF-14** | **Collect everyone's birthdays** and enter them (or ask members to fill them in once the field exists). |
| 8 | **FFF-16** | **Change how you add members** — you'll paste an invite link into the group chat instead of inventing a password. |
| 9 | *general* | **Merging to `main` deploys to production.** An agent can open a PR; you decide when it goes live. |

---

## The items

---

### FFF-01 — Member deletion destroys group content and orphans the bytes

**Area** Data integrity · **Value** Critical · **Effort** M · **Manual** ⚠️ (step 5)

#### The problem

`prisma/schema.prisma` states a principle in its own comments — *"events are
group content and must outlive their author"*, *"forum content is group
content and outlives its author"* — and applies it inconsistently. Calendar
events, forum threads and posts, chat messages and chat attachments all use
`onDelete: SetNull`. Five relations use `Cascade`:

| Line | Relation | What a member deletion destroys |
|---|---|---|
| `schema.prisma:665` | `FileItem.uploadedBy` | Every file they uploaded — **including photos inside other people's forum threads and calendar events**, whose `ATTACHMENT` folders point at those exact rows |
| `schema.prisma:691` | `Klub100Project.createdBy` | Every mix they started — cascading to its songs, everyone's cheers recordings and everyone's votes |
| `schema.prisma:753` | `Klub100Song.suggestedBy` | Every song they suggested, including ones already accepted onto someone else's 1–100 tracklist, leaving gaps in the numbering |
| `schema.prisma:795` | `Klub100Cheers.recordedBy` | Every cheers clip they recorded, for anyone's song |
| `schema.prisma:718` | `Klub100DefaultCheers.recordedBy` | The project's fallback clip |

The confirm dialog does warn (`t.admin.confirmDeleteUser`: *"Slet {name}? Deres
uploads bliver også fjernet."*) — so the cascade is disclosed and arguably
intentional. But "deres uploads" badly undersells wiping a collaboratively
built Klub 100 mix.

**Separately, and not a design decision — a plain bug.** `deleteUser`
(`src/modules/admin/actions.ts:74-93`) is a bare `prisma.user.delete`. Every
other delete path removes the stored objects first: `deleteFiles` deletes
original + thumb + display rendition (`src/modules/files/actions.ts:139-146`),
chat deletes attachment bytes (`src/modules/chat/actions.ts:326-327`), Klub 100
deletes cheers bytes (`src/modules/klub100/actions.ts:104,300,458,481`).
`deleteUser` deletes none of them, nor the user's `avatarStoredName`. The rows
vanish from the database while the bytes stay on the `/data` volume forever,
invisible and unreclaimable.

#### Approach

Two independent changes; either can ship without the other.

**A. Flip the cascades to `SetNull`.** Make `FileItem.uploadedById`,
`Klub100Project.createdById`, `Klub100Song.suggestedById`,
`Klub100Cheers.recordedById` and `Klub100DefaultCheers.recordedById` nullable
with `onDelete: SetNull`, matching every other module. Commit the migration.

**B. Give `deleteUser` a real teardown.** Before `prisma.user.delete`, collect
every storage key the deletion would orphan and `deleteObject` them:

- the user's `avatarStoredName`;
- (only if A has *not* shipped) their `FileItem` rows' `storedName`,
  `thumbName`, `displayName`, and their `Klub100Cheers`/`Klub100DefaultCheers`
  `storedName`s.

Even with A shipped, the avatar still needs cleaning up.

**C. A one-off orphan sweep** for bytes already leaked by past deletions: a
script that lists `UPLOAD_DIR`, subtracts every `storedName` / `thumbName` /
`displayName` / `avatarStoredName` referenced in the database, and reports (with
a `--delete` flag it does *not* default to).

#### Files to touch

- `prisma/schema.prisma` + a new migration under `prisma/migrations/`
- `src/modules/admin/actions.ts` (`deleteUser`)
- `src/modules/files/data.ts` (`fileSelect`, `FileRow`, `toFileDTO`) and
  `src/modules/files/types.ts` (`FileDTO.uploadedById`) — these become nullable
- `src/modules/files/actions.ts:135` and `src/modules/files/browser.tsx:954` —
  the "uploader or admin may delete" check
- `src/lib/activity.ts:71` and `src/modules/files/unread.ts:74` — see the trap
  below
- `src/app/(app)/admin/page.tsx:22-35` — the per-user upload stats `groupBy`
- `scripts/` — the new sweep script
- `src/lib/i18n/dictionaries/{da,en}.ts` — if the confirm text changes

#### Watch out for

- **`{ not: userId }` silently drops NULL rows in SQL.** `src/lib/activity.ts:71`
  and `src/modules/files/unread.ts:74` filter unread files with
  `uploadedById: { not: userId }`. Once `uploadedById` can be NULL, a file
  uploaded by a since-deleted member stops counting toward *anyone's* badge,
  because `NULL != 'x'` is `NULL`, not true. Use
  `OR: [{ uploadedById: null }, { uploadedById: { not: userId } }]`.
  The badge and its activity list share one filter by design — fix both, or
  neither, so they cannot disagree.
- **Permission checks degrade to admin-only** for orphaned files
  (`f.uploadedById === session.user.id` is false when null). That's the right
  behaviour; just make it deliberate.
- **SQLite rebuilds the table** to change a column's nullability. Prisma
  generates this correctly, but read the generated SQL before committing.
- `uploadedById` appears in ~20 places (`grep -rn "uploadedById" src/`) — several
  are chat's `MessageAttachment`, which is a *different* model and already
  nullable. Don't confuse them.
- Klub 100 renders suggester names in the pool and tracklist; check those for
  non-null assumptions.

#### Acceptance

- Deleting a member leaves their files, mixes, songs and cheers in place,
  attributed to nobody.
- No orphaned bytes: after deleting a member who had uploaded a photo with
  thumb + display renditions and an avatar, `UPLOAD_DIR` shrinks accordingly.
- Unread badges still count files whose uploader is gone.
- `npm run lint && npm run typecheck && npm run build` clean; the flow driven
  in a browser per `.claude/skills/verify/SKILL.md` (create a member, upload,
  delete the member, confirm the file survives).

#### Manual steps

⚠️ **Take a backup, then run the orphan sweep against production yourself**
over SSH once it's deployed — `npm run sweep-orphans` to see the list,
`npm run sweep-orphans -- --delete` to remove it. It deletes files off the
volume — it should not run unattended, and it should not run before FFF-02
gives you a restore path.

---

### FFF-02 — Make backups a running, verified system

**Area** Ops · **Value** Critical · **Effort** M · **Manual** ⚠️ (steps 1–4)

#### The problem

`docs/DEPLOYMENT.md` §6 offers a nightly `tar czf` of the `app-data` volume as
an *example the reader installs by hand*, with off-server copies described as an
optional extra. Nothing in the repo installs it, nothing verifies it ran, and
no restore has ever been tested.

Two problems beyond "it might not be set up":

- **A tar over a live SQLite database can capture a torn file.** The app runs
  in WAL mode (enabled deliberately — see the `perf(db)` commit); a copy taken
  mid-checkpoint can restore to something corrupt or silently rolled back. The
  correct primitive is `VACUUM INTO` (or `sqlite3 .backup`), which produces a
  consistent snapshot while the app keeps writing.
- **On-server backups don't survive the thing they're for.** One lost Hetzner
  volume takes the group's only copy of five years of photos with it.

This is the highest-value item in the whole backlog. Everything else is
recoverable.

#### Approach

Make it code, not prose.

1. A `backup` service in `deploy/docker-compose.yml`, mounting `app-data`
   read-write (it needs to write the `VACUUM INTO` target) and running on a
   nightly schedule.
2. The job: `VACUUM INTO` a snapshot of the database → archive it together with
   `uploads/` → push to the Storage Box with `restic` (dedupe + integrity
   checks + `restic check`) → `restic forget --prune` on a retention policy
   (e.g. 7 daily, 4 weekly, 6 monthly).
3. **Make success observable.** Write a timestamp (a file on the volume, or a
   tiny table) that the admin page reads and renders as *"Sidste backup: …"*,
   turning red past 48 hours. A backup nobody can see the state of is a backup
   nobody notices has stopped.

#### Files to touch

- `deploy/docker-compose.yml` — the new service
- `deploy/Caddyfile` — untouched
- a backup script (committed, e.g. `deploy/backup.sh`) — the compose file and
  Caddyfile are already synced to the server by both workflows, so add the
  script to the `source:` list in `.github/workflows/deploy.yml` **and**
  `staging.yml`
- `deploy/.env.example` — document the new variables
- `docs/DEPLOYMENT.md` §6 — replace the hand-rolled example with the real thing
- `src/app/(app)/admin/page.tsx` + `src/lib/i18n/dictionaries/{da,en}.ts` — the
  freshness indicator

#### Watch out for

- The database path in production is `/data/db/app.db`; uploads are
  `/data/uploads`. Both live in the single `app-data` volume.
- Don't back up `app-staging-data` — it's throwaway by design.
- `restic` needs its repository password non-interactively; keep it in the
  server `.env`, never in the repo.
- The freshness stamp must survive a container restart — write it to the
  volume, not to memory.

#### Acceptance

- A nightly run produces a restic snapshot off-server, and `restic check`
  passes.
- The admin page shows a real "Sidste backup" timestamp that goes red when
  stale.
- **A restore has actually been performed** into a scratch container and the
  site came up with its data.

#### Manual steps

⚠️ **1. Buy the off-server storage** and create its credentials (a Hetzner
Storage Box is the obvious fit; the cheapest tier is plenty).

⚠️ **2. Add the secrets to `/opt/fff-website/.env` on the server** over SSH —
repository URL, restic password, SSH key. Deploy secrets live only on the
server: the deploy workflow rewrites `SITE_DOMAIN`/`AUTH_URL` and nothing else,
so an agent has no path to put them there.

⚠️ **3. Store the restic password outside the server**, in a password manager.
If the box dies holding the only copy, the backups are unrecoverable. This is
the most important manual step in this document.

⚠️ **4. Run one restore drill** and write down how long it took.

---

### FFF-03 — Error, not-found and loading boundaries

**Area** UX · **Value** High · **Effort** S · **Manual** –

#### The problem

There is no `error.tsx`, `global-error.tsx`, `not-found.tsx` or `loading.tsx`
anywhere under `src/app/`. So:

- Any thrown server error — including the 16 `throw new Error(...)` sites, among
  them `requireSession()` and `requireAdmin()` in `src/lib/auth.ts:56-66` —
  renders Next's stock *"Application error: a server-side exception has
  occurred"*: white-on-black, English, no nav, no brand.
- The 11 `notFound()` call sites render Next's stock 404. Reaching one is
  ordinary: a deleted event, a stale link from a push notification, a
  bookmarked thread.

In a browser tab that's merely ugly. **In the installed PWA it is a dead end** —
`display: "standalone"` means no back button and no address bar, so the only
exit is force-quitting the app. That is exactly the failure mode
`src/components/viewport-guard.tsx` was written to eliminate elsewhere.

`notFound()` call sites: `files/[folderId]`, `forum/t/[id]`,
`forum/t/[id]/[postId]/edit`, `forum/c/[slug]`, `forum/c/[slug]/new`,
`chat/[key]`, `klub100/[id]`, `klub100/[id]/play`, `calendar/[id]`,
`calendar/[id]/edit`, `calendar/[id]/date/[date]/edit`.

#### Approach

Three small files plus a few `loading.tsx`:

- `src/app/(app)/error.tsx` — `"use client"`, branded, Danish, with a "Prøv
  igen" (`reset()`) and a "Til forsiden" link. Inside the `(app)` group so it
  keeps the nav chrome.
- `src/app/global-error.tsx` — the last resort when the root layout itself
  fails. Must render its own `<html>`/`<body>`; keep it dependency-free (it
  cannot rely on the i18n provider) and hardcode the Danish copy with a
  comment saying why.
- `src/app/(app)/not-found.tsx` — same treatment, plus a hint that the thing
  may have been deleted.
- `loading.tsx` for the routes that do real work: `/chat/[key]`,
  `/files/[folderId]`, `/klub100/[id]`, `/forum/t/[id]`.

#### Watch out for

- `error.tsx` must be a client component and takes `{ error, reset }`.
- The i18n provider is mounted in the **root** layout, so `useI18n()` works in
  `(app)/error.tsx` but **not** in `global-error.tsx`.
- Don't leak the error message or digest to the member — log it server-side,
  show something human.
- Style with the existing recipes from `src/components/ui.tsx` (`cardPad`,
  `btnPrimary`, `btnSecondary`, `PageTitle`) rather than new one-offs.
- Check it at 390 px: the bottom tab bar is `position: fixed`, so leave the
  usual bottom padding.

#### Acceptance

- Visiting `/calendar/does-not-exist` shows a branded Danish 404 with working
  navigation, inside the installed app as well as a tab.
- A deliberately thrown error in a page shows the branded error screen and
  "Prøv igen" re-renders.
- Both render correctly at 390 px with the tab bar intact.

---

### FFF-04 — A first test suite

**Area** Quality · **Value** High · **Effort** M · **Manual** –

#### The problem

There is no test suite; CI runs lint, typecheck and build only. That has been
survivable because the modules are well isolated and every change went through
a PR — but there is now a meaningful amount of pure logic where a regression
would be **silent rather than loud**.

#### Approach

Vitest, and deliberately *not* chasing coverage. Roughly twenty tests over the
six files where a regression is invisible:

| File | What to pin down |
|---|---|
| `src/modules/calendar/recurrence.ts` | nth-weekday, last-weekday (`ordinal: -1`), yearly fixed date, month boundaries, leap years, `todayInCopenhagen` wall-clock handling. **A bug here moves the monthly meeting.** |
| `src/modules/calendar/ics.ts` | The emitted RRULE agrees with `recurrence.ts` for each of the three patterns; `TZID=Europe/Copenhagen` present; multi-day `endDayOffset` handled. Consumed by phone calendars that will never report an error. |
| `src/lib/activity.ts` + `src/modules/files/unread.ts` | The shared invariant: "created after your cursor and not by you", section badge and folder badge agreeing; a folder with no `FolderView` row counting from the later of join date and folder creation. |
| `src/lib/push-prefs.ts` | "A missing row means on" — the rule that decides whether a newly added category silently opts everyone out. |
| `src/modules/files/kind.ts` | The single classifier the upload route, grid and viewer all agree on. |
| `src/app/api/files/[id]/route.ts` | The inline-vs-download allow-list — a **security boundary**: `.svg` and `.html` must always be forced to download so an upload cannot run as first-party script. |

Then one Playwright smoke path in CI: log in → open the calendar → RSVP →
upload a file → see it in the folder.

#### Files to touch

- `package.json` — `vitest` + a `test` script
- a `vitest.config.ts`
- `.github/workflows/ci.yml` — add `npm test`
- `CLAUDE.md` and `README.md` — they both currently say there is no test suite

#### Watch out for

- Prefer pure-function tests; they need no database. Where a test does need
  Prisma, point `DATABASE_URL` at a temp file and migrate it in a setup hook —
  don't mock Prisma.
- Playwright: use the preinstalled browser at `/opt/pw-browsers/...`; never run
  `playwright install`. Read `.claude/skills/verify/SKILL.md` first — it has the
  login-flow and assertion traps.
- Keep the smoke test at 390 px, matching how the site is actually used.

#### Acceptance

- `npm test` runs green locally and in CI.
- Deliberately breaking `occurrenceInMonth` fails a test.
- The docs no longer claim there is no test suite.

---

### FFF-05 — Login throttle and failed-login audit

**Area** Security · **Value** Medium · **Effort** S · **Manual** –

#### The problem

`src/lib/auth.ts:31-52` — `authorize()` compares a bcrypt hash and returns
`null` on failure. There is no attempt counter, no lockout, no added delay,
and **no audit entry**: only `auth.login` on success is recorded
(`src/lib/auth.ts:47`). A month of password guessing against
`https://fffloge.dk/login` leaves no trace anywhere an admin can see.

bcrypt at cost 12 is a real brake (~250 ms an attempt), so this isn't urgent —
it's just cheap to close, and the missing audit trail is the part that actually
matters.

#### Approach

1. **Log failures.** `logEvent({ action: "auth.failed", meta: { email } })` on
   every rejected attempt, with an `t.admin.log.events["auth.failed"]` template
   in both dictionaries so the admin log renders it. Never log the password.
2. **Throttle.** An in-memory `Map` keyed by email + IP that adds delay after
   ~5 failures in 15 minutes. The single-process architecture that makes
   `src/lib/realtime.ts` work makes an in-memory limiter work too — no Redis.
   Keep it in its own module so it can move later.

#### Watch out for

- Keep the member-facing error generic — the deactivated-account path already
  deliberately returns the same message as bad credentials, and the throttle
  must not become an account-existence oracle.
- Getting the client IP behind Caddy: `docs/DEPLOYMENT.md` notes that
  Cloudflare in DNS-only mode preserves real client IPs. Don't trust a header
  that any client can set.
- The audit log is admin-visible; `email` is fine there, nothing else is.
- Bound the map, or a stream of random emails grows it without limit.

#### Acceptance

- Five bad passwords produce five `auth.failed` rows on `/admin/log`.
- The sixth attempt within the window is measurably slower.
- A correct password still logs in immediately from a clean IP.

---

### FFF-06 — Instant session revocation

**Area** Security · **Value** Medium · **Effort** S · **Manual** –

#### The problem

Sessions are JWTs with `maxAge: 7 * 24 * 60 * 60`
(`src/lib/auth.config.ts:16`), and role/active state is only re-read when the
token is minted at login. **Deactivating a member leaves their session fully
working for up to a week.** Same for demoting an admin. The admin page
acknowledges this in prose (`t.admin.staleSessionHint`) rather than solving it.

#### Approach

Add a `sessionsValidFrom DateTime?` column to `User`. Stamp it into the JWT at
login (`jwt` callback in `src/lib/auth.config.ts`), and reject any token whose
stamp is older than the stored value. Bump the column on deactivate, password
change and role change.

The constraint that shapes this: **`auth.config.ts` is edge-safe and cannot
import Prisma** (that's why auth is split across two files at all). Two ways
out — either carry the value in the token and compare against a value the
middleware can reach without Prisma, or do the check in the `(app)` layout,
which is a Node server component and *can* query. The layout check is simpler
and covers every page; the middleware would still let API routes through, so
guard those via `requireSession()` too.

#### Files to touch

- `prisma/schema.prisma` + migration
- `src/lib/auth.config.ts` (jwt/session callbacks)
- `src/lib/auth.ts` (stamp at login; bump in the guards' vicinity)
- `src/modules/admin/actions.ts` (deactivate, role change)
- `src/modules/profile/actions.ts` (password change)
- `src/app/(app)/layout.tsx` if the check lands there
- `src/lib/i18n/dictionaries/{da,en}.ts` — remove/replace `admin.staleSessionHint`

#### Watch out for

- Don't import Prisma into `auth.config.ts` — it runs in edge middleware and
  will break the build in a confusing way.
- Bumping on password change also logs the member out of their *own* other
  devices. That's usually wanted; make it a conscious choice and say so in the
  UI copy.
- A per-request database read on every page load is fine at this scale, but put
  it in one place rather than in each page.

**Simpler alternative if this proves fiddly:** shorten `maxAge` to ~24 h and
accept a daily login. Worse UX, one-line change, closes most of the window.

#### Acceptance

- Deactivating a logged-in member logs them out on their next navigation.
- Removing someone's admin role removes the Admin tab on their next
  navigation.
- Their own session is unaffected by an unrelated member's change.

---

### FFF-07 — Disk usage gauge and warning

**Area** Ops · **Value** Medium · **Effort** S · **Manual** –

#### The problem

The `app-data` volume holds the database **and** every upload, on the smallest
Hetzner box, with a 200 MB per-file cap (`MAX_FILE_SIZE` in
`src/modules/files/types.ts:86`) that videos will reach. When it fills, SQLite
writes start failing — the site stops working, and it will surface as a
mystery rather than as "the disk is full".

`src/app/(app)/admin/page.tsx:22-35` shows per-member upload bytes but no
total, no free space and no warning.

#### Approach

- A total-storage panel on the admin page: bytes used by uploads, database
  size, free space on the volume, and a percentage bar.
- A warning push to admins at 80%, using the existing `files` category so it
  respects their notification preferences.

Free space needs `statfs`, which means `fs` — and **only
`src/lib/storage.ts` may touch `fs`** (house rule 3). Add a
`storageStats()` function *there* rather than reaching around it; it maps
cleanly onto a future object-store implementation returning bucket metrics.

#### Files to touch

- `src/lib/storage.ts` — a new `storageStats()`
- `src/app/(app)/admin/page.tsx`
- `src/lib/i18n/dictionaries/{da,en}.ts`
- wherever the threshold check fires (a good first customer for FFF-10's
  scheduler; until then, check it on admin page load)

#### Watch out for

- `formatSize` already exists in `src/lib/format.ts` — reuse it.
- The database in production is at `/data/db/app.db`, outside `UPLOAD_DIR`;
  count it separately.
- Don't send the warning on every page load — debounce it, or wait for FFF-10.

#### Acceptance

- The admin page shows used/free/total with a bar that reads correctly at
  390 px.
- Crossing 80% notifies admins once, not repeatedly.

---

### FFF-08 — Dependency hygiene

**Area** Security · **Value** High · **Effort** S · **Manual** ⚠️ (step 6)

#### The problem

There is no `dependabot.yml` and no Renovate config — `.github/` holds three
workflows and nothing else. GitHub reports **27 Dependabot alerts on `main`
(3 critical, 14 high)**, and `npm audit` against the committed lockfile finds
12 (2 critical, 9 high), several in *production* dependencies:

| Package | Installed | Why it matters here |
|---|---|---|
| `@auth/core` (via `next-auth@5.0.0-beta.31`) | critical ×3 | The whole site is one login. Email-normalizer homoglyph bypass, uncaught exception in `getToken()` on a malformed `Bearer` header, unbound OAuth state/nonce/PKCE cookies |
| `next@15.5.19` | high ×8 | Server Actions DoS in the App Router, SSRF via rewrites, unauthenticated disclosure of internal Server Function endpoints — in an app built almost entirely out of server actions |
| `sharp@0.34.5` | high | Four inherited libvips CVEs, and `src/lib/images.ts` runs sharp over **member-uploaded images** — the one production dependency that decodes attacker-supplied bytes |
| `postcss` (via `next`) | high ×4 | Build-time only: path traversal / arbitrary `.map` disclosure via `sourceMappingURL` |

Realistic exposure is modest — every route is behind a login, the group is
closed, the credentials provider does its own `.toLowerCase()` + `findUnique`
rather than leaning on the vulnerable normalizer, and no OAuth providers are
registered with next-auth (the Spotify flow is hand-rolled). But sharp is a
genuine "untrusted input meets native code" path, and the point of patching is
not to re-reason about each advisory forever.

#### Approach

1. `.github/dependabot.yml` — weekly, **grouped** (one PR for minor+patch, so
   this stays a five-minute chore), covering `npm` and `github-actions`.
2. Clear the backlog once: `npm audit fix` handles `@auth/core`, `postcss` and
   the transitive dev packages without a major bump. `sharp@0.35.x` is flagged
   breaking but the app only uses `rotate`, `resize`, `webp` and `metadata`
   (`src/lib/images.ts`), so it should be a lockfile change plus one careful
   look. Take `next` to the current 15.x patch.
3. Add `npm audit --omit=dev --audit-level=high` to
   `.github/workflows/ci.yml` so the backlog can't silently rebuild.

#### Watch out for

- `sharp` ships platform-specific binaries; the Docker build must still work.
  Verify `npm run build` **and** an actual image upload on staging.
- `next-auth` is on a `5.0.0-beta` line — read the changelog before bumping the
  minor, the beta API has moved before.
- Don't add `npm audit` to CI as a hard gate *before* clearing the backlog, or
  every PR goes red.
- A grouped weekly PR is the point. Ungrouped Dependabot on a hobby repo
  becomes noise and gets ignored, which is worse than not having it.

#### Acceptance

- `npm audit --omit=dev --audit-level=high` exits 0.
- Dependabot opens one grouped PR a week.
- A photo uploaded on staging still thumbnails and displays correctly after the
  sharp bump.

#### Manual steps

⚠️ **Review and merge the Dependabot PRs** as they arrive — an agent can
prepare them, but merging is yours. After the sharp major bump, open a photo on
staging and check the thumbnail and full-screen view yourself.

---

### FFF-09 — `VALARM` in the iCal feed

**Area** Calendar · **Value** High · **Effort** XS · **Manual** –

> **Do this one first.** It is an hour of work, needs no new infrastructure,
> and immediately gives reminders to everyone already subscribed to the feed —
> while FFF-10 and FFF-11 are still unbuilt.

#### The problem

`src/modules/calendar/ics.ts` emits `VEVENT`s with no `VALARM` block. Phone
calendar apps generally do **not** apply a default alert to *subscribed*
calendars, so members who enabled the personal iCal feed from their profile get
the events on their phone and no reminder for any of them.

#### Approach

Add a `VALARM` inside each `VEVENT`:

```
BEGIN:VALARM
TRIGGER:-PT18H
ACTION:DISPLAY
DESCRIPTION:<event title>
END:VALARM
```

`-PT18H` puts an all-day event's alert at 06:00 the previous day — reasonable
for a club whose events are largely morning ones. Consider a shorter trigger
for timed events.

#### Files to touch

- `src/modules/calendar/ics.ts` (the two `BEGIN:VEVENT` sites, ~line 205 and
  ~234 — ad hoc and recurring)

#### Watch out for

- iCal line folding and escaping: `DESCRIPTION` must escape `,`, `;`, `\` and
  newlines, and lines fold at 75 octets. The file already has helpers for
  this — reuse them rather than concatenating raw title text.
- `ACTION:DISPLAY` is the portable choice; `ACTION:AUDIO` behaves
  inconsistently.
- The feed route sets `Cache-Control: private, max-age=300`, and calendar
  clients re-poll on their own slow schedule — expect a delay before it shows
  up on a phone. That's not a bug.
- Test by actually subscribing a phone, not just by reading the output.

#### Acceptance

- The feed validates (an online iCal validator is fine).
- A subscribed iOS and/or Android calendar raises an alert the day before an
  event.

---

### FFF-10 — A scheduler

**Area** Infrastructure · **Value** High · **Effort** M · **Manual** –

> Enables FFF-11, and unlocks parts of FFF-02, FFF-07, FFF-14 and FFF-15.

#### The problem

**There is nothing in the codebase that fires on time.** No cron, no job
runner, no scheduled route — a grep for `cron|setInterval|scheduled|reminder`
finds only a recording timer, an SSE heartbeat and an opportunistic GC comment.
Every notification the site sends is a direct consequence of somebody clicking
something.

That single absence is why the calendar can't remind anyone (FFF-11), why
backups can't report their own freshness (FFF-02), why the disk gauge can't
warn on its own (FFF-07), and why there can be no birthday greeting (FFF-14) or
"a year ago today" (FFF-15).

#### Approach

Two viable shapes; **in-process is the honest choice here**, because the
architecture already assumes exactly one Node process — `src/lib/realtime.ts`
is a process-local `EventEmitter` used as the whole realtime transport, with
that assumption documented.

- **In-process** (`node-cron` or a plain `setInterval` loop) started from a
  module the server imports once. Simple, no new container, shares the Prisma
  client.
- **A `cron` service in compose** curling an authenticated internal route.
  More moving parts and a new shared secret, but survives independently of the
  app process.

Either way:

1. **Idempotency is mandatory.** The container restarts on every deploy, and a
   naive scheduler will re-fire whatever was due. Add a `SentNotification`
   table keyed by `(kind, targetId, targetDate)` with a unique constraint, and
   let the insert be the lock.
2. **Catch-up window.** If the app was down when a job was due, decide
   explicitly whether it fires late or is skipped. For reminders, "fire late
   but only within a few hours" is usually right — nobody wants yesterday's
   reminder at noon today.
3. **Timezone.** The calendar stores Danish wall-clock time (`date` as
   "YYYY-MM-DD", `startMinutes` from local midnight) and the container runs
   UTC. Use the existing helpers in `src/modules/calendar/recurrence.ts`
   (`todayInCopenhagen`) rather than `new Date()` arithmetic.

#### Files to touch

- `prisma/schema.prisma` + migration (`SentNotification`)
- a new `src/lib/scheduler.ts`
- wherever it gets started (an instrumentation hook, or the app layout — must
  run once, not per request)
- `package.json` if `node-cron` is added
- `CLAUDE.md` — document the scheduler alongside the other architecture notes

#### Watch out for

- **Next.js dev mode double-mounts.** Guard the start with the same
  `globalThis` singleton trick `src/lib/db.ts` and `src/lib/realtime.ts` already
  use for HMR.
- Jobs must never throw into the request path; wrap each in try/catch and log,
  exactly as `notifyMembers` and the push senders already do.
- Keep jobs short. This is a single small box also serving SSE connections.
- Don't schedule anything before the app has run its migrations.

#### Acceptance

- A test job fires on schedule and is visible in the logs.
- Restarting the container does not re-fire an already-completed job.
- Nothing regresses in the realtime/SSE behaviour.

---

### FFF-11 — Event reminders and RSVP nudges

**Area** Calendar · **Value** Highest · **Effort** M · **Depends on** FFF-10

#### The problem

The calendar has RSVPs — `EventAttendance`, per occurrence date, three states
(`GOING` / `MAYBE` / `NOT_GOING`), with a roster. Push notifications work well
and have per-category preferences. And yet **nobody is ever reminded of
anything**.

Follow it through:

- The only calendar push is at event **creation**
  (`src/modules/calendar/actions.ts:476`). A recurring series is *one row
  created once* — so the monthly meeting is announced exactly once, ever, and
  then never again across five years of occurrences.
- Nobody is nudged to RSVP, and the organiser is never told who's coming.
- `saveOccurrenceContent` (`src/modules/calendar/actions.ts:604`) notifies no
  one, even though filling in the write-up, agenda or *Arrangør* fields is the
  moment the meeting becomes real.

For a club whose entire rhythm is a recurring meeting, this is the highest-value
thing to build.

#### Approach

Three jobs on FFF-10's scheduler:

1. **Reminder the evening before.** To every active member who hasn't answered
   — *"Fælles formiddag i morgen kl. 09:00 — du har ikke svaret endnu"* —
   deep-linking to `/calendar/{id}?d={date}`, which lands on the RSVP buttons.
2. **Organiser digest on the morning.** To the event creator (and, for
   recurring events, the `PERSON`-typed *Arrangør* field value if one is set) —
   *"7 deltager, 2 måske, 3 har ikke svaret"*.
3. **Content nudge.** When a recurring occurrence is ~a week out with no
   `CalendarOccurrence` row or empty `contentJson`, tell the board.

Consider also notifying on `saveOccurrenceContent` — a direct consequence of a
click, so it needs no scheduler and could ship first.

#### Files to touch

- `src/lib/scheduler.ts` (the jobs)
- `src/modules/calendar/actions.ts` (the occurrence-content notification)
- `src/lib/push-categories.ts` — decide whether these ride the existing
  `calendar` category or get their own (see below)
- `src/lib/i18n/dictionaries/{da,en}.ts` — the notification copy
- `src/lib/notify.ts` if the recipient rules need a second helper

#### Watch out for

- **Reusing the `calendar` category is the safe default.** A member who turned
  calendar notifications off expects silence. If reminders get their own
  category, `PUSH_CATEGORIES` must be extended *and* labelled in both
  dictionaries — the type system enforces the label, nothing enforces that you
  thought about consent. Note the deliberate design: the four section
  categories share ids with `Section` in `src/lib/activity.ts`, so a toggle
  silences exactly the events behind that badge. A reminder isn't a badge
  event, so a separate category is defensible — just decide deliberately.
- **RSVPs are keyed by `(eventId, date, userId)`, not by occurrence row.** A
  `CalendarOccurrence` row may not exist for a date at all — it's created lazily
  when someone first writes content. Compute dates from the recurrence rule,
  not from occurrence rows.
- Recurrence dates come from `nextOccurrences` / `isOccurrenceDate`; validate
  any date against the rule before acting on it, as the existing actions do.
- Deactivated members must not be notified — `notifyMembers` already filters on
  `isActive`; match that.
- Don't notify people who already answered `NOT_GOING`.
- Use a `tag` so repeat reminders replace rather than stack, matching the
  existing convention in `notifyMembers`.

#### Acceptance

- An event tomorrow produces exactly one reminder per un-answered active
  member, and none for those who answered.
- Tapping it opens the event with the RSVP buttons on screen.
- The organiser gets one digest with correct counts.
- Restarting the container doesn't duplicate any of it.

---

### FFF-12 — "Next event" card on the dashboard

**Area** Home · **Value** High · **Effort** S · **Manual** –

#### The problem

`src/app/(app)/page.tsx` greets you with *"Velkommen tilbage i klubhuset. Hvad
skal der ske?"* — and then answers a different question. You get module cards
with unread badges and a "Nyt siden sidst" list. Both look backwards; the
literal question in the greeting goes unanswered.

The most valuable thing on opening the app is: **when do we meet next, where,
and am I signed up?** All of that is already computed elsewhere — it just never
reaches the dashboard.

#### Approach

A "Næste begivenhed" card above the module grid: the next 1–3 occurrences with
date, time, location, a going count, and the three RSVP buttons **inline**, so
answering takes one tap without leaving home.

Everything needed exists: `nextOccurrences` and the ad hoc date query in
`src/app/(app)/calendar/page.tsx` (which already merges ad hoc + recurring for
a month — generalise that into a shared "upcoming" helper rather than
duplicating it), `EventAttendance` for counts, and
`AttendanceControls` (`src/modules/calendar/attendance.tsx`) as a ready-made
client component that already handles pending state and errors.

#### Files to touch

- `src/app/(app)/page.tsx`
- a shared upcoming-occurrences helper (new, e.g.
  `src/modules/calendar/upcoming.ts`) — used by both the dashboard and,
  ideally, refactored into by the calendar page
- `src/lib/i18n/dictionaries/{da,en}.ts`

#### Watch out for

- The dashboard already runs ~10 queries (`getModuleBadgeCounts` +
  `getRecentActivity`). Add the upcoming lookup to the existing
  `Promise.all`, don't serialise it.
- Recurring occurrences are computed, not stored — you cannot query them.
  Compute a window (say the next 60 days) and merge with ad hoc events.
- Multi-day events: an event that started yesterday and runs through tomorrow
  is still "next". The calendar page's overlap logic is the reference.
- `AttendanceControls` calls `setAttendance`, which revalidates the calendar
  path — make sure it revalidates `/` too, or the dashboard count goes stale.
- Keep it compact at 390 px; this sits above the fold and must not push the
  module grid off screen.

#### Acceptance

- The dashboard shows the next event with date, time, location and a going
  count.
- RSVPing from the dashboard updates in place and is reflected on the event
  page.
- Nothing renders when there are no upcoming events (no empty card).

---

### FFF-13 — Global search

**Area** Archive · **Value** High · **Effort** L · **Manual** –

#### The problem

Search exists in exactly one place, and it's the newest content:

- **Chat** has real search (`/chat/search`), backed by the `searchText` column
  maintained on every write.
- **Files** has a search box that filters *the current folder's already-loaded
  items in the browser* — `src/modules/files/browser.tsx:153`. Not recursive,
  not server-side.
- **Forum, calendar, members, Klub 100** have nothing at all.

The archive half of the site is the half that grows. Five years in, "which year
did we do the thing in Skagen?" has no answer except scrolling.

#### Approach

A `/search` page over: forum thread titles and post bodies, file names, event
titles and descriptions, member names, and chat messages — grouped by section,
each group in that module's accent colour from
`src/components/ui.tsx`'s `moduleAccents`.

**SQLite FTS5** is the right tool; Prisma reaches it via `$queryRaw`. The
precedent to copy is chat's: a **locale-lowercased `searchText` column
maintained on every write**, because SQLite's `lower()` is ASCII-only and
Danish has æ, ø and å. `Message.searchText` and the comment on it explain the
approach.

Make the files search recursive and server-side at the same time.

#### Files to touch

- `prisma/schema.prisma` + migration (FTS virtual tables and/or `searchText`
  columns on `ForumPost`, `ForumThread`, `CalendarEvent`,
  `CalendarOccurrence`, `FileItem`)
- a new `src/modules/search/` module + `src/app/(app)/search/page.tsx`
- write paths that must maintain the new columns: `src/modules/forum/actions.ts`,
  `src/modules/calendar/actions.ts`, `src/app/api/files/upload/route.ts`,
  `src/modules/files/actions.ts` (rename)
- `src/modules/files/browser.tsx` + `src/modules/files/data.ts` for recursive
  file search
- `src/lib/i18n/dictionaries/{da,en}.ts`
- entry point: probably **not** a nav module (see FFF-17 — the tab bar is
  already over capacity). A search icon in the header is the better home.

#### Watch out for

- **Backfill.** New columns are empty for existing rows; the migration (or a
  one-off script) must populate them, or search silently returns nothing for
  the entire archive — which is exactly the content this feature is for.
- **Rich text is TipTap JSON**, not plain text (`contentJson` on `ForumPost`,
  `CalendarEvent`, `CalendarOccurrence`). Extract plain text for indexing —
  `src/modules/content/render.ts` is the place to look for existing traversal.
- **Respect access control.** Role-gated chat channels
  (`Conversation.requiredRole`) and DMs must not leak into results. Reuse
  `canAccessConversation` / `viewerFor` from `src/modules/chat/data.ts` rather
  than re-deriving the rules.
- Danish folding: "Skagen" should match "skagen"; decide whether "sø" should
  match "so" (probably not).
- Keep the results page usable at 390 px — grouped sections with a few results
  each, not one long undifferentiated list.

#### Acceptance

- Searching a word that appears in an old forum post, an old event title and an
  old filename returns all three, grouped.
- A member cannot find content from a channel they can't access.
- The files search finds a file in a nested folder from the root.

---

### FFF-14 — Member pages and birthdays

**Area** Members · **Value** Medium · **Effort** M · **Manual** ⚠️ (step 7)

#### The problem

`src/app/(app)/members/page.tsx` renders name, avatar, bestyrelse badge, join
date and bio — and **contains no `Link` at all**. Every member in the group is
a dead end. Meanwhile the schema knows a great deal about each of them:
uploads, threads, events created, songs suggested, cheers recorded, attendance
history.

There is also no birthday field, which for a dads' club is a conspicuous
omission — exactly the kind of thing a clubhouse should remember for you.

#### Approach

1. `/members/[id]`: avatar, bio, title, member since, and a tabbed feed of what
   they've contributed (photos, threads, events, Klub 100 suggestions).
2. Link the directory cards, and link avatars **everywhere they already
   appear** — chat messages (`src/modules/chat/message-item.tsx`), attendance
   rosters, "uploaded by" lines, `PERSON`-typed structured fields.
3. Add an optional `birthday` to `User`, editable on the profile page, shown on
   the member page and (the next few) on the dashboard.
4. Once FFF-10 exists: a greeting posted to the main channel on the day.

#### Files to touch

- `prisma/schema.prisma` + migration (`birthday`)
- new `src/app/(app)/members/[id]/page.tsx`
- `src/app/(app)/members/page.tsx` (links)
- `src/modules/profile/profile-forms.tsx` + `src/modules/profile/actions.ts`
- `src/components/avatar.tsx` and its call sites, if the link is centralised
  there
- `src/lib/i18n/dictionaries/{da,en}.ts`

#### Watch out for

- **Store the birthday as a date without a year, or make the year optional.**
  People will not want their age published. A `String` `"--MM-DD"` or a
  nullable year column is cleaner than a `DateTime` that implies one.
- Deactivated members still have pages — decide whether they're reachable
  (probably yes, they're part of the history) and don't greet them.
- Making the avatar a link inside a chat bubble must not break the existing tap
  targets or the swipe-to-reply gesture in `channel-view.tsx`.
- The contribution feed can get expensive — paginate, or cap each tab.
- Only show a member their *own* email; the directory deliberately doesn't
  expose it.

#### Acceptance

- Tapping a member card opens their page; tapping an avatar in chat does too.
- A birthday can be set and cleared from the profile page and shows in Danish
  date format.
- Nothing exposes another member's email address.

#### Manual steps

⚠️ **Collect everyone's birthdays** — or, once the field exists, ask the group
to fill them in themselves. Nobody can build this data for you.

---

### FFF-15 — Photo timeline and "a year ago today"

**Area** Archive · **Value** High · **Effort** M · **Partly depends on** FFF-10

#### The problem

Files is folder-first, which is right for documents and right for the
`ATTACHMENT` folders the calendar and forum create. But the emotional payload
of this site is **photos**, and photos want a timeline, not a tree. There is no
"everything, newest first", no per-year view, no "photos from this event" that
isn't a folder click, and no way to revisit last summer without remembering
which folder it landed in.

#### Approach

1. A **"Billeder" tab** beside the folder tree in the files section: every
   `FileKind.IMAGE` and `VIDEO` in the library, newest first, grouped by month.
   Reuse the existing tiles (`src/modules/files/items.tsx`) and the viewer
   (`src/modules/files/viewer/`) — the thumb → display → original ladder
   already does all the hard work.
2. Once FFF-10 exists, the payoff: **"For et år siden i dag"** — a push with a
   photo from that date. This is the feature that makes people open the app
   when nothing is scheduled.

#### Files to touch

- `src/modules/files/browser.tsx` (the tab) or a sibling component
- `src/modules/files/data.ts` (a paginated cross-folder media query)
- `src/app/(app)/files/page.tsx`
- `src/lib/scheduler.ts` + `src/lib/i18n/dictionaries/{da,en}.ts` for the push

#### Watch out for

- **Paginate.** A five-year archive is thousands of rows; do not load them all.
  Infinite scroll or month-at-a-time.
- **The viewer's rendition ladder is load-bearing, not an optimisation.**
  `CLAUDE.md` is explicit: decoding each rung off-screen before showing it is
  what stops WebKit painting half-arrived images as grey bands. Reuse the
  existing viewer; do not hand-roll a new one.
- Deleted-folder promotion means a photo's `folderId` can change — sort by
  `createdAt`, not by folder.
- Should the timeline include `ATTACHMENT` folders' photos? Almost certainly
  yes — that's where event photos live. But that means files the member sees in
  two places; make sure selection and deletion still behave.
- "A year ago today" must not fire when there's nothing to show, and must not
  surface a photo the member uploaded themselves as if it were a discovery.

#### Acceptance

- The tab shows every image and video, newest first, grouped by month, and
  scrolls smoothly at 390 px.
- Opening one uses the same viewer as the folder grid.
- The push (once FFF-10 lands) links to that photo.

---

### FFF-16 — Invite links and self-service password reset

**Area** Onboarding · **Value** Medium · **Effort** M · **Manual** ⚠️ (step 8)

#### The problem

`createUser` (`src/modules/admin/actions.ts:27-71`) takes a password typed by
the admin. So the admin knows every member's initial password, has to convey it
over some other channel, and nothing ever forces a change. There is no
self-service reset either: a member who forgets has to ask an admin, who sets a
new one they then also know.

#### Approach

A single-use invite link. Add `inviteToken` + `inviteExpiresAt` to `User`; the
admin creates an account with no password and gets a link to paste into the
group chat. `/invite/[token]` is a public page where the new member sets their
own password, uploads an avatar and writes a bio.

Reuse the same token machinery for admin-initiated resets ("send reset link"
instead of "set new password"). **No mail sender is needed and none should be
added** — the admin pastes the link into the group chat.

#### Files to touch

- `prisma/schema.prisma` + migration
- `src/middleware.ts` — the matcher must exempt `/invite`, the same way it
  already exempts `/api/calendar/feed`
- new `src/app/(auth)/invite/[token]/page.tsx` + its actions
- `src/modules/admin/actions.ts` + `src/modules/admin/admin-controls.tsx`
- `src/lib/i18n/dictionaries/{da,en}.ts`

#### Watch out for

- **The middleware protects everything by default — that is the security
  model.** Adding an exemption is the single most sensitive change in this
  backlog. Match the existing pattern exactly, keep the path narrow, and let
  the token be the only authentication, validated server-side with a
  constant-time comparison and an expiry.
- Follow the iCal feed's precedent (`src/app/api/calendar/feed/[token]/route.ts`):
  a cheap format check before the database lookup, and a generic 404 for
  anything invalid.
- Tokens must be single-use — clear on redemption — and expire (a week is
  plenty).
- A user row with no usable password must not be able to log in; make sure
  `authorize()` rejects it rather than throwing.
- The new-member push in `createUser` currently fires at account creation.
  Consider moving it to redemption, so the club is told when someone actually
  arrives.
- Keep the invite page at 390 px, and don't put the nav chrome on it (it's in
  the `(auth)` group, like login).

#### Acceptance

- An admin can create a member without inventing a password and gets a
  copyable link.
- The link lets a new member set a password and log in; using it twice fails.
- An expired link fails with a clear message.
- Every other route is still behind the login.

#### Manual steps

⚠️ **Your workflow changes** — you'll paste an invite link into the group chat
instead of inventing a password and telling someone. Nothing technical, but
worth knowing before it ships.

---

### FFF-17 — Cap the mobile tab bar at five

**Area** UX · **Value** Medium · **Effort** S · **Manual** –

#### The problem

`MobileTabBar` (`src/components/nav.tsx:76-107`) renders **every** module the
member can see, in a flex row with no overflow handling. A member sees **7 tabs**
(Hjem, Kalender, Forum, Chat, Filer, Klub 100, Fædre); an admin sees **8**.

At the ~390 px target width `CLAUDE.md` names, that's ~55 px per tab for a
member and ~49 px for an admin, carrying 11 px labels. "Kalender" and
"Klub 100" already truncate at the admin width, and the targets have dropped
below the ≥ 44 px comfortable minimum the Klub 100 PRD itself specifies. **The
next module registered breaks it outright** — which matters, because FFF-13 and
FFF-15 both want an entry point.

#### Approach

Cap it at five: **Hjem, Kalender, Chat, Filer, Mere** — where "Mere" opens the
existing bottom `Sheet` (`src/components/sheet.tsx`) listing the rest (Forum,
Klub 100, Fædre, Admin, Profil).

Drive the split from `src/modules/registry.ts` — e.g. a `primary?: boolean`
flag — so adding a module never has to think about it again. Desktop pills
(`DesktopNav`) have room and keep showing everything.

#### Files to touch

- `src/components/nav.tsx`
- `src/modules/registry.ts`
- `src/app/(app)/layout.tsx` (it builds the `NavItem[]`)
- `src/lib/i18n/dictionaries/{da,en}.ts` — a "Mere" label

#### Watch out for

- **The badge counts must roll up.** A member with unread forum posts must see
  a number on "Mere", or they'll never find it. `getModuleBadgeCounts` already
  returns per-module counts — sum the overflowed ones.
- Active state: "Mere" must highlight when the current route is one of the
  modules inside it (`isActive` currently does a simple prefix match).
- The tab bar has careful safe-area and keyboard handling — `pb-[env(safe-area-inset-bottom)]`,
  and the whole `min-h-dvh` reasoning in `src/app/(app)/layout.tsx`. Don't
  disturb it; the drift bugs it solves were painful (see
  `src/components/viewport-guard.tsx`).
- Verify at 390 px **in the installed-app case** if possible, not just a
  browser tab.

#### Acceptance

- Five tabs at every role, labels never truncated at 390 px, targets ≥ 44 px.
- "Mere" opens a sheet with the remaining modules and carries their combined
  badge.
- Desktop is unchanged.

---

### FFF-18 — Bring chat back to the icon set

**Area** Design system · **Value** Low · **Effort** S · **Manual** –

#### The problem

`CLAUDE.md` is explicit: *"SVG icons in `src/components/icons.tsx` — use these
instead of unicode glyphs or new one-off styles."* Every module obeys except
the newest and largest:

| File | Glyph |
|---|---|
| `src/app/(app)/chat/page.tsx:26` | 🔍 as the search button — while `SearchIcon` exists and `src/modules/files/browser.tsx` uses it |
| `src/modules/chat/message-menu.tsx:60,71,83,100` | ↩️ 📋 ✏️ 🗑️ — while `PencilIcon` and `TrashIcon` exist |
| `src/modules/chat/poll-card.tsx:24,54` | 📊 and ✓ — while `CheckIcon` exists |
| `src/modules/chat/message-item.tsx:36,379` | 📅 and 🙂+ |

Emoji render as full-colour platform glyphs — Apple's on iOS, Noto's on Android
— so chat looks different on different phones **and** different from every other
screen, where the monochrome stroked set is uniform.

#### Approach

Swap each for an existing icon, adding two or three new ones to
`src/components/icons.tsx` in the same style (24×24 viewBox, `currentColor`,
stroked): a reply arrow, a clipboard, a bar chart, and possibly an
emoji/smiley outline for the reaction picker.

#### Watch out for

- **Not every emoji here is decoration.** The reaction picker's 🙂+ opens an
  emoji picker, and reactions themselves are genuinely emoji — leave the
  *content* alone and change only the *chrome*.
- Match the existing icon conventions exactly (stroke width, `IconProps`,
  sizing via `className`), or the new ones will look subtly off.
- Keep `aria-hidden` on decorative icons and make sure each control still has an
  accessible name.
- Check the message menu at 390 px afterwards — icon width differs from emoji
  width and can reflow the rows.

#### Acceptance

- No unicode-glyph icons remain in chat chrome.
- Chat looks the same on iOS and Android.
- Every menu item still has an accessible label.

---

### FFF-19 — Refresh the README and the Klub 100 PRD

**Area** Docs · **Value** Low · **Effort** S · **Manual** –

#### The problem

**`README.md`'s Files section describes a module two overhauls ago.** It still
says *"Shared library for photos, small videos and documents, organised into
optional folders… Owners (and admins) can delete their files"* — with no
mention of the grid/list browser, the full-screen viewer and its
thumb → display → original rendition ladder, Markdown and text reading,
multi-file upload with per-file retry, bulk zip download, move/rename, or the
per-folder unread badges (documented, but under "Home").

**`docs/klub100-prd.md`'s header is stale.** It still says per-user Spotify
playback is *"out of scope here and will be specced in a separate phase-2 PRD
when the time comes"* — while phase 2 is specced (`docs/klub100-phase2-prd.md`),
built and shipped.

Neither is urgent. But these are the two documents a future contributor —
human or Claude — reads first, and `CLAUDE.md` is otherwise unusually good at
staying true.

#### Files to touch

- `README.md` (Files section; check Chat and Home too)
- `docs/klub100-prd.md` (the status header, §10's framing)
- `CLAUDE.md` and `README.md` if FFF-04 has landed (both claim there is no test
  suite)

#### Acceptance

- The README's Files section matches what the module actually does.
- The Klub 100 PRD's status line reflects that phase 2 shipped.

---

## Changelog

| Date | Change |
|---|---|
| 2026-08-22 | Created from `docs/website-review-2026-08.md`. 19 items, FFF-01 … FFF-19, none started. |
| 2026-08-22 | FFF-01 implemented (A, B and C). Manual step 5 — the production sweep — is still the owner's to run. |
