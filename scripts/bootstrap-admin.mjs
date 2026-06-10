/**
 * Creates the first admin account on an empty database, driven by env vars:
 * INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD, INITIAL_ADMIN_NAME (optional).
 *
 * Runs on every container start but does nothing once any user exists, so
 * the variables can stay in the server's .env harmlessly.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const email = process.env.INITIAL_ADMIN_EMAIL?.toLowerCase();
const password = process.env.INITIAL_ADMIN_PASSWORD;
const name = process.env.INITIAL_ADMIN_NAME || "Admin";

if (!email || !password) {
  console.log("INITIAL_ADMIN_EMAIL/PASSWORD not set; skipping bootstrap.");
  process.exit(0);
}

const prisma = new PrismaClient();
try {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log("Users already exist; skipping bootstrap.");
  } else if (password.length < 8) {
    console.error("INITIAL_ADMIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  } else {
    await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: await bcrypt.hash(password, 12),
        role: "ADMIN",
      },
    });
    console.log(`Created initial admin: ${email}`);
  }
} finally {
  await prisma.$disconnect();
}
