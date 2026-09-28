import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { getResource } from "../../../_lib/resources";
import { isFkViolation, isUniqueViolation, logAudit, recordPriceChanges } from "../../../_lib/util";

const idOf = (t: unknown) => (t as { id: never }).id;

export const GET = api<{ resource: string; id: string }>(async (_req, { params }) => {
  const r = getResource(params.resource);
  await requirePermission(r.perm);
  const [row] = await db.select().from(r.table).where(eq(idOf(r.table), params.id));
  if (!row) throw notFound();
  return row;
});

export const PATCH = api<{ resource: string; id: string }>(async (req, { params }) => {
  const r = getResource(params.resource);
  const u = await requirePermission(r.perm);
  z.string().uuid().parse(params.id);
  const raw = (await parseBody(req, r.schema.partial())) as Record<string, unknown>;
  const [existing] = (await db.select().from(r.table).where(eq(idOf(r.table), params.id))) as Record<string, unknown>[];
  if (!existing) throw notFound();
  const data = r.prepare ? r.prepare(raw, existing) : raw;
  if (r.history?.requireReason && !data.reason) throw badRequest("A reason is required for this change");
  const patch = { ...data, ...(r.audited || r.updatedByOnly ? { updatedBy: u.id } : {}) };
  try {
    return await db.transaction(async (tx) => {
      const [row] = (await tx.update(r.table).set(patch as never).where(eq(idOf(r.table), params.id)).returning()) as Record<string, unknown>[];
      if (r.history) {
        await recordPriceChanges({ entityType: r.history.entityType, entityId: params.id, before: existing, after: data, fields: r.history.fields, changedBy: u.id, reason: (data.reason as string) ?? "Updated by admin" }, tx);
      }
      await logAudit(req, u, `${r.entity}.update`, r.entity, params.id, existing, row, tx);
      return row;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("A record with the same key/code already exists");
    throw e;
  }
});

export const DELETE = api<{ resource: string; id: string }>(async (req, { params }) => {
  const r = getResource(params.resource);
  const u = await requirePermission(r.perm);
  if (!r.deletable) throw forbidden("This record cannot be deleted — deactivate it instead");
  const [existing] = await db.select().from(r.table).where(eq(idOf(r.table), params.id));
  if (!existing) throw notFound();
  try {
    await db.delete(r.table).where(eq(idOf(r.table), params.id));
  } catch (e) {
    if (isFkViolation(e)) throw conflict("This record is in use and cannot be deleted. Deactivate it instead.");
    throw e;
  }
  if (r.history) await recordPriceChanges({ entityType: r.history.entityType, entityId: params.id, before: existing as Record<string, unknown>, after: { active: false }, fields: ["active"], changedBy: u.id, reason: "Deleted" });
  await logAudit(req, u, `${r.entity}.delete`, r.entity, params.id, existing, null);
  return { ok: true };
});
