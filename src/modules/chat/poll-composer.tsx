"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { btnPrimary, btnSecondary, input } from "@/components/ui";

export function PollComposer({
  onCreate,
  onClose,
  pending,
}: {
  onCreate: (question: string, options: string[], multiple: boolean) => void;
  onClose: () => void;
  pending: boolean;
}) {
  const { t } = useI18n();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multiple, setMultiple] = useState(false);

  function setOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }

  const canSubmit =
    question.trim().length > 0 &&
    options.filter((o) => o.trim()).length >= 2 &&
    !pending;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
      <p className="mb-2 text-sm font-semibold text-white">{t.chat.newPoll}</p>
      <input
        className={`${input} mb-2`}
        placeholder={t.chat.pollQuestion}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        maxLength={200}
      />
      <div className="space-y-2">
        {options.map((opt, i) => (
          <input
            key={i}
            className={input}
            placeholder={t.chat.pollOption.replace("{n}", String(i + 1))}
            value={opt}
            onChange={(e) => setOption(i, e.target.value)}
            maxLength={100}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {options.length < 10 && (
          <button
            type="button"
            onClick={() => setOptions((prev) => [...prev, ""])}
            className="text-sm text-violet-300 hover:text-violet-200"
          >
            + {t.chat.pollAddOption}
          </button>
        )}
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={multiple}
            onChange={(e) => setMultiple(e.target.checked)}
          />
          {t.chat.pollAllowMultiple}
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() =>
            onCreate(
              question,
              options.filter((o) => o.trim()),
              multiple,
            )
          }
          className={btnPrimary}
        >
          {t.chat.pollCreate}
        </button>
        <button type="button" onClick={onClose} className={btnSecondary}>
          {t.common.cancel}
        </button>
      </div>
    </div>
  );
}
