/**
 * Creates or updates a single admin account from environment variables:
 * ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME (optional, defaults to "Admin").
 *
 * Unlike bootstrap-admin.mjs this runs regardless of how many users already
 * exist and upserts by email, so it can (re)set a known admin login on the
 * staging database. It is invoked on demand by the "Create staging admin"
 * workflow via `node scripts/set-admin.mjs` inside the running container, and
 * takes the password from a GitHub secret so it never lands in the repo.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const email = process.env.ADMIN_EMAIL?.toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME || "Admin";

if (!email || !password) {
  console.error("ADMIN_EMAIL and ADMIN_PASSWORD must be set.");
  process.exit(1);
}
if (password.length < 8) {
  console.error("ADMIN_PASSWORD must be at least 8 characters.");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role: "ADMIN" },
    create: { email, name, passwordHash, role: "ADMIN" },
  });
  console.log(`Admin ready: ${user.email}`);
} finally {
  await prisma.$disconnect();
}
