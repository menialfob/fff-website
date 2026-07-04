"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { locales, type Locale } from "@/lib/i18n";
import { setLocale } from "@/lib/i18n/actions";
import { useI18n } from "@/lib/i18n/client";
import { GlobeIcon } from "@/components/icons";

const localeNames: Record<Locale, string> = { da: "Dansk", en: "English" };

export function LocaleSwitcher() {
  const { locale } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const choose = (next: Locale) => {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  };

  return (
    <div className="inline-flex items-center gap-2">
      <GlobeIcon className="h-4 w-4 text-zinc-500" />
      <div className="inline-flex rounded-full border border-white/15 bg-white/[0.04] p-0.5">
        {locales.map((l) => (
          <button
            key={l}
            type="button"
            disabled={isPending}
            onClick={() => choose(l)}
            className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
              l === locale
                ? "bg-gradient-to-r from-amber-400 to-orange-500 text-zinc-950"
                : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {localeNames[l]}
          </button>
        ))}
      </div>
    </div>
  );
}
