# Website review — August 2026

A full read of the codebase (~31 000 lines across 7 modules), the PRDs, the
deployment setup and the design system, with recommendations ranked by what
they're worth to the club.

Verified against the tree at `490e407` (merge of #51): `npm run lint`,
`npm run typecheck` and `npm run build` all pass clean.

---

## 1. What this site is

Getting the recommendations right depends on being honest about the intent, so
this is what the code says the site is for:

**FFF — Fælles Formiddags Fædre — is a private clubhouse, not a product.** It
serves one small, closed group of Danish dads with a board (`bestyrelse`) and
joke honorary titles (Farmand, Bedstefar, Sukkerfar). There is no signup, no
public surface, no growth motive. `robots.txt` disallows everything, the
middleware makes every route private by default, and accounts are minted by an
admin. Success is measured in *whether the group uses it*, not in metrics.

It does two distinct jobs, and they pull in different directions:

**A coordination tool.** Recurring traditions (the recurrence engine supports
exactly "first Wednesday of every month", "first Friday of March", "every 24
December" — a club with a fixed monthly rhythm and a few annual fixtures), ad
hoc events, RSVPs per occurrence, structured per-occurrence fields
(*Arrangør*, *Agenda*), a forum thread auto-created per event, real-time chat
with polls, and Klub 100 for the big party. This half is about **the next few
weeks**.

**A shared memory.** Photos and videos from every event, folders that roll up
unread counts, attachment folders named "Titel Jun 2025" that sort by the
event's date rather than the upload's, rich-text write-ups per occurrence so
each year's version stands on its own, an iCal feed, an audit log. This half
is about **the last five years**, and it only gets more valuable with time.

**It is a phone app first.** The `display: "standalone"` manifest, the bottom
tab bar, the safe-area handling, `ViewportGuard`'s two-stage recovery from
WebKit viewport displacement, the 16px minimum font on coarse pointers, the
"never navigate the window to a file URL" rule — this is a codebase that has
been debugged on real iPhones at real parties. Danish is the source of truth;
English is the courtesy translation.

The engineering quality is genuinely high. The invariants are written down and
enforced rather than remembered: the four-place upload-size chain, the
byte-count check that catches a reintroduced body cap, `src/lib/storage.ts` as
the single `fs` boundary shaped like S3, server-side push filtering with the
reason spelled out (`userVisibleOnly` owes the browser a notification),
badges and their activity lists sharing one filter so they can't disagree.
The recommendations below are almost entirely about **what isn't there yet**,
not about what needs fixing in what is.

---

## 2. Fix first — risks to the archive

These are ranked by what they could cost, not by effort. The "shared memory"
half of the site is irreplaceable, and it is the half currently least
protected.

### 2.1 Deleting a member deletes group content, and leaks the bytes

`prisma/schema.prisma` splits delete behaviour, and the split is inconsistent
with its own stated principle. Calendar events, forum threads, forum posts,
chat messages and chat attachments all use `SetNull` — the schema comments say
so explicitly: *"events are group content and must outlive their author"*,
*"forum content is group content and outlives its author"*.

But five relations `Cascade`:

| Line | Relation | What a member deletion destroys |
|---|---|---|
| `schema.prisma:665` | `FileItem.uploadedBy` | Every file they uploaded — including the photos inside other people's forum threads and calendar events, whose `ATTACHMENT` folders point at those exact rows |
| `schema.prisma:691` | `Klub100Project.createdBy` | Every mix they started — cascading to all its songs, everyone's cheers recordings and everyone's votes |
| `schema.prisma:753` | `Klub100Song.suggestedBy` | Every song they suggested, *including ones already accepted onto someone else's 1–100 tracklist*, leaving gaps in the numbering |
| `schema.prisma:795` | `Klub100Cheers.recordedBy` | Every cheers clip they recorded, for anyone's song |
| `schema.prisma:718` | `Klub100DefaultCheers.recordedBy` | The project's fallback clip |

The confirm dialog does warn — *"Slet {name}? Deres uploads bliver også
fjernet."* — but "deres uploads" undersells it considerably. Losing one
member's account can wipe an entire collaboratively-built Klub 100 mix and
punch holes in five years of event photos that other members contributed the
context for.

**And separately, this one is a plain bug:** `deleteUser`
(`src/modules/admin/actions.ts:83`) is a bare `prisma.user.delete`. Every
other delete path in the codebase carefully removes the stored objects first —
`deleteFiles` deletes the original, the thumb and the display rendition
(`src/modules/files/actions.ts:144-146`), chat deletes attachment bytes, Klub
100 deletes cheers bytes. `deleteUser` deletes none of them, nor the user's
avatar. The rows vanish from the database while the bytes stay on the `/data`
volume forever, invisible and unreclaimable.

**Recommendation.** Two changes, small and independent:

1. Flip `FileItem.uploadedById` and the three Klub 100 author columns to
   nullable `SetNull`, matching every other module. Files and mixes are group
   content in exactly the same sense forum posts are. The uploader's name is
   already rendered from a nullable relation elsewhere (`toFileDTO` falls back
   to `""`), so the UI cost is near zero.
2. Give `deleteUser` a real teardown: collect the storage keys it is about to
   orphan (files, thumbs, display renditions, cheers, avatar) and
   `deleteObject` them inside the same action. Even after change 1 there are
   still avatars and Klub 100 rows to clean up.

If the cascade is genuinely wanted, keep it — but then make the confirm say
what it actually does, and add the byte cleanup regardless.

### 2.2 Backups are a suggestion in a document, not a running system

`docs/DEPLOYMENT.md` §6 offers a nightly `tar czf` of the `app-data` volume as
an example the reader is expected to install by hand, with off-server copies
described as an optional extra ("For off-server backups, add a cheap Hetzner
Storage Box…"). Nothing in the repo installs it, nothing verifies it ran, and
nothing has ever tested a restore.

Two specific problems beyond "it might not be set up":

- **`tar` over a live SQLite database can capture a torn file.** The app runs
  in WAL mode; a copy taken mid-checkpoint can restore to a corrupt or
  rolled-back database. The correct primitive is `VACUUM INTO` (or
  `sqlite3 .backup`), which produces a consistent snapshot while the app keeps
  writing.
- **On-server backups don't survive the thing they're for.** A destroyed or
  lost Hetzner volume takes the backups with it. This is a single ~€5/month
  box holding the group's only copy of five years of photos.

**Recommendation.** Make it code, not prose. A tiny `backup` service in
`deploy/docker-compose.yml` that nightly runs `VACUUM INTO` on the database,
tars the uploads, pushes to a Storage Box with `restic` (dedupe + integrity
checks), prunes old snapshots — and, so it's actually *known* to work, writes
a timestamp the admin page reads and shows as "Sidste backup: …", turning red
after 48 hours. Then do one restore drill and write down how long it took.

This is the single highest-value item in the review. Everything else on this
list is recoverable.

### 2.3 An error strands a member with no way out

There is no `error.tsx`, `global-error.tsx`, `not-found.tsx` or `loading.tsx`
anywhere under `src/app/`. That means:

- Any thrown server error — including the 16 `throw new Error(...)` sites in
  guards like `requireSession()` — renders Next's stock *"Application error: a
  server-side exception has occurred"*: white-on-black, English, no nav, no
  brand.
- The 11 `notFound()` call sites (a deleted event, a stale chat link from a
  push notification, a bookmarked forum thread) render Next's stock 404, same
  problem.

In a browser tab this is ugly. **In the installed PWA it is a dead end** —
`display: "standalone"` means there is no back button and no address bar. The
member's only exit is force-quitting the app, which is precisely the failure
mode `ViewportGuard` was written to eliminate elsewhere.

**Recommendation.** Three small files, an afternoon's work: `app/error.tsx`
and `app/global-error.tsx` (branded, Danish, a "Prøv igen" retry and a "Til
forsiden" link) and `app/not-found.tsx` (same, plus a hint that the thing may
have been deleted). Add `loading.tsx` to the routes that do real work
(`/chat/[key]`, `/files/[folderId]`, `/klub100/[id]`) so a phone on 4G shows a
skeleton instead of a frozen tap.

### 2.4 There is no test suite

`CLAUDE.md` says it plainly, and CI runs `lint`, `typecheck`, `build` only.
That's been survivable because the modules are well-isolated and the author is
careful — but there is now a meaningful amount of pure logic where a
regression would be silent rather than loud:

- `src/modules/calendar/recurrence.ts` — nth-weekday, last-weekday, DST-free
  wall-clock date math. A bug here moves the monthly meeting.
- `src/modules/calendar/ics.ts` — RRULE emission that must agree with the
  above, consumed by phone calendars that will never report an error.
- `src/modules/files/unread.ts` + `src/lib/activity.ts` — the badge invariant
  ("added after your cursor and not by you") that the folder badge and section
  badge must both satisfy.
- `src/lib/push-prefs.ts` — "a missing row means on", the rule that decides
  whether a new category silently opts everyone out.
- `src/modules/files/kind.ts` — the single classifier three subsystems agree
  on.
- `src/app/api/files/[id]/route.ts` — the inline-vs-download allow-list, which
  is a security boundary (`.svg`/`.html` must never render first-party).

**Recommendation.** Vitest, and resist the urge to chase coverage. Twenty
tests over the six files above would catch the regressions that actually hurt.
Then one Playwright smoke path — log in, open the calendar, RSVP, upload a
file, see it in the folder — run in CI. Chromium is already available in the
dev container.

### 2.5 Login has no throttle and failed attempts aren't logged

`src/lib/auth.ts:31` — `authorize()` compares a bcrypt hash and returns `null`
on failure. There is no attempt counter, no lockout, no delay, and crucially
**no audit entry**: only `auth.login` on success is recorded
(`src/lib/auth.ts:47`). A month of password guessing against
`https://fffloge.dk/login` leaves no trace anywhere an admin can see.

bcrypt at cost 12 is a real brake (~250 ms/attempt), so this isn't urgent —
but it's cheap to close.

**Recommendation.** Log `auth.failed` to the audit log with the attempted
email, so the admin log answers "is anyone knocking?". Add a simple in-memory
counter keyed by email + IP that starts adding delay after ~5 failures in 15
minutes. The single-process architecture that makes `src/lib/realtime.ts` work
makes an in-memory limiter work too — no Redis needed.

### 2.6 Deactivation doesn't take effect for up to seven days

Sessions are JWTs with `maxAge: 7 * 24 * 60 * 60`
(`src/lib/auth.config.ts:16`), and role/active state is only re-read when the
token is minted at login. Deactivating a member leaves their session fully
working for up to a week. The admin page acknowledges this in prose —
`t.admin.staleSessionHint` — rather than solving it.

For a friend group this is a real but low-probability concern. It's worth
fixing mainly because the mitigation is small.

**Recommendation.** Add a `sessionsValidFrom` timestamp to `User`, stamp it
into the JWT at login, and reject tokens older than it in the `jwt` callback —
edge-safe, no Prisma import needed if the value rides in the token. Bumping it
on deactivate, password change and role change gives instant revocation
everywhere. Alternatively, shorten `maxAge` to ~24 h and accept a daily login.

### 2.7 Nothing watches the disk

The `app-data` volume holds the database *and* every upload, on the smallest
Hetzner box, with a 200 MB per-file cap that videos will happily reach. When
that volume fills, SQLite writes start failing — which is to say the site
stops working, and the failure will surface as a mystery.

The admin page shows per-member upload bytes but no total, no free space and
no warning.

**Recommendation.** Put total storage used, free space and a percentage bar on
the admin page, and push a `files`-category notification to admins at 80%.
`docs/DEPLOYMENT.md`'s "Scaling notes" already names the exit (Hetzner Object
Storage behind the existing `src/lib/storage.ts` boundary) — the gauge is what
tells you when to take it.

---

## 3. Build next — ranked by what the club gets

### 3.1 Event reminders and RSVP nudges — the biggest missing feature

The calendar has RSVPs (`EventAttendance`, per occurrence date, three states,
a roster). Push notifications work well. And yet **nobody is ever reminded of
anything**, because there is no scheduler anywhere in the codebase — no cron,
no job runner, nothing that fires on time rather than in response to a click.

Follow the consequences:

- The only calendar push is at event *creation*
  (`src/modules/calendar/actions.ts:476`). A recurring series is one row
  created once — so the monthly meeting is announced exactly once, ever, and
  then never again for the next five years of occurrences.
- Nobody is nudged to RSVP, and the organiser is never told who's coming.
- Filling in an occurrence's write-up, agenda or *Arrangør* fields notifies
  no one, even though that is the moment the meeting becomes real.
- Even the iCal feed can't cover the gap: `src/modules/calendar/ics.ts` emits
  no `VALARM`, so subscribed phones raise no alert either.

For a club whose whole rhythm is a recurring meeting, this is the highest-value
thing to build.

**Recommendation, in order of cost:**

1. **Add a `VALARM` to the iCal feed** (one block per `VEVENT`, `TRIGGER:-PT18H`).
   Hours of work, and every member who subscribed to the feed starts getting
   reminders from their own phone. Do this first regardless of the rest.
2. **Add a scheduler.** Either a `cron` service in the compose file curling an
   authenticated internal route, or `node-cron` in the existing process —
   there is one process by design (`src/lib/realtime.ts` depends on it), so
   in-process is honest here. Guard against double-firing across restarts with
   a `SentNotification` row keyed by `(eventId, date, kind)`.
3. **On top of it:** a reminder the evening before ("Fælles formiddag i
   morgen kl. 09:00 — du har ikke svaret endnu", opening straight onto the
   RSVP buttons), a digest to the event's organiser that morning ("7
   deltager, 2 måske, 3 har ikke svaret"), and a nudge to the board when a
   recurring occurrence is a week out with no content written.

A scheduler also unlocks 3.5 and the backup-freshness check in 2.2, so it pays
for itself more than once.

### 3.2 The home screen doesn't answer "what's next"

`src/app/(app)/page.tsx` greets you with *"Velkommen tilbage i klubhuset. Hvad
skal der ske?"* — and then answers a different question. You get module cards
with unread badges and a "Nyt siden sidst" list. Both are backward-looking.
The literal question in the greeting — *what's happening* — goes unanswered.

The most valuable thing a club member wants on opening the app is: **when do
we meet next, where, and am I signed up?** All of that data is already
computed elsewhere (`nextOccurrences`, `EventAttendance`), it just never
reaches the dashboard.

**Recommendation.** A "Næste begivenhed" card above the module grid: the next
1–3 occurrences with date, time, location, a going/maybe count, and the three
RSVP buttons inline so answering takes one tap without leaving home. Below it,
keep the badges and the activity list exactly as they are. This is a couple of
hours and it changes what the app is *for* on a phone.

### 3.3 Nothing is findable

Search exists in exactly one place, and it's the newest content:

- **Chat** has real search (`/chat/search`, backed by the `searchText` column
  maintained on every write) — good.
- **Files** has a search box that filters *the current folder's already-loaded
  items in the browser* (`src/modules/files/browser.tsx:153`). Not recursive,
  not server-side.
- **Forum, calendar, members, Klub 100** — nothing at all.

The archive half of the site is the half that grows. Five years in, "which
year did we do the thing in Skagen?" has no answer except scrolling.

**Recommendation.** A `/search` page over threads, post bodies, file names,
event titles and descriptions, member names and chat messages, grouped by
section with each module's accent colour. SQLite FTS5 is the right tool and
Prisma can reach it through `$queryRaw`; the `searchText` pattern chat already
uses (locale-lowercased on write, because SQLite's `lower()` is ASCII-only and
Danish has æøå) is the precedent to copy. Make the files search recursive
server-side at the same time.

### 3.4 Members are a wall of cards you can't tap

`src/app/(app)/members/page.tsx` renders name, avatar, bestyrelse badge, join
date and bio — and contains no `Link` at all. Every member in the group is a
dead end. Meanwhile the schema knows a great deal about each of them: uploads,
threads, events created, songs suggested, cheers recorded, attendance history.

There is also no birthday field, which for a dads' club is a conspicuous
omission — it's exactly the kind of thing a clubhouse should remember on your
behalf.

**Recommendation.** `/members/[id]`: avatar, bio, title, member since, and a
tabbed feed of what they've contributed (photos, threads, events, Klub 100
suggestions). Link the member cards, and link avatars everywhere they already
appear — chat messages, attendance rosters, "uploaded by" lines, structured
`PERSON` fields. Add an optional birthday to `User`, show the next few on the
dashboard, and once 3.1's scheduler exists, let it post a greeting to
`#general` on the day.

### 3.5 The photo archive has no timeline

Files is folder-first, which is right for documents and right for the
event-attachment folders the calendar and forum create. But the emotional
payload of this site is **photos**, and photos want a timeline, not a tree.
There is no "everything, newest first", no per-year view, no "photos from this
event" that isn't a folder click, and no way to revisit last summer without
knowing which folder it landed in.

**Recommendation.** A "Billeder" tab beside the folder tree: every `IMAGE` and
`VIDEO` in the library, newest first, grouped by month, using the existing
grid tiles and viewer (`AttachmentGrid` and the thumb→display→original ladder
already do all the hard work). Then, once 3.1's scheduler exists, the payoff:
a "For et år siden i dag" push with a photo from that date. That is the
feature that makes people open the app when nothing is scheduled.

### 3.6 Onboarding is an out-of-band conversation

`createUser` (`src/modules/admin/actions.ts:27`) takes a password typed by the
admin. So the admin knows every member's initial password, must convey it over
some other channel, and nothing ever forces a change. There is no
self-service password reset either — a member who forgets theirs has to ask an
admin, who sets a new one they then also know.

**Recommendation.** Replace the typed password with a single-use invite link
(a `inviteToken` + expiry on `User`, a public `/invite/[token]` page exempted
in the middleware alongside the iCal feed) where the new member sets their own
password, uploads an avatar and writes a bio. Reuse the same token machinery
for admin-initiated resets. There's no mail sender in the stack and none is
needed — the admin pastes the link into the group chat.

---

## 4. Polish — consistency and craft

### 4.1 The bottom tab bar is at capacity

`MobileTabBar` (`src/components/nav.tsx:76`) renders every module the member
can see, in a `flex` row with no overflow handling. A member sees **7 tabs**
(Hjem, Kalender, Forum, Chat, Filer, Klub 100, Fædre); an admin sees **8**.

At the ~390 px target width `CLAUDE.md` names, that's 55 px per tab for a
member and 49 px for an admin, carrying 11 px labels. "Kalender" and "Klub 100"
are already truncating at the admin width, and the tab targets have dropped
below the ≥44 px comfortable minimum the Klub 100 PRD itself specifies. The
next module registered breaks it outright.

**Recommendation.** Cap it at five: Hjem, Kalender, Chat, Filer, and "Mere"
opening the existing bottom `Sheet` with the rest (Forum, Klub 100, Fædre,
Admin, Profil). Drive the split from `src/modules/registry.ts` so adding a
module never has to think about it again. Desktop pills have room and can keep
showing everything.

### 4.2 Chat drifted from the design system

`CLAUDE.md` is explicit: *"SVG icons in `src/components/icons.tsx` — use these
instead of unicode glyphs or new one-off styles."* Every module obeys except
the newest and largest one:

- `src/app/(app)/chat/page.tsx:26` — a 🔍 emoji as the search button, while
  `SearchIcon` exists and the files browser uses it
- `src/modules/chat/message-menu.tsx:60,71,83,100` — ↩️ 📋 ✏️ 🗑️, while
  `PencilIcon` and `TrashIcon` exist
- `src/modules/chat/poll-card.tsx:24,54` and
  `src/modules/chat/message-item.tsx:36,379` — 📊 ✓ 📅 🙂+

Emoji render as full-colour platform glyphs — Apple's on iOS, Noto's on
Android — so chat looks different on different phones and different from every
other screen, where the monochrome stroked set is uniform. Swapping them for
the existing icons (plus one or two new ones: reply-arrow, clipboard,
bar-chart) is a mechanical change that makes the app feel like one app.

### 4.3 The README describes a files module two overhauls ago

`README.md`'s Files section still reads: *"Shared library for photos, small
videos and documents, organised into optional folders… Owners (and admins) can
delete their files."* Missing: the grid/list browser, the full-screen viewer
and its thumb→display→original ladder, Markdown and text reading, multi-file
upload with per-file retry, bulk zip download, move/rename, and the
per-folder unread badges (which *are* documented, but under "Home").

`docs/klub100-prd.md`'s header is also stale — it still says per-user Spotify
playback is *"out of scope here and will be specced in a separate phase-2 PRD
when the time comes"*, while phase 2 is specced, built and shipped.

Neither is urgent, but these are the two documents a future contributor —
human or Claude — reads first, and `CLAUDE.md` is otherwise unusually good at
staying true.

---

## 5. A suggested order

Grouped so each block is a coherent piece of work rather than a scattering.

**First — stop the bleeding (a weekend).**
`VALARM` in the iCal feed (§3.1.1, hours, immediate benefit) · the
`deleteUser` storage teardown and the cascade flip (§2.1) · `error.tsx` /
`not-found.tsx` / `global-error.tsx` (§2.3).

**Second — protect the archive (a weekend).**
The `restic` backup service with `VACUUM INTO`, a freshness stamp on the admin
page, and one real restore drill (§2.2) · the storage gauge and 80% warning
(§2.7).

**Third — make it worth opening (the fun one).**
The scheduler (§3.1.2) · event reminders and RSVP nudges (§3.1.3) · the "next
event" card on the dashboard (§3.2). This block is where the club notices the
difference.

**Fourth — make five years findable.**
Global search (§3.3) · the photo timeline (§3.5) · member profile pages and
birthdays (§3.4).

**Ongoing, threaded through the above.**
Vitest over the six risky files (§2.4) · the five-tab nav (§4.1) · chat's
icons (§4.2) · the login audit and throttle (§2.5) · session revocation
(§2.6) · README and PRD refresh (§4.3) · the invite flow (§3.6).

---

## Appendix — verification

| Check | Result |
|---|---|
| `npm run lint` | ✅ No ESLint warnings or errors |
| `npm run typecheck` | ✅ Clean |
| `npm run build` | ✅ Exit 0, 45 routes |
| Modules | 7 registered (`calendar`, `forum`, `chat`, `files`, `klub100`, `members`, `admin`) |
| Migrations | 31, each paired with its schema change |
| Source size | ~30 800 lines across `src/` |
| History | 152 commits since June 2026, feature work merged via PR behind CI |
