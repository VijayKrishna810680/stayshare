import { db } from "@/db";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { badRequest, conflict } from "@/lib/errors";
import { getResource } from "../../_lib/resources";
import { isUniqueViolation, logAudit, recordPriceChanges } from "../../_lib/util";

/** GET /api/admin/resources/:resource — list rows. POST — create. */
export const GET = api<{ resource: string }>(async (_req, { params }) => {
  const r = getResource(params.resource);
  await requirePermission(r.perm);
  const t = r.table as unknown as Record<string, unknown>;
  return db.select().from(r.table).orderBy(...r.orderBy(t)).limit(2000);
});

export const POST = api<{ resource: string }>(async (req, { params }) => {
  const r = getResource(params.resource);
  const u = await requirePermission(r.perm);
  const raw = (await parseBody(req, r.schema)) as Record<string, unknown>;
  const data = r.prepare ? r.prepare(raw, null) : raw;
  if (r.history?.requireReason && !data.reason) throw badRequest("A reason is required");
  const values = { ...data, ...(r.audited ? { createdBy: u.id, updatedBy: u.id } : r.updatedByOnly ? { updatedBy: u.id } : {}) };
  try {
    const row = await db.transaction(async (tx) => {
      const [row] = (await tx.insert(r.table).values(values as never).returning()) as Record<string, unknown>[];
      if (r.history) {
        await recordPriceChanges({ entityType: r.history.entityType, entityId: String(row!.id), before: null, after: row!, fields: r.history.fields, changedBy: u.id, reason: (data.reason as string) ?? "Created" }, tx);
      }
      await logAudit(req, u, `${r.entity}.create`, r.entity, String(row!.id), null, row, tx);
      return row!;
    });
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("A record with the same key/code already exists");
    throw e;
  }
});
