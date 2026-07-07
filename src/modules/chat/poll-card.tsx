"use client";

import { useI18n } from "@/lib/i18n/client";
import type { PollDTO } from "@/lib/realtime";

const barBg = "bg-white/[0.06]";

export function PollCard({
  poll,
  viewerId,
  onVote,
}: {
  poll: PollDTO;
  viewerId: string;
  onVote: (pollId: string, optionId: string) => void;
}) {
  const { t } = useI18n();
  const total = poll.tallies.reduce((sum, tal) => sum + tal.count, 0);
  const closed = poll.closesAt ? new Date(poll.closesAt).getTime() < Date.now() : false;

  return (
    <div className="mt-1 w-full max-w-sm rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-white">
        <span aria-hidden>📊</span>
        {poll.question}
      </p>
      <div className="space-y-1.5">
        {poll.options.map((opt) => {
          const tally = poll.tallies.find((x) => x.optionId === opt.id);
          const count = tally?.count ?? 0;
          const voted = tally?.userIds.includes(viewerId) ?? false;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={closed}
              onClick={() => onVote(poll.id, opt.id)}
              className={`relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition ${
                voted
                  ? "border-violet-400/60 text-white"
                  : "border-white/[0.08] text-zinc-200 hover:border-white/20"
              } ${closed ? "cursor-default opacity-80" : "cursor-pointer"}`}
            >
              <span
                aria-hidden
                className={`absolute inset-y-0 left-0 ${
                  voted ? "bg-violet-500/25" : barBg
                }`}
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  {voted && <span aria-hidden>✓</span>}
                  {opt.text}
                </span>
                <span className="shrink-0 tabular-nums text-zinc-400">
                  {count}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {t.chat.pollVotes.replace("{count}", String(total))}
        {poll.multiple ? ` · ${t.chat.pollMultiple}` : ""}
        {closed ? ` · ${t.chat.pollClosed}` : ""}
      </p>
    </div>
  );
}
