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

Downloads stream through the authenticated route `src/app/api/files/[id]/route.ts`
— files are never served statically. It honours `Range` (iOS Safari will not
scrub without `206`), serves `?v=thumb` and `?dl=1`, and renders bytes inline
only for an allow-list of types: anything else, `.svg` and `.html` above all,
is forced to download so an upload cannot run as first-party script.

Upload size is capped in `next.config.ts` (`serverActions.bodySizeLimit`), in
the deploy Caddyfile (`request_body max_size`) and in
`src/modules/files/types.ts` (`MAX_FILE_SIZE`); keep the three in sync.

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
