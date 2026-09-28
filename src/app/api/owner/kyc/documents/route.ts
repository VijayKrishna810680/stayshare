import { z } from "zod";
import { db } from "@/db";
import { identityDocuments } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { encrypt, last4 } from "@/lib/crypto";
import { requireOwner } from "@/lib/owner-access";
import { ownFile } from "@/lib/owner-helpers";

/** POST {fileId, docType, number?}: attach a KYC document (stored in identity_documents; number encrypted). */
export const POST = api(async (req) => {
  const u = await requireOwner();
  const body = await parseBody(req, z.object({ fileId: z.string().uuid(), docType: z.string().trim().min(2).max(40), number: z.string().trim().max(40).optional().or(z.literal("").transform(() => undefined)) }));
  await ownFile(u.id, body.fileId, ["KYC"]);
  const [d] = await db
    .insert(identityDocuments)
    .values({ userId: u.id, docType: body.docType, fileId: body.fileId, numberEnc: encrypt(body.number ?? ""), numberLast4: body.number ? last4(body.number) : "", status: "PENDING" })
    .returning({ id: identityDocuments.id });
  await audit({ actorId: u.id, action: "kyc.document_add", entityType: "identity_document", entityId: d!.id, after: { docType: body.docType }, ...reqMeta(req) });
  return d;
});
