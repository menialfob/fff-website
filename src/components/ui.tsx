/**
 * Shared design-system pieces for the dark "klubhus" theme: glassy cards on a
 * near-black canvas, an amber→orange (beer!) primary gradient, and one accent
 * color per module. Components stay tiny — most of the system is the class
 * strings, so existing className-based components keep working.
 */

/* --- class recipes --------------------------------------------------------- */

export const card =
  "rounded-2xl border border-white/10 bg-white/[0.04] shadow-lg shadow-black/20";

export const cardHover =
  card +
  " transition hover:border-white/20 hover:bg-white/[0.07] active:scale-[0.99]";

export const cardPad = card + " p-4 sm:p-6";

export const input =
  "mt-1 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-base text-zinc-100 placeholder:text-zinc-500 focus:border-amber-400/60 focus:outline-none focus:ring-2 focus:ring-amber-400/20 sm:text-sm";

export const label = "block text-sm font-medium text-zinc-300";

export const btnPrimary =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-orange-500/20 transition hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

export const btnSecondary =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/10 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

export const btnSpotify =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 transition hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

export const btnDangerOutline =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-red-400/30 px-4 py-2.5 text-sm font-medium text-red-300 transition hover:bg-red-500/10 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

/** Small inline "delete/remove" text link. */
export const linkDanger =
  "cursor-pointer text-sm text-red-300 hover:text-red-200 hover:underline disabled:opacity-50";

/** Small pill chip (filters, placement pickers). Pass selected state. */
export function chip(selected: boolean): string {
  return `cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition ${
    selected
      ? "border-amber-400/60 bg-amber-400/15 font-medium text-amber-200"
      : "border-white/15 text-zinc-300 hover:bg-white/10"
  }`;
}

export const errorText = "text-sm text-red-300";
export const okText = "text-sm text-emerald-300";
export const mutedText = "text-zinc-400";

/** Dashed empty-state box. */
export const emptyBox =
  "rounded-2xl border border-dashed border-white/15 p-6 text-sm text-zinc-400";

/** List container: glass card whose rows divide with faint lines. */
export const listCard = card + " divide-y divide-white/[0.06] overflow-hidden";

/* --- per-module accents ----------------------------------------------------- */

export type ModuleAccent = {
  /** Gradient for icon tiles, e.g. dashboard cards. */
  gradient: string;
  /** Text color for the active nav item. */
  text: string;
};

export const moduleAccents: Record<string, ModuleAccent> = {
  dashboard: {
    gradient: "from-amber-400 to-orange-500",
    text: "text-amber-300",
  },
  files: { gradient: "from-sky-400 to-cyan-500", text: "text-sky-300" },
  klub100: {
    gradient: "from-fuchsia-500 to-pink-500",
    text: "text-fuchsia-300",
  },
  members: {
    gradient: "from-emerald-400 to-teal-500",
    text: "text-emerald-300",
  },
  admin: { gradient: "from-rose-400 to-red-500", text: "text-rose-300" },
  profile: {
    gradient: "from-violet-400 to-indigo-500",
    text: "text-violet-300",
  },
};

/* --- components ------------------------------------------------------------- */

/** Fixed, non-interactive color glows behind everything. */
export function BackgroundGlow() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute -top-32 right-[-10%] h-96 w-96 rounded-full bg-fuchsia-600/15 blur-3xl" />
      <div className="absolute -left-24 top-[-5%] h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="absolute bottom-[-15%] left-1/3 h-96 w-[32rem] rounded-full bg-indigo-600/15 blur-3xl" />
    </div>
  );
}

/** Page heading with a short gradient underline. */
export function PageTitle({
  children,
  sub,
}: {
  children: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-bold tracking-tight text-white">
        {children}
      </h1>
      <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-amber-400 to-orange-500" />
      {sub && <p className="mt-3 max-w-2xl text-zinc-400">{sub}</p>}
    </div>
  );
}

/** The FFF wordmark. */
export function Brand({ className = "" }: { className?: string }) {
  return (
    <span
      className={`bg-gradient-to-r from-amber-300 via-orange-400 to-fuchsia-400 bg-clip-text text-xl font-extrabold tracking-tight text-transparent ${className}`}
    >
      FFF
    </span>
  );
}
