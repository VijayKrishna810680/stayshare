import { z } from "zod";
import { db } from "@/db";
import { propertyDocuments } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { assertOwnsProperty, requireOwner } from "@/lib/owner-access";
import { ownFile } from "@/lib/owner-helpers";

/** POST {fileId, docType, notes}: attach an uploaded PROPERTY_DOC (ownership proof, licences, NOCs...). */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const p = await assertOwnsProperty(u, params.id);
  const body = await parseBody(req, z.object({ fileId: z.string().uuid(), docType: z.string().trim().min(2).max(40), notes: z.string().trim().max(300).optional().nullable() }));
  await ownFile(u.id, body.fileId, ["PROPERTY_DOC"]);
  const [d] = await db.insert(propertyDocuments).values({ propertyId: p.id, docType: body.docType, fileId: body.fileId, notes: body.notes ?? null, status: "PENDING" }).returning();
  await audit({ actorId: u.id, action: "property.document_add", entityType: "property", entityId: p.id, after: { docId: d!.id, docType: body.docType }, ...reqMeta(req) });
  return d;
});
