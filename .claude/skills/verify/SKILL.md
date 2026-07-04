---
name: verify
description: Build, run, and drive this app end-to-end to verify a change works at its surface (login-protected Next.js site).
---

# Verifying changes in fff-website

## Build & launch

```bash
cp .env.example .env               # once per container
npm ci                             # once per container
npm run db:migrate                 # applies migrations to prisma/dev.db
npx tsx scripts/create-user.ts --email admin@fff.dk --name "Jonas Admin" --password adminpass123 --admin
npx tsx scripts/create-user.ts --email bo@fff.dk --name "Bo Medlem" --password memberpass123
npm run dev                        # run in background; ready when /login returns 200
```

Gotchas:
- **Do not use `npm start`** — `next.config.ts` sets `output: "standalone"` and
  `next start` silently breaks server actions (login POSTs go nowhere).
  Use `npm run dev`.
- If you delete/replace `prisma/dev.db`, **restart the dev server** — the open
  SQLite handle keeps pointing at the deleted inode and logins fail mysteriously.
- Kill the server by exact PID; `pkill -f next` matches your own shell.

## Driving it

Playwright with the preinstalled browser (do NOT `playwright install`):

```js
import { chromium } from "playwright-core"; // npm i playwright-core in scratchpad
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", // ls /opt/pw-browsers for the exact dir
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // mobile-first!
```

- Login form: `input[name="email"]`, `input[name="password"]`, `button[type="submit"]`.
  After submit the server action answers `303 → GET /`; `page.waitForURL("/")`
  is flaky on this redirect — assert on rendered content (`Hej {name}`) instead.
- Locale: default is Danish; set an `en` cookie via
  `ctx.addCookies([{ name: "locale", value: "en", url: BASE }])` to test English.
- **`textContent("body")` false positives**: the root layout serializes the whole
  i18n dictionary into every page, so any dictionary string "appears" in the body
  of every route. Assert on visible locators or screenshots, not body-wide includes.
- Admin rows on `/admin` keep their expanded state across `revalidatePath`
  refreshes — don't re-click to expand after a mutation (that collapses them).

## Flows worth driving

- Login as admin → `/admin` (user management) and `/admin/log` (usage log).
- Login as member → no Admin nav, `/admin` redirects to `/`.
- Deactivated users are rejected at login with the generic invalid-credentials error.
