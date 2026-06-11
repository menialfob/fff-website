# PRD: Klub 100 module

Status: **Phase 1 (M1–M3) shipped** · Owner: Jonas · Last updated: 2026-06-11

> Phase 1 (collaborative collection, curation and export) is implemented and
> merged. Per-user Spotify playback and mix production are **out of scope here**
> and will be specced in a separate phase-2 PRD when the time comes — see §10
> and the research log in §6.3 for the inputs that should inform it.

## 1. Background

Klub 100 is a social music drinking game: 100 songs are played for roughly one
minute each, separated by a recorded "Cheers!" that signals everyone to take a
sip. The playlist typically ramps from slower songs to high-energy sing-alongs
as the evening progresses.

Producing a Klub 100 mix is very time consuming for one person: picking 100
songs, choosing the best ~1 minute of each, collecting 100 distinct cheers
recordings, ordering the songs, and mixing the audio with fades. This module
turns the **collection and curation** work into a collaborative effort on the
website, so the group contributes songs, segment choices and cheers
recordings, and the mix owner gets a complete, structured package to assemble
the final audio from.

## 2. Goals

- Members collaboratively fill a Klub 100 project with song suggestions,
  each with a chosen ~1-minute segment and an attached cheers recording.
- The group votes on suggestions; the project owner curates the final
  numbered 1–100 tracklist.
- The project page shows progress at a glance: songs accepted x/100, cheers
  recorded x/100, reordered yes/no, mixed yes/no.
- The owner can export everything needed to produce the mix offline: a
  manifest (track, artist, Spotify link, segment times, order) plus all
  cheers recordings.
- Searching songs is pleasant: Spotify-powered search for everyone, with
  "Open in Spotify" deep links to audition tracks in each member's own app.

### Non-goals (phase 1)

- The site does **not** produce the final mixed audio. (See §10 for the
  phase-2 options that the data model must keep open.)
- No in-browser Spotify playback or per-user Spotify account connection.
  Auditioning is via "Open in Spotify" deep links only. (See §10 / §6.3 for
  why this is deferred.)
- No downloading of audio from Spotify — legally impossible; the export
  contains metadata and cheers recordings only.
- No public/anonymous access; everything stays behind the existing login.

## 3. Roles & permissions

| Action | Member | Project owner | Admin |
|---|---|---|---|
| Create a project | ✅ | ✅ | ✅ |
| Suggest songs, pick segments, attach cheers | ✅ | ✅ | ✅ |
| Vote on suggestions (one vote per suggestion) | ✅ | ✅ | ✅ |
| Edit/delete **own** suggestion (while not accepted) | ✅ | ✅ | ✅ |
| Accept/reject suggestions | – | ✅ | ✅ |
| Reorder the tracklist | – | ✅ | ✅ |
| Flip status flags (reordered / mixed) | – | ✅ | ✅ |
| Export package | – | ✅ | ✅ |
| Rename/delete project | – | ✅ | ✅ |

"Owner curates": any member can start a project, and that project's creator
(plus admins) controls curation for it. All members can contribute to any
project.

## 4. Core concepts & rules

- **Project** — one Klub 100 mix in the making. Multiple projects can exist
  simultaneously (e.g. "Sommerfest 2026", "Christmas Klub 100").
- **Suggestion pool** — suggestions can exceed 100. Every suggestion lands in
  the pool with vote counts; the owner accepts suggestions into the numbered
  tracklist (positions 1–100) or rejects them. Progress counts **accepted**
  songs only.
- **Votes** — each member can upvote each suggestion once (toggle on/off).
  Votes are guidance for the owner, not an automatic ranking.
- **No duplicates** — a given Spotify track can appear only once per project.
  A second attempt shows who already suggested it.
- **No per-user cap** — members can suggest as many songs as they like.
- **Segments** — every suggestion has one segment: a start time and an end
  time, defaulting to start + 60 s. For exceptional songs the suggester can
  add a **second** segment ("2×1 minute"). Segment length is soft-guided to
  ~60 s (UI nudges, not a hard validation) so intros/choruses can breathe.
- **Placement hint** — the suggester indicates where in the mix the song
  belongs: **Early** (warm-up, calmer), **Middle**, or **Late** (people are
  hyped, sing-along), plus an optional free-text note ("peak banger, save it
  for the last 10"). Hints are guidance for the owner when ordering — they
  don't constrain anything.
- **Cheers** — an audio clip (max 10 seconds) attached to a suggestion by any
  member, recorded in the browser or uploaded as a file. One cheers per song;
  it travels with the song through accept/reorder. A song without a cheers is
  flagged as incomplete. The cheers progress counter counts accepted songs
  that have a cheers attached.
- **Status flags** — `reordered` and `mixed` are manual booleans the owner
  flips; the site does not infer them.

## 5. User experience

Navigation: a new **Klub 100** entry in the top nav (via
`src/modules/registry.ts`), with a dashboard card like the other modules.

### 5.0 Mobile-first

The module — like the whole site — will primarily be used on phones, so every
screen is designed for mobile first and merely scales up to desktop:

- **Segment picker** is built for touch: the timeline window is dragged with
  a finger, with generous handle hit areas, plus ±1 s tap buttons and direct
  mm:ss input for precision (finger-dragging alone is too coarse on a small
  screen).
- **Reordering** the tracklist must not depend on desktop drag-and-drop:
  long-press-and-drag on touch, with explicit move up/down (or "move to
  position…") controls as the always-available fallback.
- **Dialogs** (suggest song, cheers recorder) render as full-screen or
  bottom-sheet panels on small screens, not floating modals.
- **Tap targets** (vote, play cheers, accept/reject) sized ≥ 44 px; song rows
  stack their metadata vertically on narrow screens.
- **Cheers recording** is expected to happen on phones at parties — the
  recorder is tested primarily on iOS Safari and Android Chrome (see §11).
- **Spotify "Open in Spotify" links** use the track URL so they deep-link
  into the installed mobile app — this is the audition path on every device.

Acceptance for every milestone includes a pass on a ~390 px viewport.

### 5.1 `/klub100` — project list

- Grid/list of projects, each showing: name, creator, created date, and a
  compact progress summary (`67/100 songs · 41/100 cheers · reordered ✗ ·
  mixed ✗`).
- "New project" button (name field only) — available to all members.

### 5.2 `/klub100/[id]` — project page

Top: progress header with the four indicators (songs accepted x/100, cheers
x/100, reordered yes/no, mixed yes/no) and, for owner/admin, toggles for the
two flags plus the **Export** button.

Two main sections (tabs or stacked):

1. **Tracklist** — the accepted songs in their 1–100 order. Owner/admin can
   drag-and-drop to reorder and remove songs (removal returns the suggestion
   to the pool). Each row: position, album art, title/artist, segment time(s),
   cheers indicator (play inline), suggester avatar.
2. **Suggestion pool** — all open suggestions sorted by votes (then newest),
   filterable by placement hint (Early / Middle / Late). Each row: album art,
   title/artist, duration, segment time(s), placement badge (+ note on
   hover), cheers indicator, suggester, vote button + count, link out to
   Spotify. Owner/admin
   see Accept / Reject buttons. Rejected suggestions move to a collapsed
   "Rejected" section (owner can restore).

### 5.3 Suggesting a song

1. **Search** — a search box backed by the Spotify Web API (server-side
   token, see §6). Results show album art, title, artist, duration. Duplicate
   tracks already in the project are marked and unselectable.
2. **Pick the segment** — a timeline for the full track duration with a
   draggable 60-second window (start/end handles, fine-tune with ±1 s
   buttons and direct mm:ss input). Optional "Add second minute" adds a
   second window. There is no in-browser audio; an "Open in Spotify" link
   lets the user audition the track in their own Spotify app and set the
   times manually.
3. **Placement hint** — pick Early / Middle / Late and optionally add a short
   note explaining the vibe ("this is a late song for when people are
   hyped").
4. **Attach a cheers** (optional at suggestion time, required for the song to
   count as complete) — see §7.
5. Submit → suggestion appears in the pool with one auto-vote from the
   suggester.

A cheers can be added or replaced later from the song row by any member (so
someone else can supply the cheers for a song they didn't suggest).

### 5.4 Export (owner/admin)

One click downloads a ZIP containing:

- `manifest.json` — project metadata and the ordered tracklist: position,
  Spotify track ID + URL, title, artist, album, duration, segment(s) start/end
  in ms, placement hint + note, cheers filename, suggester name, vote count.
  Also includes the
  not-yet-accepted pool for reference.
- `manifest.csv` — same tracklist flattened for spreadsheet use.
- `cheers/` — all cheers files named `NNN-artist-title.ext` by tracklist
  position (unaccepted songs' cheers under `cheers/pool/`).

This is everything needed to procure the audio and assemble the mix offline,
and the manifest is deliberately rich enough to drive a future automated
pipeline (§10).

## 6. Spotify integration

Server-side search and metadata only — no per-user Spotify connection in
phase 1.

### 6.1 Server-side search & metadata (everyone)

- **Client Credentials flow** with an app registered in the Spotify developer
  dashboard. The token is fetched and cached server-side (`src/lib/spotify.ts`);
  the client secret never reaches the browser.
- Used for: track search, and snapshotting track metadata (title, artist,
  album, duration, album art URL, external URL) onto the suggestion at save
  time — so the UI never needs live Spotify calls to render lists, and rate
  limits stay trivial for a friend group.
- **Note:** Spotify removed 30-second `preview_url`s for apps created after
  Nov 2024, so there is no in-browser preview audio; auditioning is via the
  "Open in Spotify" deep link only.

### 6.2 Spotify app setup (ops)

- Register one app; add env vars `SPOTIFY_CLIENT_ID` and
  `SPOTIFY_CLIENT_SECRET` to `.env.example`, the production env, and
  `docs/DEPLOYMENT.md`.
- The app stays in **development mode**; search via client credentials needs
  no user allowlisting. (Extended quota review is unavailable to hobby apps —
  it requires a registered business with 250k+ MAU since March 2025.)

### 6.3 Spotify platform constraints — research log (June 2026)

Findings from debugging the production search failure. The **search** items
below shaped the shipped phase-1 integration; the **per-user / allowlist**
items are the main input for any future phase-2 playback PRD (and the reason
in-browser playback is deferred). Spotify has tightened developer access three
times since this project was specced:

**Nov 2024 changes** (apps created after Nov 27, 2024):

- Removed for dev apps: 30-second `preview_url`, Recommendations, Related
  Artists, Audio Features/Analysis, Featured/Category Playlists. There is no
  in-browser preview audio available from Spotify — full playback would only
  be possible via the Web Playback SDK (a phase-2 concern).

**March 2025**: extended quota mode restricted to legally registered
businesses with 250 000+ MAU and a launched service. A hobby app can never
leave development mode — plan around dev-mode limits permanently.

**Feb 2026 changes** ([announcement](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security),
[endpoint changelog](https://developer.spotify.com/documentation/web-api/references/changes/february-2026);
applied to new apps Feb 11, 2026, to existing apps Mar 9, 2026):

- The developer's own Spotify account must have **Premium** (only relevant to
  a future per-user playback feature).
- **One development-mode Client ID per developer account** — guard the app
  we already registered; we can't create spares.
- **Max 5 authorized users** in the allowlist (down from 25). This only
  caps OAuth-connected accounts: site members using search/suggest/vote
  consume no slots. With 12 members, per-user playback can reach at most 5
  of them — accepted for phase 2, since live party playback only needs the
  host's device connected (see §10).
- **Reduced endpoint set.** Confirmed surviving: `GET /search`, single-item
  metadata (tracks/albums/artists), `GET /me`, top items, playlists, saved
  items, and **all 14 player endpoints** — so both our search and a future
  Web Playback SDK approach remain technically feasible (the latter still
  capped at 5 users).
- **`GET /search` limit param max is now 10** (default 5). `limit=12`
  produced the misleading `400 {"error":{"status":400,"message":"Invalid
  limit"}}` we hit in production — keep requests at ≤10 results
  (`src/lib/spotify.ts` caps this; don't raise it).

**Implementation notes learned the hard way:**

- Pass a concrete `market` (we send `market=DK`, override via
  `SPOTIFY_MARKET`): client-credentials tokens carry no user country, and
  dev-mode catalog calls have a history of failing without one.
- Redirect URIs (for any future per-user OAuth) must be **HTTPS**, except the
  literal loopback `http://127.0.0.1:<port>/...` — `http://localhost` is
  rejected.
- docker compose `env_file` passes surrounding quotes through literally;
  `src/lib/spotify.ts` strips them defensively, and `.env.example` shows
  unquoted values.
- Search failures log the full Spotify response to the server logs
  (`docker compose logs app`); credential rejections get a distinct
  user-facing message.

## 7. Cheers recording

- **In-browser recording** with `MediaRecorder` (mic permission): big record
  button, live elapsed indicator, hard stop at 10 s, then listen-back and
  re-record/save. Output format is whatever the browser produces
  (`audio/webm;codecs=opus` on Chrome/Firefox, `audio/mp4` on Safari) — we
  store what we get.
- **File upload fallback** on the same dialog: accepts `audio/*`
  (mp3, m4a, wav, ogg, webm), max 5 MB, so pre-recorded clips (party voice
  memos) can be attached.
- Storage reuses the existing pattern: file written under `UPLOAD_DIR` with a
  randomized name via `src/lib/storage.ts`, metadata in the DB, and playback
  streamed through an authenticated route
  (`/api/klub100/cheers/[songId]`) — never served statically.
- Replacing a cheers deletes the old file. Deleting a suggestion deletes its
  cheers file.

## 8. Data model (Prisma)

```prisma
model Klub100Project {
  id          String          @id @default(cuid())
  name        String
  reordered   Boolean         @default(false)
  mixed       Boolean         @default(false)
  createdBy   User            @relation(fields: [createdById], references: [id], onDelete: Cascade)
  createdById String
  songs       Klub100Song[]
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
}

enum Klub100SongStatus {
  SUGGESTED
  ACCEPTED
  REJECTED
}

enum Klub100Placement {
  EARLY
  MIDDLE
  LATE
}

model Klub100Song {
  id             String            @id @default(cuid())
  project        Klub100Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  projectId      String
  suggestedBy    User              @relation(fields: [suggestedById], references: [id], onDelete: Cascade)
  suggestedById  String
  status         Klub100SongStatus @default(SUGGESTED)
  position       Int?              // 1–100 when ACCEPTED, else null

  // Spotify metadata snapshot (no live API calls needed to render)
  spotifyTrackId String
  spotifyUrl     String
  title          String
  artist         String
  album          String
  durationMs     Int
  albumArtUrl    String?

  // Segment 1 (required) and optional segment 2 ("2×1 minute")
  seg1StartMs    Int
  seg1EndMs      Int
  seg2StartMs    Int?
  seg2EndMs      Int?

  // Suggester's hint for where the song belongs in the mix
  placement      Klub100Placement?
  placementNote  String?

  cheers         Klub100Cheers?
  votes          Klub100Vote[]
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  @@unique([projectId, spotifyTrackId]) // no duplicate tracks per project
}

model Klub100Cheers {
  id           String      @id @default(cuid())
  song         Klub100Song @relation(fields: [songId], references: [id], onDelete: Cascade)
  songId       String      @unique
  storedName   String      @unique // randomized name under UPLOAD_DIR
  mimeType     String
  size         Int
  durationMs   Int?
  recordedBy   User        @relation(fields: [recordedById], references: [id], onDelete: Cascade)
  recordedById String
  createdAt    DateTime    @default(now())
}

model Klub100Vote {
  song      Klub100Song @relation(fields: [songId], references: [id], onDelete: Cascade)
  songId    String
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId    String
  createdAt DateTime    @default(now())

  @@id([songId, userId]) // one vote per user per song
}
```

Notes:

- Segment end times are stored explicitly (not derived as start+60 000) so
  the picker can allow slightly shorter/longer windows and so a future mixing
  pipeline gets exact cut points.
- `position` is compacted on accept/remove/reorder so the tracklist is always
  a contiguous 1..n.
- A future per-user Spotify connection (phase 2) would add its own table
  (e.g. `SpotifyAccount`) — phase 1 stores no Spotify user tokens.

## 9. Code structure

Follows the module pattern (reference: `files`):

```
src/modules/registry.ts                    # add { id: "klub100", label: "Klub 100", href: "/klub100", … }
src/modules/klub100/
  actions.ts                               # server actions (all guarded by requireSession / owner checks)
  search-actions.ts                        # Spotify search (server-side token)
  project-controls.tsx                     # create project, flag toggles, export button
  suggest-song.tsx                         # search + segment picker + cheers dialog ("use client")
  segment-picker.tsx                       # timeline widget
  cheers-recorder.tsx                      # MediaRecorder + upload fallback
  tracklist.tsx / suggestion-pool.tsx      # lists, voting, accept/reject, drag-reorder
src/app/(app)/klub100/page.tsx             # project list
src/app/(app)/klub100/[id]/page.tsx        # project page
src/app/api/klub100/cheers/[songId]/route.ts   # authenticated cheers streaming
src/app/api/klub100/export/[id]/route.ts       # ZIP export (owner/admin)
src/lib/spotify.ts                         # client-credentials token cache, search
```

Server actions return `{ error?: string; ok?: boolean }` per house style;
every mutation starts with `requireSession()` and curation actions verify
`project.createdById === session.user.id || role === ADMIN`.

The middleware already protects all new routes by default.

## 10. Phase 2 — per-user playback & producing the mix (separate PRD)

Everything beyond phase 1 lives in its own future PRD. Sketches kept here so
the data model stays open; **do not implement from this section** — it exists
to be lifted into the phase-2 PRD.

**Decision (June 2026): live party playback is the primary phase-2 path.**
The 5-account allowlist cap is accepted — playback only needs to run on the
device hosting the party, so a handful of connected curator accounts is
enough. The ffmpeg render path is the fallback, to be built **only if** live
playback proves unworkable in practice.

1. **Party playback mode (in-browser, Spotify SDK) — primary.** A "Play mix"
   screen that plays the tracklist live on a connected Premium account: for
   each song, seek to `seg1StartMs`, ramp volume up (SDK `setVolume` steps ≈
   fade-in), play the segment, ramp down, pause, play the cheers file via
   Web Audio, continue to the next song. No audio file ever produced —
   the mix *happens* live. Prerequisite: a per-user Spotify connection
   (Authorization Code + PKCE, Web Playback SDK, a `SpotifyAccount` table),
   capped at **5 connected Premium accounts** by the dev-mode allowlist
   (§6.3) — fine, since only the party host's device needs playback.
   The phase-2 PRD should start with a **spike** validating the real risks:
   seek latency between songs, fade smoothness via setVolume, browser
   autoplay policies, and SDK reliability on the host device (desktop or
   Android Chrome is the safe target; iOS Safari support is poor, so the
   party host should plan on a laptop or Android device).
2. **ffmpeg pipeline (server-side render) — fallback only.** If the live
   playback spike fails: owner uploads the actual audio file per accepted
   song; a server job cuts segments, applies fades, splices cheers between
   songs, and renders one long MP3. Needs per-song audio upload UI, a
   background job runner, and significant storage — the manifest and segment
   data from phase 1 are already sufficient input. Needs no Spotify
   connection at all.

Nothing in phase 1 blocks either path; the explicit per-segment ms values,
cheers files, and ordered manifest are the shared foundation.

## 11. Risks & open questions

- **Safari/iOS recording** — MediaRecorder output is `audio/mp4` and mic
  permission UX differs; test on iPhones early since party contributions
  will often be mobile.
- **Body size limits** — cheers uploads (≤5 MB) fit the existing
  `serverActions.bodySizeLimit` / Caddy `request_body` caps; verify rather
  than raise.
- Open: should rejected suggestions be visible to everyone or only
  owner/admin? (Default: visible but collapsed.)
- Open: project deletion — hard delete with cheers files, or archive flag?
  (Default: hard delete with confirmation, cascades clean up files.)

## 12. Milestones

1. **M1 — Projects & suggestions:** schema + migration, registry entry,
   project list/create, Spotify search (client credentials), suggestion form
   with manual segment picker and placement hint, suggestion pool, duplicate
   guard.
2. **M2 — Cheers:** recorder + upload dialog, storage, authenticated
   streaming, inline playback, progress counters.
3. **M3 — Curation & export:** voting, accept/reject, drag-and-drop reorder
   with position compaction, status flag toggles, ZIP export with manifests.

M1–M3 are shipped. All further work is deferred to a separate phase-2 PRD
(see §10): live party playback via the Spotify SDK as the primary path, with
the ffmpeg render pipeline as fallback only if live playback proves
unworkable. The Spotify platform constraints in §6.3 gate the design.

Each milestone ships behind the normal CI gates (`lint`, `typecheck`,
`build`); M1 includes the Prisma migration committed alongside the schema.
