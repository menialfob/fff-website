"use client";

import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { btnPrimary, btnSecondary, linkDanger, okText } from "@/components/ui";
import { CalendarIcon } from "@/components/icons";
import { regenerateCalendarToken } from "@/modules/calendar/actions";

/**
 * Personal iCal feed controls on the profile page. `httpsUrl`/`webcalUrl`
 * are null until the member enables the feed.
 */
export function CalendarFeed({
  httpsUrl,
  webcalUrl,
}: {
  httpsUrl: string | null;
  webcalUrl: string | null;
}) {
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const regenerate = (confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    startTransition(async () => {
      await regenerateCalendarToken();
      setCopied(false);
    });
  };

  if (!httpsUrl || !webcalUrl) {
    return (
      <div>
        <p className="mb-4 text-sm text-zinc-400">
          {t.profile.calendarFeed.hint}
        </p>
        <button
          type="button"
          disabled={isPending}
          onClick={() => regenerate()}
          className={btnPrimary}
        >
          <CalendarIcon className="h-4 w-4" />
          {t.profile.calendarFeed.enable}
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-zinc-400">
        {t.profile.calendarFeed.hint}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <a href={webcalUrl} className={btnPrimary}>
          <CalendarIcon className="h-4 w-4" />
          {t.profile.calendarFeed.subscribe}
        </a>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(httpsUrl).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
          className={btnSecondary}
        >
          {t.profile.calendarFeed.copy}
        </button>
        {copied && <span className={okText}>{t.profile.calendarFeed.copied}</span>}
      </div>

      <details className="mt-4 text-sm text-zinc-400">
        <summary className="cursor-pointer font-medium text-zinc-300">
          {t.profile.calendarFeed.iosTitle}
        </summary>
        <p className="mt-2 whitespace-pre-line">
          {t.profile.calendarFeed.iosSteps}
        </p>
      </details>
      <details className="mt-2 text-sm text-zinc-400">
        <summary className="cursor-pointer font-medium text-zinc-300">
          {t.profile.calendarFeed.androidTitle}
        </summary>
        <p className="mt-2 whitespace-pre-line">
          {t.profile.calendarFeed.androidSteps}
        </p>
      </details>

      <div className="mt-4">
        <button
          type="button"
          disabled={isPending}
          onClick={() => regenerate(t.profile.calendarFeed.confirmRegenerate)}
          className={linkDanger}
        >
          {t.profile.calendarFeed.regenerate}
        </button>
      </div>
    </div>
  );
}
