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

**File storage.** Uploads are written to `UPLOAD_DIR` (a Docker volume in
production) under randomized names via `src/lib/storage.ts`; metadata lives in
the `FileItem` table. Downloads stream through the authenticated route
`src/app/api/files/[id]/route.ts` — files are never served statically. Upload
size is capped both in `next.config.ts` (`serverActions.bodySizeLimit`) and in
the deploy Caddyfile (`request_body max_size`); keep these in sync.

**Database.** SQLite via Prisma. In production the db file and uploads share
one volume (`/data`), and `docker-entrypoint.sh` runs `prisma migrate deploy`
on startup — schema changes must always be accompanied by a committed
migration (`npm run db:migrate`).

## Deployment pipeline

Push to `main` → `.github/workflows/deploy.yml` builds the image, pushes to
ghcr.io, and SSHes into the server to `docker compose pull && up -d`. PRs and
non-main branches run `ci.yml` (lint, typecheck, build). The server-side
compose file and Caddyfile live in `deploy/`.
