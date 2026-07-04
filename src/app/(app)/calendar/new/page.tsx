import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { PageTitle } from "@/components/ui";
import { ArrowLeftIcon } from "@/components/icons";
import { EventForm } from "@/modules/calendar/event-form";

export default async function NewEventPage() {
  const session = await requireSession();
  const t = await getDict();

  const canRecurring =
    session.user.role === "ADMIN" ||
    session.user.extraRoles.includes("BESTYRELSE");

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/calendar"
        className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {t.modules.calendar.label}
      </Link>
      <PageTitle>{t.calendar.newEvent}</PageTitle>
      <EventForm canRecurring={canRecurring} />
    </div>
  );
}
