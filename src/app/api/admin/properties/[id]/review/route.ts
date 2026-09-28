import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { properties, propertyFacilities, propertyImages, rooms } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { badRequest, notFound } from "@/lib/errors";
import { notify } from "@/services/notifications";
import { refreshStartingPrice } from "@/services/pricing";
import { logAudit } from "../../../_lib/util";

const schema = z.object({ action: z.enum(["approve", "reject", "changes"]), notes: z.string().trim().max(2000).optional().nullable(), approveAssets: z.boolean().default(true) });

/** Approve / reject / request changes for a property listing. Notifies the owner. */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("properties.approve");
  const b = await parseBody(req, schema);
  const [p] = await db.select().from(properties).where(eq(properties.id, params.id));
  if (!p || p.deletedAt) throw notFound("Property not found");
  if (b.action !== "approve" && (!b.notes || b.notes.length < 3)) throw badRequest("Please add notes for the owner explaining what needs to change");
  if (b.action === "approve") {
    const approved = await db.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.propertyId, p.id), eq(rooms.approvalStatus, "APPROVED"), isNull(rooms.deletedAt)));
    if (!approved.length) throw badRequest("Approve at least one room first — every room needs a price plan set by the StayShare team before it can be approved.");
  }
  const status = b.action === "approve" ? "APPROVED" : b.action === "reject" ? "REJECTED" : "CHANGES_REQUESTED";
  await db.transaction(async (tx) => {
    await tx
      .update(properties)
      .set({
        approvalStatus: status,
        approvalNotes: b.notes ?? null,
        updatedBy: u.id,
        ...(status === "APPROVED" ? { approvedBy: u.id, approvedAt: new Date(), kycStatus: "APPROVED" as const } : {}),
      })
      .where(eq(properties.id, p.id));
    if (status === "APPROVED" && b.approveAssets) {
      await tx.update(propertyImages).set({ status: "APPROVED" }).where(and(eq(propertyImages.propertyId, p.id), eq(propertyImages.status, "PENDING")));
      await tx.update(propertyFacilities).set({ status: "APPROVED" }).where(and(eq(propertyFacilities.propertyId, p.id), eq(propertyFacilities.status, "PENDING")));
    }
    await logAudit(req, u, `property.${b.action}`, "property", p.id, { approvalStatus: p.approvalStatus }, { approvalStatus: status, notes: b.notes }, tx);
  });
  await refreshStartingPrice(p.id);
  await notify(status === "APPROVED" ? "property.approved" : "property.rejected", { userId: p.ownerId, vars: { propertyName: p.name, notes: b.notes ?? "", status: status.replace("_", " ").toLowerCase() }, data: { propertyId: p.id } });
  return { status };
});
