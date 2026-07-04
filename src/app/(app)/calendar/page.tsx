import { requireSession } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { emptyBox, PageTitle } from "@/components/ui";

export default async function CalendarPage() {
  await requireSession();
  const t = await getDict();

  return (
    <div>
      <PageTitle>{t.modules.calendar.label}</PageTitle>
      <p className={emptyBox}>{t.calendar.empty}</p>
    </div>
  );
}
