import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { propertyImages, properties, roomImages, rooms } from "@/db/schema";
import { api, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { badRequest, conflict } from "@/lib/errors";
import { assertOwnsProperty, requireOwner } from "@/lib/owner-access";

/** POST: submit a draft (or returned) property for StayShare review → PENDING. */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const p = await assertOwnsProperty(u, params.id);
  if (!["DRAFT", "CHANGES_REQUESTED", "REJECTED"].includes(p.approvalStatus)) throw conflict(p.approvalStatus === "PENDING" ? "Already submitted — the StayShare team is reviewing it" : "This property is already live");
  const [imgs] = await db.select({ n: sql<number>`count(*)::int` }).from(propertyImages).where(eq(propertyImages.propertyId, p.id));
  if (!Number(imgs?.n)) throw badRequest("Add at least one building photo before submitting");
  const rs = await db.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.propertyId, p.id), isNull(rooms.deletedAt), eq(rooms.active, true)));
  if (!rs.length) throw badRequest("Add at least one room with beds before submitting");
  await db.transaction(async (tx) => {
    await tx.update(properties).set({ approvalStatus: "PENDING", submittedAt: new Date(), updatedBy: u.id }).where(eq(properties.id, p.id));
    await tx.update(rooms).set({ approvalStatus: "PENDING" }).where(and(eq(rooms.propertyId, p.id), inArray(rooms.approvalStatus, ["DRAFT", "CHANGES_REQUESTED", "REJECTED"])));
    await tx.update(propertyImages).set({ status: "PENDING" }).where(and(eq(propertyImages.propertyId, p.id), eq(propertyImages.status, "DRAFT")));
    await tx.update(roomImages).set({ status: "PENDING" }).where(and(inArray(roomImages.roomId, rs.map((r) => r.id)), eq(roomImages.status, "DRAFT")));
  });
  await audit({ actorId: u.id, action: "property.submit", entityType: "property", entityId: p.id, before: { status: p.approvalStatus }, after: { status: "PENDING" }, ...reqMeta(req) });
  return { ok: true, status: "PENDING" };
});
