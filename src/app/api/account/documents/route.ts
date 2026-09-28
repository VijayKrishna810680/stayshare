import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { fileUploads, identityDocuments } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { encrypt, last4 } from "@/lib/crypto";
import { badRequest, notFound } from "@/lib/errors";

const PATTERNS: Record<string, { re: RegExp; msg: string }> = {
  AADHAAR: { re: /^\d{12}$/, msg: "Aadhaar number must be 12 digits" },
  PAN: { re: /^[A-Z]{5}\d{4}[A-Z]$/, msg: "Enter a valid PAN (e.g. ABCDE1234F)" },
  PASSPORT: { re: /^[A-Z][0-9]{7}$/, msg: "Enter a valid passport number (e.g. K1234567)" },
  DRIVING_LICENSE: { re: /^[A-Z0-9]{10,16}$/, msg: "Enter a valid driving licence number" },
  VOTER_ID: { re: /^[A-Z]{3}\d{7}$/, msg: "Enter a valid voter ID (e.g. ABC1234567)" },
};

/** GET: my identity documents (masked — only last 4 digits are ever returned). */
export const GET = api(async () => {
  const u = await requireUser();
  return db
    .select({ id: identityDocuments.id, docType: identityDocuments.docType, numberLast4: identityDocuments.numberLast4, fileId: identityDocuments.fileId, fileName: fileUploads.fileName, status: identityDocuments.status, createdAt: identityDocuments.createdAt })
    .from(identityDocuments)
    .leftJoin(fileUploads, eq(fileUploads.id, identityDocuments.fileId))
    .where(and(eq(identityDocuments.userId, u.id), isNull(identityDocuments.deletedAt)))
    .orderBy(desc(identityDocuments.createdAt));
});

const schema = z.object({ docType: z.enum(["AADHAAR", "PASSPORT", "DRIVING_LICENSE", "VOTER_ID", "PAN"]), number: z.string().trim().min(6).max(24), fileId: z.string().uuid().optional().nullable() });

/** POST: add a document; the number is AES-256-GCM encrypted at rest. */
export const POST = api(
  async (req) => {
    const u = await requireUser();
    const b = await parseBody(req, schema);
    const num = b.number.replace(/[\s-]/g, "").toUpperCase();
    const pat = PATTERNS[b.docType]!;
    if (!pat.re.test(num)) throw badRequest(pat.msg);
    if (b.fileId) {
      const [f] = await db.select().from(fileUploads).where(eq(fileUploads.id, b.fileId));
      if (!f || f.uploadedBy !== u.id || f.purpose !== "ID_PROOF") throw badRequest("Please upload the document file again");
    }
    const [row] = await db.insert(identityDocuments).values({ userId: u.id, docType: b.docType, numberEnc: encrypt(num), numberLast4: last4(num), fileId: b.fileId ?? null }).returning({ id: identityDocuments.id });
    await audit({ actorId: u.id, action: "identity_document.add", entityType: "identity_document", entityId: row!.id, after: { docType: b.docType }, ...reqMeta(req) });
    return row;
  },
  { rateLimit: { limit: 20, windowSec: 600 } },
);

/** DELETE ?id= */
export const DELETE = api(async (req) => {
  const u = await requireUser();
  const id = z.string().uuid().parse(req.nextUrl.searchParams.get("id"));
  const res = await db.update(identityDocuments).set({ deletedAt: new Date() }).where(and(eq(identityDocuments.id, id), eq(identityDocuments.userId, u.id), isNull(identityDocuments.deletedAt))).returning({ id: identityDocuments.id });
  if (!res.length) throw notFound("Document not found");
  await audit({ actorId: u.id, action: "identity_document.delete", entityType: "identity_document", entityId: id, ...reqMeta(req) });
  return { ok: true };
});
