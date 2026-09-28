import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { beds } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { badRequest, notFound } from "@/lib/errors";
import { defined, logAudit } from "../../_lib/util";

/** PATCH {status, active, bedType} for a bed. Use availability blocks to close dates. */
export const PATCH = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("properties.manage");
  const b = defined(await parseBody(req, z.object({ status: z.enum(["AVAILABLE", "OCCUPIED", "RESERVED", "BLOCKED", "CLEANING"]).optional(), active: z.boolean().optional(), bedType: z.string().trim().min(2).max(30).optional() })));
  if (!Object.keys(b).length) throw badRequest("Nothing to update");
  const [before] = await db.select().from(beds).where(eq(beds.id, params.id));
  if (!before) throw notFound("Bed not found");
  const [after] = await db.update(beds).set(b).where(eq(beds.id, params.id)).returning();
  await logAudit(req, u, "bed.update", "bed", params.id, Object.fromEntries(Object.keys(b).map((k) => [k, before[k as keyof typeof before]])), b);
  return after;
});
