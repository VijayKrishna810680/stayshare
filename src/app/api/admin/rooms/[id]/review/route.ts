import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { beds, roomImages, rooms } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { badRequest, notFound } from "@/lib/errors";
import { getActivePlan, refreshStartingPrice } from "@/services/pricing";
import { logAudit } from "../../../_lib/util";

const schema = z.object({ action: z.enum(["approve", "reject", "changes"]), notes: z.string().trim().max(2000).optional().nullable(), approveImages: z.boolean().default(true) });

/** Approve a room — only possible once the admin team has created its price plan. */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("properties.approve");
  const b = await parseBody(req, schema);
  const [r] = await db.select().from(rooms).where(eq(rooms.id, params.id));
  if (!r || r.deletedAt) throw notFound("Room not found");
  if (b.action === "approve") {
    const plan = await getActivePlan(r.id);
    if (!plan) throw badRequest(`Room ${r.roomNumber} has no price plan. Enter its prices in the pricing editor before approving.`);
    const bedRows = await db.select({ id: beds.id }).from(beds).where(and(eq(beds.roomId, r.id), eq(beds.active, true), isNull(beds.deletedAt)));
    if (!bedRows.length) throw badRequest("This room has no active beds");
  } else if (!b.notes || b.notes.length < 3) throw badRequest("Please add notes explaining the decision");
  const status = b.action === "approve" ? "APPROVED" : b.action === "reject" ? "REJECTED" : "CHANGES_REQUESTED";
  await db.update(rooms).set({ approvalStatus: status, approvalNotes: b.notes ?? null, updatedBy: u.id }).where(eq(rooms.id, r.id));
  if (status === "APPROVED" && b.approveImages) await db.update(roomImages).set({ status: "APPROVED" }).where(and(eq(roomImages.roomId, r.id), eq(roomImages.status, "PENDING")));
  await refreshStartingPrice(r.propertyId);
  await logAudit(req, u, `room.${b.action}`, "room", r.id, { approvalStatus: r.approvalStatus }, { approvalStatus: status, notes: b.notes });
  return { status };
});
