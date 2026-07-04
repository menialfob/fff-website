import Link from "next/link";
import { chip } from "@/components/ui";
import { HistoryIcon, UsersIcon } from "@/components/icons";
import { getDict } from "@/lib/i18n/server";

const tabChip = (selected: boolean) =>
  `${chip(selected)} inline-flex items-center gap-1.5`;

export async function AdminTabs({ active }: { active: "users" | "log" }) {
  const t = await getDict();
  return (
    <div className="mb-6 flex gap-2">
      <Link href="/admin" className={tabChip(active === "users")}>
        <UsersIcon className="h-4 w-4" />
        {t.admin.tabUsers}
      </Link>
      <Link href="/admin/log" className={tabChip(active === "log")}>
        <HistoryIcon className="h-4 w-4" />
        {t.admin.tabLog}
      </Link>
    </div>
  );
}
