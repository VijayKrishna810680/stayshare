import "server-only";
import { db, type Tx } from "@/db";
import { auditLogs } from "@/db/schema";

export async function audit(
  e: { actorId?: string | null; action: string; entityType: string; entityId?: string | null; before?: unknown; after?: unknown; ip?: string; userAgent?: string },
  tx?: Tx,
) {
  await (tx ?? db).insert(auditLogs).values({
    actorId: e.actorId ?? null,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId ?? null,
    before: (e.before ?? null) as object | null,
    after: (e.after ?? null) as object | null,
    ip: e.ip,
    userAgent: e.userAgent?.slice(0, 300),
  });
}
