/**
 * Creates (or updates) a user from the command line. Use this to bootstrap
 * the first admin account:
 *
 *   npm run create-user -- --email you@example.com --name "Your Name" --password secret123 --admin
 *
 * In production the first admin is created automatically from the
 * INITIAL_ADMIN_* environment variables (see scripts/bootstrap-admin.mjs);
 * further users are managed in the Admin page of the site itself.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const email = getArg("--email")?.toLowerCase();
  const name = getArg("--name");
  const password = getArg("--password");
  const isAdmin = process.argv.includes("--admin");

  if (!email || !name || !password) {
    console.error(
      'Usage: create-user --email <email> --name "<name>" --password <password> [--admin]',
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash(password, 12);
  const role = isAdmin ? "ADMIN" : "MEMBER";

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role },
    create: { email, name, passwordHash, role },
  });
  console.log(`✔ ${user.role} user ready: ${user.email}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
