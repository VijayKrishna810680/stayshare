import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { identityDocuments } from "@/db/schema";
import { api, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { conflict, notFound } from "@/lib/errors";
import { requireOwner } from "@/lib/owner-access";

export const DELETE = api<{ docId: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const [d] = await db.select().from(identityDocuments).where(and(eq(identityDocuments.id, params.docId), eq(identityDocuments.userId, u.id), isNull(identityDocuments.deletedAt)));
  if (!d) throw notFound("Document not found");
  if (d.status === "APPROVED") throw conflict("Verified documents can't be removed");
  await db.update(identityDocuments).set({ deletedAt: new Date() }).where(eq(identityDocuments.id, d.id));
  await audit({ actorId: u.id, action: "kyc.document_delete", entityType: "identity_document", entityId: d.id, ...reqMeta(req) });
  return { ok: true };
});
