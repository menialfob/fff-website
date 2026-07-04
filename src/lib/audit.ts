import { prisma } from "@/lib/db";

export type AuditMeta = Record<string, string | number | boolean | null>;

/**
 * Append a row to the admin-visible usage log (AuditLog table).
 *
 * `action` is a stable key rendered through `t.admin.log.events` at display
 * time — never store localized text. Snapshot human names into `meta`
 * (e.g. `targetName`) so rows still render after the referenced user is
 * deleted. Never put secrets (passwords) in `meta`.
 *
 * Must never throw: a failed log write must not break the calling action.
 */
export async function logEvent(input: {
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: AuditMeta;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        meta: input.meta ? JSON.stringify(input.meta) : null,
      },
    });
  } catch (err) {
    console.error("[audit] logEvent failed:", err);
  }
}
