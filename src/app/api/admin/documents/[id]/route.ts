import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { propertyDocuments } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { notFound } from "@/lib/errors";
import { logAudit } from "../../_lib/util";

/** PATCH {status, notes} — review a property document (ownership proof, licence, fire NOC…). */
export const PATCH = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("properties.approve");
  const b = await parseBody(req, z.object({ status: z.enum(["APPROVED", "REJECTED", "PENDING"]), notes: z.string().max(1000).nullable().optional() }));
  const [before] = await db.select().from(propertyDocuments).where(eq(propertyDocuments.id, params.id));
  if (!before) throw notFound("Document not found");
  const [row] = await db.update(propertyDocuments).set({ status: b.status, notes: b.notes ?? before.notes }).where(eq(propertyDocuments.id, params.id)).returning();
  await logAudit(req, u, "property_document.review", "property_document", params.id, before, row);
  return row;
});
