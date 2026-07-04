/**
 * Extra, independent roles a user can hold besides the ADMIN/MEMBER admin
 * flag. This mirrors the `ExtraRole` Prisma enum in prisma/schema.prisma as
 * a plain string-literal union so the edge-safe auth config and middleware
 * can use the type without importing @prisma/client — keep the two in sync.
 */
export const extraRoles = ["BESTYRELSE"] as const;

export type ExtraRole = (typeof extraRoles)[number];

export function isExtraRole(value: unknown): value is ExtraRole {
  return extraRoles.includes(value as ExtraRole);
}
