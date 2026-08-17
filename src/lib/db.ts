import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// SQLite tuning for a chat-heavy workload: WAL lets readers proceed during
// writes (the default rollback journal blocks them), busy_timeout retries
// briefly instead of failing with SQLITE_BUSY, and synchronous=NORMAL is the
// recommended pairing with WAL. journal_mode persists in the db file; the
// others are per-connection, which is why DATABASE_URL pins
// connection_limit=1 (standard for Prisma+SQLite — writes serialize anyway).
const globalForPragmas = globalThis as unknown as { __fffPragmas?: true };
if (!globalForPragmas.__fffPragmas) {
  globalForPragmas.__fffPragmas = true;
  void (async () => {
    try {
      // $queryRawUnsafe, not $executeRawUnsafe: these pragmas return a row,
      // which SQLite's execute path rejects.
      await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
      await prisma.$queryRawUnsafe("PRAGMA busy_timeout=5000;");
      await prisma.$queryRawUnsafe("PRAGMA synchronous=NORMAL;");
    } catch {
      // Non-fatal: the app works without the pragmas, just with more
      // contention. (Also runs against the shadow db during migrate dev.)
    }
  })();
}
