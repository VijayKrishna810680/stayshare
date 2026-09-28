import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, checkIns, fileUploads, identityDocuments, propertyDocuments, properties, staffAssignments, supportTickets } from "@/db/schema";
import { api } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current";
import { forbidden, notFound, unauthorized } from "@/lib/errors";
import { readStored } from "@/services/storage";
import { and, or } from "drizzle-orm";

/**
 * Serve an uploaded file. PUBLIC files are cacheable; PRIVATE files (ID proofs, KYC, documents)
 * are only readable by the uploader, admins with the right permission, or the property's owner/staff
 * for guests who booked their property.
 */
export const GET = api<{ id: string }>(async (_req, { params }) => {
  const [f] = await db.select().from(fileUploads).where(eq(fileUploads.id, params.id));
  if (!f) throw notFound("File not found");
  if (f.visibility === "PRIVATE") {
    const u = await getCurrentUser();
    if (!u) throw unauthorized();
    let ok = f.uploadedBy === u.id || u.has("users.view") || u.has("kyc.approve") || u.has("properties.approve") || u.has("support.manage");
    if (!ok && (u.isOwner || u.isStaff) && f.purpose === "ID_PROOF") {
      // owner/staff may view ID proofs of guests with bookings at their properties
      const rows = await db
        .select({ id: bookings.id })
        .from(bookings)
        .innerJoin(properties, eq(properties.id, bookings.propertyId))
        .leftJoin(staffAssignments, eq(staffAssignments.propertyId, properties.id))
        .leftJoin(checkIns, eq(checkIns.bookingId, bookings.id))
        .where(and(or(eq(bookings.idProofFileId, f.id), eq(checkIns.idFileId, f.id), eq(bookings.customerId, f.uploadedBy)), or(eq(properties.ownerId, u.id), eq(staffAssignments.userId, u.id))))
        .limit(1);
      ok = rows.length > 0;
    }
    if (!ok && u.isOwner && f.purpose === "PROPERTY_DOC") {
      const rows = await db.select({ id: propertyDocuments.id }).from(propertyDocuments).innerJoin(properties, eq(properties.id, propertyDocuments.propertyId)).where(and(eq(propertyDocuments.fileId, f.id), eq(properties.ownerId, u.id)));
      ok = rows.length > 0;
    }
    if (!ok && f.purpose === "TICKET_ATTACHMENT") {
      const rows = await db.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.raisedById, u.id));
      ok = rows.length > 0 && f.uploadedBy === u.id;
    }
    if (!ok) {
      const [doc] = await db.select().from(identityDocuments).where(eq(identityDocuments.fileId, f.id));
      ok = Boolean(doc && doc.userId === u.id);
    }
    if (!ok) throw forbidden();
  }
  const buf = await readStored(f.storageKey);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": f.mimeType,
      "Content-Length": String(buf.length),
      "Content-Disposition": `${f.mimeType === "application/pdf" ? "inline" : "inline"}; filename="${f.fileName.replace(/"/g, "")}"`,
      "Cache-Control": f.visibility === "PUBLIC" ? "public, max-age=31536000, immutable" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
