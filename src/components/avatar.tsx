/**
 * The one avatar renderer for the whole site: uploaded profile picture when
 * the user has one, otherwise a deterministic gradient circle with their
 * initial. Pure and isomorphic — usable from server and client components.
 */

/** Stable, friendly gradient per user — derived from their id. */
const avatarGradients = [
  "from-amber-400 to-orange-500",
  "from-sky-400 to-cyan-500",
  "from-fuchsia-500 to-pink-500",
  "from-emerald-400 to-teal-500",
  "from-violet-400 to-indigo-500",
  "from-rose-400 to-red-500",
];

export function gradientFor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return avatarGradients[hash % avatarGradients.length];
}

/**
 * The URL serving a user's current avatar, or null when they have none.
 * `avatarUpdatedAt` is baked in as a version so the immutable cache busts on
 * re-upload. Accepts the epoch as a number or Date so both DTOs (numbers over
 * the wire) and Prisma rows work.
 */
export function avatarUrlFor(user: {
  id: string;
  avatarStoredName?: string | null;
  avatarUpdatedAt?: Date | number | null;
}): string | null {
  if (!user.avatarStoredName) return null;
  const v =
    user.avatarUpdatedAt instanceof Date
      ? user.avatarUpdatedAt.getTime()
      : (user.avatarUpdatedAt ?? 0);
  return `/api/avatar/${user.id}?v=${v}`;
}

const sizeClasses = {
  // Diameter + initial font size, tuned per usage site.
  xs: "h-4 w-4 text-[0.5rem]",
  sm: "h-8 w-8 text-xs",
  md: "h-11 w-11 text-base",
  lg: "h-20 w-20 text-2xl",
} as const;

export type AvatarSize = keyof typeof sizeClasses;

export function Avatar({
  id,
  name,
  avatarUrl,
  size = "md",
  className = "",
}: {
  id: string;
  name: string;
  avatarUrl: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  const base = `shrink-0 rounded-full ${sizeClasses[size]} ${className}`;
  if (avatarUrl) {
    return (
      // Authenticated dynamic route; next/image's optimizer would re-fetch
      // the URL server-side without the session cookie.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={`${base} object-cover`}
        loading="lazy"
        draggable={false}
      />
    );
  }
  return (
    <span
      className={`flex items-center justify-center bg-gradient-to-br font-bold text-white ${gradientFor(id)} ${base}`}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
