"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { btnSecondary, errorText, linkDanger } from "@/components/ui";
import { PencilIcon } from "@/components/icons";
import { deleteEvent } from "./actions";

export function EventControls({ eventId }: { eventId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link href={`/calendar/${eventId}/edit`} className={btnSecondary}>
        <PencilIcon className="h-4 w-4" />
        {t.common.edit}
      </Link>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!confirm(t.calendar.confirmDelete)) return;
          startTransition(async () => {
            const result = await deleteEvent(eventId);
            setError(result?.error);
            if (result?.ok) router.push("/calendar");
          });
        }}
        className={linkDanger}
      >
        {t.calendar.deleteEvent}
      </button>
      {error && (
        <p className={`${errorText} w-full`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
