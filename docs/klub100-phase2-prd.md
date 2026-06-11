# PRD: Klub 100 phase 2 — live party playback

Status: **Draft — gated on the M-P2 spike** · Owner: Jonas · Last updated: 2026-06-11

Phase 1 (collaborative collection, curation, export — see
`docs/klub100-prd.md`) is shipped. This PRD covers playing the finished mix
**live in the browser** on the party host's device via the Spotify Web
Playback SDK. No audio file is ever produced — the mix *happens* live:
segments are played from Spotify, cheers recordings are played from our own
storage in between.

**Decision (June 2026):** live playback is the primary path. The ffmpeg
server-render pipeline (§11) is the fallback, built **only if** the spike
fails. The Spotify dev-mode 5-account allowlist is accepted: only the party
host's device needs a connected Premium account.

> Read `docs/klub100-prd.md` §6.3 (Spotify platform research log) before
> implementing anything here — every constraint in it still applies.

## 1. Goals

- The party host opens a project's "Play mix" screen on one connected
  device (laptop or Android phone plugged into speakers), presses play
  once, and the full mix runs itself: segment → cheers → segment → cheers…
  through the whole tracklist.
- Fades in/out of each segment so transitions sound deliberate, not like
  someone yanking the aux cord.
- A big, glanceable "now playing" display (song, position x/100, suggester).
- Crash-safe: if the browser dies at song 60, reopening the page offers
  "resume from song 60".
- A minimal, honest Spotify connect flow for the ≤5 allowlisted accounts.

### Non-goals

- No control or live status from other members' devices — the host device is
  the only screen (interview decision). Everyone else just drinks.
- No DJ features beyond play/pause and skip-to-next (interview decision).
- No mixing/rendering of audio files (that's the §11 fallback, not this PRD).
- No change to the phase-1 suggest/curate/export flows; the segment picker
  keeps its manual "Open in Spotify" audition flow even for connected users
  (can be revisited later — out of scope now to keep this PRD small).

## 2. The playback sequence

For each tracklist position, the engine runs:

1. **Start the track** at `seg1StartMs` with player volume 0
   (`PUT /me/player/play` with `position_ms`, device = our SDK player).
2. **Fade in** by stepping `setVolume` (e.g. 8–10 steps over ~1 s).
3. **Play the segment**, watching playback position (SDK `player_state_changed`
   events + a timer) until `seg1EndMs` minus the fade duration.
4. **Fade out**, then pause the player.
5. **Play the song's cheers** via an `HTMLAudioElement`/Web Audio from
   `/api/klub100/cheers/[songId]` — everyone sips.
6. Advance: if the song has a second segment, repeat 1–5 with
   `seg2StartMs`/`seg2EndMs` (so a 2×1-minute song is
   *seg 1 → cheers → seg 2 → cheers* — it earns two sips, per the interview
   decision). Otherwise move to the next tracklist position.
7. After each transition, persist progress (§6) for resume.

Edge handling:

- **Song with no cheers:** play a built-in default cheers clip shipped with
  the app, and show a "no cheers" marker on the now-playing screen. The
  pre-flight check (§4) lists these songs before starting so the group can
  still record them in time.
- **Track unavailable** (removed from Spotify / market mismatch at play
  time): skip after a short error toast, log the song on screen so the host
  knows a sip was lost.
- **Token expiry mid-mix:** access tokens last ~1 h and a mix runs ~2 h —
  the engine must refresh via our server before expiry without interrupting
  playback (the SDK supports a `getOAuthToken` callback; serve fresh tokens
  from `/api/spotify/token`).

## 3. Spotify connect (prerequisite)

- **Authorization Code with PKCE**; scopes `streaming`, `user-read-email`,
  `user-read-private`. Callback at `/api/spotify/callback` (must be HTTPS —
  see §6.3 of the phase-1 PRD; use `http://127.0.0.1:3000/...` for local dev,
  not `localhost`).
- Tokens live server-side in the `SpotifyAccount` table (§6); the browser
  only ever receives short-lived access tokens from `/api/spotify/token`
  (session-guarded, returns the caller's own token only).
- A "Connect Spotify" card on the Klub 100 pages, visible to everyone but
  honest about the limits: shows how many of the 5 allowlist slots are in
  use, states the Premium requirement, and explains that connecting is only
  needed to *host* playback.
- Connected non-Premium accounts (`product != "premium"`) see a notice that
  hosting requires Premium; the connect state is still stored.
- **Ops:** add the redirect URI to the Spotify app dashboard, add each
  host's Spotify account to the dashboard allowlist (max 5 — coordinate in
  the group chat before burning slots), document both in
  `docs/DEPLOYMENT.md`.

## 4. `/klub100/[id]/play` — the play screen

Reached via a "Play mix" button on the project page (owner/admin, must have
a connected Premium account; others see why it's disabled).

**Pre-flight panel** (before the mix starts):

- Tracklist count (warn if < 100 — playing a partial list is allowed).
- Songs missing cheers, listed by name (default clip will be used).
- Spotify connection + Premium check, SDK device created successfully.
- A single **"Start the mix"** button — this is the one user gesture that
  satisfies browser autoplay policies for both the SDK and cheers audio.
  If saved progress exists, it reads **"Resume from #47"** with a smaller
  "start over" link.

**During playback** (big type, dark screen — it'll sit across the room):

- Position `#42 / 100`, album art, title/artist, suggester name, a segment
  progress bar, and a cheers indicator while a cheers plays.
- Controls: **pause/resume** and **skip to next song** only (interview
  decision). Skip jumps past the rest of the current song including its
  remaining segments/cheers.
- Wake lock (`navigator.wakeLock`) so the host screen doesn't sleep
  mid-party.

Mobile-first styling applies as everywhere, but the *supported host
targets* are desktop Chrome/Edge/Firefox and Android Chrome. iOS Safari is
explicitly unsupported for hosting (SDK unreliability — phase-1 PRD §6.3);
the play button is hidden there with an explanatory note.

## 5. Resume (interview decision: required)

- After every segment/cheers transition the engine calls a server action
  persisting `{ songId, segmentNo }` to `Klub100PlaybackState` (one row per
  project).
- On opening the play screen with saved state, pre-flight offers resume
  (start at that song's segment 1 — mid-segment precision is pointless).
- "Start over" and finishing the mix clear the row.
- Server-side (not localStorage) so the host can switch devices if one dies.

## 6. Data model additions

```prisma
model SpotifyAccount {
  userId        String   @id
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  spotifyUserId String
  refreshToken  String   // consider encrypting at rest (phase-1 PRD §11 note)
  accessToken   String?
  expiresAt     DateTime?
  product       String?  // "premium" | "free" — gates the host UI
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Klub100PlaybackState {
  projectId String   @id
  project   Klub100Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  songId    String
  segmentNo Int      @default(1) // 1 or 2
  updatedAt DateTime @updatedAt
}
```

## 7. Code structure

```
src/modules/klub100/
  play-screen.tsx            # "use client" — pre-flight, now playing, controls
  playback-engine.ts         # client-side sequencer (SDK + cheers audio + fades)
  spotify-connect.tsx        # connect card / status
  playback-actions.ts        # persist/clear/read playback state (guarded)
src/app/(app)/klub100/[id]/play/page.tsx
src/app/api/spotify/login/route.ts      # PKCE redirect kickoff
src/app/api/spotify/callback/route.ts   # token exchange, upsert SpotifyAccount
src/app/api/spotify/token/route.ts      # short-lived access token for the SDK
src/lib/spotify.ts                      # + PKCE helpers, refresh logic
public/default-cheers.mp3               # fallback clip for cheers-less songs
```

Same house rules as phase 1: server actions guarded by `requireSession()`,
host-only actions verify owner/admin, middleware keeps everything behind
login.

## 8. The spike (M-P2-2) — go/no-go gate

A throwaway play screen (hardcoded 10-song list is fine) that must pass
**all** of these before the full UX is built:

| # | Criterion | Pass threshold |
|---|---|---|
| 1 | Transition tightness | Dead air between segment fade-out and cheers start, and between cheers end and next fade-in, ≤ ~1.5 s each |
| 2 | Fade quality | `setVolume` stepping produces no audible zipper/stutter at ~10 steps over 1 s |
| 3 | Unattended endurance | 10+ consecutive segments with no user input, no drift > 1 s from intended cut points, no SDK disconnects |
| 4 | Autoplay | One user gesture at start suffices for the entire run (SDK audio + cheers `HTMLAudioElement`) |
| 5 | Token refresh | A simulated near-expiry refresh mid-playback causes no audible interruption |
| 6 | Host platform | All of the above on desktop Chrome; Android Chrome checked and results recorded |

If 1–4 can't be made to pass after reasonable tuning, **stop**: write up the
findings in this doc and pivot to the ffmpeg fallback (§11). Criteria 5–6
failing means fix-and-retry, not pivot.

## 9. Risks & open questions

- **SDK seek/transition latency** is the existential risk — exactly what the
  spike measures. Spotify gives no latency guarantees.
- **Allowlist churn:** 5 slots, no way to know who'll host next year's mix.
  Mitigation: document slot usage; removing an account in the dashboard
  frees a slot.
- **Spotify changes the rules again** (three tightenings in three years).
  Live playback depends on the 14 player endpoints surviving; the export
  package (phase 1) remains the insurance policy.
- **Long-session stability:** a ~2 h browser session with wake lock, audio,
  and websockets on a party laptop. Resume (§5) is the mitigation, not a
  guarantee.
- Open: should the default cheers clip be recorded by the group (fun) or a
  generic sound (shipping-fast)? Default: ship generic, replace later.
- Open: do segments shorter than the fade window (< ~3 s) need clamping in
  the engine, or should the segment picker forbid them retroactively?
  Default: clamp in the engine.

## 10. Milestones

1. **M-P2-1 — Spotify connect:** PKCE flow, `SpotifyAccount` table +
   migration, login/callback/token routes, connect card with slot/Premium
   messaging, deployment docs. Real and minimal — needed by the spike and
   reusable regardless of its outcome.
2. **M-P2-2 — Spike:** throwaway playback sequencer; measure against §8 and
   record results in this doc. **Go/no-go.**
3. **M-P2-3 — Party playback mode:** play screen with pre-flight checks,
   now-playing display, pause/skip, two-segment handling, default cheers,
   resume, wake lock. Acceptance includes one full-length (100-segment)
   dry run.

Normal CI gates apply (`lint`, `typecheck`, `build`).

## 11. Fallback — ffmpeg server render

Only if the spike fails. Owner uploads an audio file per accepted song; a
server job cuts segments at the stored ms values, applies fades, splices
cheers between songs, renders one long MP3. Needs per-song upload UI, a
background job runner, and significant storage; needs no Spotify connection
at all, and serves all members. The phase-1 manifest/segment data is already
sufficient input. To be specced properly in its own PRD-let if it comes to
that.
