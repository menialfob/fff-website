# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Private, login-protected community website for a small friend group. Next.js
15 (App Router, TypeScript), NextAuth v5 (credentials + JWT sessions), Prisma
with SQLite, Tailwind CSS v4. Deployed as a Docker container behind Caddy on a
Hetzner Cloud server via GitHub Actions (see `docs/DEPLOYMENT.md`).

**The site is mobile-first** — members access it primarily on phones. Design
UI for small viewports (~390 px) first: touch-friendly tap targets, no
hover-only or desktop-drag-only interactions, full-screen/bottom-sheet
dialogs on small screens. Verify new UI at mobile widths before desktop.

## Commands

```bash
npm run dev          # dev server (needs .env — copy .env.example — and a migrated db)
npm run build        # production build (also catches type errors in pages/actions)
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run db:migrate   # prisma migrate dev — run after changing prisma/schema.prisma
npm run create-user -- --email a@b.c --name "Name" --password secret123 --admin
```

There is no test suite yet. Verify changes with `npm run lint`,
`npm run typecheck`, and `npm run build`.

## Architecture

**Auth is split across two files** because Prisma cannot run in edge
middleware: `src/lib/auth.config.ts` is the edge-safe config (route
authorization, JWT/session callbacks) used by `src/middleware.ts`;
`src/lib/auth.ts` adds the Credentials provider (bcrypt + Prisma) and exports
`auth`, `signIn`, `signOut`, plus the `requireSession()` / `requireAdmin()`
guards used in server actions. The middleware protects **everything** except
`/login`, `/api/auth`, and static assets — new pages are private by default.

**Modular features.** Each feature lives in `src/modules/<id>/` (server
actions, client components) with its pages in `src/app/(app)/<id>/` and an
entry in `src/modules/registry.ts`, which drives the nav bar and dashboard
cards (labels/descriptions come from the i18n dictionaries, icons + accent
colors from `src/components/nav.tsx` / `src/components/ui.tsx`). Follow this
pattern when adding features (forum, calendar, …); see the `files` module for
the reference implementation. Server actions return
`{ error?: string; ok?: boolean }` and are called from small `"use client"`
components via `useTransition`; every mutating action starts with
`requireSession()` or `requireAdmin()`.

**i18n.** All UI strings live in `src/lib/i18n/dictionaries/{da,en}.ts` —
Danish is the default locale and the source of truth; `en` must satisfy
`typeof da`, so a missing key is a type error. A `locale` cookie picks the
language (switcher on the profile + login pages). Server components and
actions use `getDict()` / `getLocale()` from `src/lib/i18n/server`; client
components use `useI18n()` from `src/lib/i18n/client` (provider mounted in
the root layout). Interpolation uses `fmt("… {name}", { name })`. Never
hardcode user-facing strings — including error messages in server actions.

**Design system.** Dark theme only (`color-scheme: dark`, canvas/panel colors
in `globals.css` `@theme`). Shared class recipes (cards, buttons, inputs,
chips) and per-module accent gradients live in `src/components/ui.tsx`;
SVG icons in `src/components/icons.tsx` — use these instead of unicode
glyphs or new one-off styles. Navigation is a bottom tab bar on mobile and
header pills on desktop (`src/components/nav.tsx`).

**Push notifications.** Everything is sent through `sendPushToUsers()`
(`src/lib/push.ts`); `notifyMembers()` (`src/lib/notify.ts`) wraps it for the
badge-raising events outside chat. Every payload names a **category** from
`src/lib/push-categories.ts`, and members switch categories off in their
profile (`PushPreference`, one row per touched toggle — a missing row means on,
so new members and newly added categories start opted in).

Filter **server-side, before sending** — never in `public/sw.js`. A
`userVisibleOnly` subscription owes the browser a notification per push, so a
push that arrives and shows nothing makes Chrome post its own "site updated in
the background" notice and makes Safari cancel the subscription after a few.
Adding a category therefore means: extend `PUSH_CATEGORIES`, add its label to
both dictionaries under `profile.notifications.categories` (the type checks
this), and pass it at the send site. The four section categories share their
ids with `Section` in `src/lib/activity.ts` on purpose, so a toggle silences
exactly the events behind that badge — the badges themselves keep counting.

Chat adds a second, narrower gate on top: `ConversationRead.muted` silences one
conversation (`setConversationMuted`, applied in `pushRecipients`), offered by
the bell in the chat header, the conversation info sheet and the review list in
the profile. The three surfaces share one action that takes the wanted state
rather than flipping the stored one, so optimistic updates cannot race; the
chat view owns the state and passes it into the info sheet. Mentions bypass
both the mute and the chat categories — being named is addressed to you.

**File storage.** `src/lib/storage.ts` is the **only** module allowed to touch
`fs` — everything else addresses bytes through it. Its contract is deliberately
S3-shaped so the planned migration is a change to that one file: `storedName`
is an opaque flat key (never a path), writes take a stream
(`saveUploadStream`), and reads are `openObject(key, range?)`, which maps 1:1
onto `GetObject` with a `Range` header. Keep it that way — no `fs` or path
arithmetic at call sites, and no public storage URLs.

Uploads go through `src/app/api/files/upload/route.ts`, a plain route rather
than a server action so the browser gets real progress and each file in a batch
retries on its own; the body is raw bytes with metadata in `x-file-*` headers,
so a large video never sits in memory. Images are thumbnailed server-side with
sharp (`src/lib/images.ts`); videos get a poster frame captured in the browser
(`upload-client.ts`), which also covers formats libvips cannot decode. A batch
raises **one** push, via `notifyUploads()` once the queue drains.

An image keeps up to two renditions beside the original: `thumbName` (512px,
the grid tile) and `displayName` (2048px, what the full-screen viewer shows),
both webp, both served by `?v=thumb` / `?v=display`, and both filled in lazily
by the media route for files that predate them. The viewer climbs that ladder —
thumb, display, and the original only once someone pinches to zoom — because a
camera JPEG is tens of megabytes and WebKit paints the rows it has not yet
received as solid grey. Decoding each rung off-screen before showing it is
load-bearing, not an optimisation: swapping in a half-arrived image is exactly
the bug this avoids. `processImage` derives the display copy only when asked
(`{ display: true }`) and only when the source is larger than one, so chat —
whose attachments are compressed in the browser first — does not pay for it.

Downloads stream through the authenticated route `src/app/api/files/[id]/route.ts`
— files are never served statically. It honours `Range` (iOS Safari will not
scrub without `206`), serves `?v=thumb`, `?v=display` and `?dl=1`, and renders
bytes inline only for an allow-list of types: anything else, `.svg` and `.html` above all,
is forced to download so an upload cannot run as first-party script.

Upload size is capped in four places, and they must stay in sync:
`next.config.ts` (`serverActions.bodySizeLimit` **and**
`experimental.middlewareClientMaxBodySize`), the deploy Caddyfile
(`request_body max_size`) and `src/modules/files/types.ts` (`MAX_FILE_SIZE`).

`middlewareClientMaxBodySize` is the one that bites. Because the middleware
matches every route, Next clones each upload body through it — and the default
clones only the first **10 MB**, then ends the stream without failing the
request. The route reads a short body and stores it as a whole file: a 14 MB
photo becomes a 10 MB one that still decodes, still thumbnails, and still looks
like a photo, with a grey band where the rows that never arrived should be. The
upload route now compares the bytes it received against the `x-file-size` the
browser declared and rejects a mismatch, so a cap reintroduced anywhere in the
chain (a proxy, a future config) fails loudly instead of storing corruption.

**Nothing may navigate the window to a file URL.** The site installs to the home
screen (`display: "standalone"`), so there is no browser chrome: a plain
`<a href="/api/files/…">`, a `target="_blank"`, or a form post to a file route
loads the file into the app's only window and leaves the member on iOS's
document preview with no back button, no back-swipe and no way out but
force-quitting. Safari is not an escape either — an installed PWA gets storage
separate from Safari, so sending them there lands on the login page.

Bytes reach a member through `src/lib/download.ts` (`saveUrl` / `saveBlob`) and
the shared `<SaveButton>` (`src/components/save-button.tsx`), never a link. In a
browser tab that is still a plain anchor download; in the installed app it
fetches the bytes and hands them to the native share sheet, which returns to the
app when dismissed. Saving is capped at `MAX_SAVE_BYTES` (150 MB, matched by the
zip route) because that path must hold the file in memory. Affordances that
genuinely need a new tab — "open in new tab" for a PDF — render only when
`useIsStandalone()` is false.

**Folders** (`Folder`) are nestable via `parentId` and carry a `kind`:
`USER` folders are the tree members browse, while `ATTACHMENT` folders are
created implicitly by the calendar and forum to hold an event's or thread's
assets. Attachment folders live outside the tree and are read-only in the files
section — when adding another module that attaches files, create its folder
with `kind: "ATTACHMENT"`. Deleting a folder never deletes its contents: files
and child folders are promoted to the deleted folder's parent.

Every folder carries an **unread badge**: how many files somebody else has put
anywhere inside it since the member last opened it (`FolderView` +
`src/modules/files/unread.ts`, cleared by `<MarkFolderSeen />` on the folder
page). The count rolls up the tree, so a photo three levels down is still
visible from the root, and it is a second, finer cursor than the `files`
`SectionView` behind the home screen badge — opening the section clears that
one, opening a folder clears this one. Both count the same thing, "added after
your cursor and not by you", so they can never disagree. A folder with no row
counts from the later of the member's join date and the folder's creation,
which is also what keeps the query bounded; the migration seeds a row per
member and folder from their `files` section cursor so nobody met the feature
with a number on every folder in the archive.

Text and Markdown open in the viewer rather than downloading
(`src/modules/files/viewer/text-pane.tsx`). Markdown is lexed with `marked` and
rendered as React elements, never through an HTML string — an uploaded document
cannot introduce markup because none of it is ever parsed as HTML, and links are
limited to http/https/mailto. It reuses the `.event-content` styles the calendar
and forum already render rich text with.

Any member may move and rename; only the uploader or an admin may delete.
`src/modules/files/kind.ts` is the single classifier deciding how a file is
presented, and `AttachmentGrid` (`src/modules/files/attachment-grid.tsx`)
renders attachments with the same grid and viewer everywhere.

**Database.** SQLite via Prisma. In production the db file and uploads share
one volume (`/data`), and `docker-entrypoint.sh` runs `prisma migrate deploy`
on startup — schema changes must always be accompanied by a committed
migration (`npm run db:migrate`).

## Deployment pipeline

Push to `main` → `.github/workflows/deploy.yml` builds the image, pushes to
ghcr.io, and SSHes into the server to `docker compose pull && up -d`. PRs and
non-main branches run `ci.yml` (lint, typecheck, build). The server-side
compose file and Caddyfile live in `deploy/`.

## Improvement backlog

`docs/backlog.md` holds the known, agreed work — items `FFF-01` … `FFF-19`,
each a self-contained brief with file references, an approach, acceptance
criteria, the traps specific to that change, and any step only the owner can
take. **If you are asked to work on an `FFF-nn`, read that file first.** Its
"Orientation for a new session" section is the short version of everything
here plus the branching/verification workflow.

Two things it records that are easy to trip over and are not visible in the
code: there is **no scheduler anywhere in the app** (`FFF-10` adds one, and
`FFF-11`/`14`/`15` depend on it), and **every non-main push redeploys the one
shared staging container** at `test.<domain>`, so two branches in flight fight
over it.

`docs/website-review-2026-08.md` is the dated review those items came from —
read it for the reasoning, work from the backlog.
