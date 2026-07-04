import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt, formatDateTime, type Dictionary } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n/server";
import { btnSecondary, emptyBox, listCard, mutedText, PageTitle } from "@/components/ui";
import { AdminTabs } from "@/modules/admin/admin-tabs";

const PAGE_SIZE = 50;

/**
 * Render a log row's stable action key + JSON meta as a localized sentence.
 * Unknown keys fall back to the raw key so old rows keep rendering after a
 * template is renamed or removed.
 */
function describeEvent(
  t: Dictionary,
  log: { action: string; meta: string | null },
): string {
  const params: Record<string, string | number> = {};
  try {
    const meta: unknown = log.meta ? JSON.parse(log.meta) : {};
    if (meta && typeof meta === "object") {
      for (const [key, value] of Object.entries(meta)) {
        if (typeof value === "string" || typeof value === "number")
          params[key] = value;
      }
    }
  } catch {
    // Malformed meta — render the template with missing placeholders intact.
  }
  const roleNames: Record<string, string> = t.admin.roleNames;
  if (typeof params.role === "string" && params.role in roleNames) {
    params.role = roleNames[params.role];
  }
  const events: Record<string, string> = t.admin.log.events;
  const template = events[log.action];
  return template ? fmt(template, params) : log.action;
}

export default async function AdminLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/");
  const [t, locale] = await Promise.all([getDict(), getLocale()]);

  const page = Math.max(1, Math.floor(Number((await searchParams).page)) || 1);
  // Fetch one extra row to know whether an older page exists without a count.
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    include: { actor: { select: { name: true } } },
  });
  const hasOlder = rows.length > PAGE_SIZE;
  const logs = rows.slice(0, PAGE_SIZE);

  return (
    <div>
      <PageTitle>{t.modules.admin.label}</PageTitle>
      <AdminTabs active="log" />
      <h2 className="mb-4 text-lg font-semibold text-white">
        {t.admin.log.title}
      </h2>
      {logs.length === 0 ? (
        <p className={emptyBox}>{t.admin.log.empty}</p>
      ) : (
        <ul className={listCard}>
          {logs.map((log) => (
            <li key={log.id} className="px-4 py-3 sm:px-6">
              <p className="text-sm text-zinc-100">{describeEvent(t, log)}</p>
              <p className="mt-0.5 text-sm text-zinc-500">
                {log.actor?.name ?? t.admin.log.unknownActor} ·{" "}
                {formatDateTime(log.createdAt, locale)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {(page > 1 || hasOlder) && (
        <div className="mt-6 flex items-center gap-3">
          {page > 1 && (
            <Link href={`/admin/log?page=${page - 1}`} className={btnSecondary}>
              {t.admin.log.newer}
            </Link>
          )}
          <span className={`${mutedText} text-sm`}>
            {fmt(t.admin.log.page, { page })}
          </span>
          {hasOlder && (
            <Link href={`/admin/log?page=${page + 1}`} className={btnSecondary}>
              {t.admin.log.older}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
