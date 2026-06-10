# fff-website

Private community site for our friend group: login-protected, with user
profiles and a shared library for photos, small videos and documents.
Designed to grow module by module (forum, calendar, …).

## Stack

- [Next.js](https://nextjs.org/) (App Router, TypeScript) — frontend + API in one app
- [Auth.js / NextAuth v5](https://authjs.dev/) — email + password login, JWT sessions
- [Prisma](https://www.prisma.io/) + SQLite — database
- [Tailwind CSS](https://tailwindcss.com/) — styling
- Docker + Caddy on a Hetzner Cloud server — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Local development

```bash
cp .env.example .env          # defaults work out of the box
npm install
npm run db:migrate            # create/update the local SQLite db
npm run create-user -- --email you@example.com --name "You" --password secret123 --admin
npm run dev                   # http://localhost:3000
```

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

Features are self-contained modules. To add one (e.g. a calendar):

1. Put its server actions and components in `src/modules/calendar/`.
2. Add its pages under `src/app/(app)/calendar/` — everything inside the
   `(app)` route group is automatically behind the login.
3. Register it in `src/modules/registry.ts` — the nav bar and dashboard pick
   it up from there.
4. If it needs data, extend `prisma/schema.prisma` and run `npm run db:migrate`.

## Deployment

Pushing to `main` builds a Docker image and deploys it to the Hetzner server
automatically via GitHub Actions. Setup instructions, secrets, and backup
strategy: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
