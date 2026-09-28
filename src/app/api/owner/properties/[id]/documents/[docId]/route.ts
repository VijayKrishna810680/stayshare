import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { propertyDocuments } from "@/db/schema";
import { api, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { conflict, notFound } from "@/lib/errors";
import { assertOwnsProperty, requireOwner } from "@/lib/owner-access";

export const DELETE = api<{ id: string; docId: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const p = await assertOwnsProperty(u, params.id);
  const [d] = await db.select().from(propertyDocuments).where(and(eq(propertyDocuments.id, params.docId), eq(propertyDocuments.propertyId, p.id)));
  if (!d) throw notFound("Document not found");
  if (d.status === "APPROVED") throw conflict("Approved documents can't be removed. Upload a newer version instead.");
  await db.delete(propertyDocuments).where(eq(propertyDocuments.id, d.id));
  await audit({ actorId: u.id, action: "property.document_delete", entityType: "property", entityId: p.id, before: { docId: d.id, docType: d.docType }, ...reqMeta(req) });
  return { ok: true };
});
