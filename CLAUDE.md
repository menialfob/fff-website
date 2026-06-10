# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Private, login-protected community website for a small friend group. Next.js
15 (App Router, TypeScript), NextAuth v5 (credentials + JWT sessions), Prisma
with SQLite, Tailwind CSS v4. Deployed as a Docker container behind Caddy on a
Hetzner Cloud server via GitHub Actions (see `docs/DEPLOYMENT.md`).

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
cards. Follow this pattern when adding features (forum, calendar, …); see the
`files` module for the reference implementation. Server actions return
`{ error?: string; ok?: boolean }` and are called from small `"use client"`
components via `useTransition`; every mutating action starts with
`requireSession()` or `requireAdmin()`.

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
