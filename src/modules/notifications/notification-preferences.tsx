"use client";

import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { errorText } from "@/components/ui";
import { PUSH_CATEGORIES, type PushCategory } from "@/lib/push-categories";
import { setPushPreference } from "./actions";

/**
 * The "what do you want to be told about?" list in the profile.
 *
 * Preferences belong to the account, not the browser it is edited in — the
 * server drops silenced categories before a push is ever sent (see
 * src/lib/push.ts), so this list works the same whether the member opens it on
 * their phone or a laptop, and it stays useful even where the device controls
 * above say notifications are unavailable.
 *
 * Values arrive from the server so the list renders right the first time, and
 * each toggle applies optimistically — a flip that fails to save rolls back
 * and says so rather than lying about what the server holds.
 */
export function NotificationPreferences({
  initial,
}: {
  initial: Record<PushCategory, boolean>;
}) {
  const { t } = useI18n();
  const n = t.profile.notifications;
  const [prefs, setPrefs] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(category: PushCategory, enabled: boolean) {
    setPrefs((current) => ({ ...current, [category]: enabled }));
    setError(null);
    startTransition(async () => {
      const result = await setPushPreference(category, enabled).catch(() => ({
        error: n.prefsFailed,
      }));
      if (result?.error) {
        setPrefs((current) => ({ ...current, [category]: !enabled }));
        setError(result.error);
      }
    });
  }

  const allOff = PUSH_CATEGORIES.every((category) => !prefs[category]);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-zinc-200">{n.prefsTitle}</p>
      <p className="text-sm text-zinc-400">{n.prefsHint}</p>

      <ul className="divide-y divide-white/[0.06]">
        {PUSH_CATEGORIES.map((category) => (
          <li key={category}>
            <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 py-2.5">
              <span className="text-sm text-zinc-200">
                {n.categories[category]}
              </span>
              <input
                type="checkbox"
                className="peer sr-only"
                checked={prefs[category]}
                onChange={(e) => toggle(category, e.target.checked)}
              />
              {/* Switch knob. Purely presentational — the sr-only checkbox
                  above is the real control, and the whole row is its label, so
                  a thumb anywhere on the line hits it. */}
              <span
                aria-hidden
                className="relative h-6 w-11 shrink-0 rounded-full bg-white/15 transition after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition after:content-[''] peer-checked:bg-gradient-to-r peer-checked:from-amber-400 peer-checked:to-orange-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-amber-400/40"
              />
            </label>
          </li>
        ))}
      </ul>

      {allOff && <p className="text-sm text-zinc-500">{n.prefsAllOff}</p>}
      {error && (
        <p className={errorText} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
