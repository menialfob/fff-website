/**
 * Finds — and, asked twice, removes — objects in UPLOAD_DIR that nothing in
 * the database points at any more.
 *
 *   npm run sweep-orphans              # report only, touches nothing
 *   npm run sweep-orphans -- --delete  # actually remove them
 *
 * Every delete path in the app removes an object's bytes along with its row,
 * but `deleteUser` did not until FFF-01, so a member deleted before that took
 * their files, avatars and Klub 100 cheers out of the database and left the
 * bytes on the volume, unreachable and unaccounted for. This is the one-off
 * broom for that; it is also the safety net if a future teardown misses one.
 *
 * ⚠️ Deleting is irreversible and this runs against the live volume. Take a
 * backup first, run it without --delete, read the list, and only then run it
 * again with the flag.
 */
import { PrismaClient } from "@prisma/client";
import { deleteObject, listObjects } from "../src/lib/storage";

/**
 * Objects younger than this are never touched, whatever the database says. An
 * upload writes its bytes before the row that names them exists, and the media
 * route fills in thumbnails and display renditions lazily — a sweep running in
 * that window would delete a file somebody is in the middle of adding.
 */
const DEFAULT_MIN_AGE_HOURS = 24;

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function formatSize(bytes: number): string {
  const units = ["B", "kB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** Every storage key the database still refers to, from every model holding one. */
async function referencedKeys(prisma: PrismaClient): Promise<Set<string>> {
  const [files, avatars, attachments, cheers, defaultCheers] =
    await Promise.all([
      prisma.fileItem.findMany({
        select: { storedName: true, thumbName: true, displayName: true },
      }),
      prisma.user.findMany({
        where: { avatarStoredName: { not: null } },
        select: { avatarStoredName: true },
      }),
      prisma.messageAttachment.findMany({
        select: { storedName: true, thumbName: true },
      }),
      prisma.klub100Cheers.findMany({ select: { storedName: true } }),
      prisma.klub100DefaultCheers.findMany({ select: { storedName: true } }),
    ]);

  const keys = new Set<string>();
  const keep = (key: string | null) => {
    if (key) keys.add(key);
  };
  for (const f of files) {
    keep(f.storedName);
    keep(f.thumbName);
    keep(f.displayName);
  }
  for (const u of avatars) keep(u.avatarStoredName);
  for (const a of attachments) {
    keep(a.storedName);
    keep(a.thumbName);
  }
  for (const c of cheers) keep(c.storedName);
  for (const c of defaultCheers) keep(c.storedName);
  return keys;
}

async function main() {
  const shouldDelete = process.argv.includes("--delete");
  const minAgeHours = Number(getArg("--min-age-hours") ?? DEFAULT_MIN_AGE_HOURS);
  if (!Number.isFinite(minAgeHours) || minAgeHours < 0) {
    console.error("--min-age-hours must be a non-negative number.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const [objects, keys] = await Promise.all([
      listObjects(),
      referencedKeys(prisma),
    ]);

    const cutoff = Date.now() - minAgeHours * 3600_000;
    const unreferenced = objects.filter((o) => !keys.has(o.storedName));
    const tooYoung = unreferenced.filter((o) => o.modifiedAt.getTime() > cutoff);
    const orphans = unreferenced
      .filter((o) => o.modifiedAt.getTime() <= cutoff)
      .sort((a, b) => b.size - a.size);

    console.log(
      `${objects.length} objects in storage, ${keys.size} referenced by the database.`,
    );
    if (tooYoung.length > 0) {
      console.log(
        `Skipping ${tooYoung.length} unreferenced object(s) newer than ${minAgeHours}h — an upload in flight looks exactly like an orphan.`,
      );
    }
    if (orphans.length === 0) {
      console.log("No orphaned objects. Nothing to do.");
      return;
    }

    const total = orphans.reduce((sum, o) => sum + o.size, 0);
    console.log(
      `\n${orphans.length} orphaned object(s), ${formatSize(total)}:\n`,
    );
    for (const o of orphans) {
      console.log(
        `  ${o.storedName}  ${formatSize(o.size).padStart(8)}  ${o.modifiedAt.toISOString().slice(0, 10)}`,
      );
    }

    if (!shouldDelete) {
      console.log(
        "\nReport only — nothing was deleted. Re-run with --delete to remove these,",
      );
      console.log("after taking a backup.");
      return;
    }

    for (const o of orphans) await deleteObject(o.storedName);
    console.log(`\n✔ Deleted ${orphans.length} object(s), ${formatSize(total)}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
