import { z } from "zod";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import { requireStaffOrOwner, staffBooking } from "@/lib/owner-access";
import { ownFile } from "@/lib/owner-helpers";
import { checkIn } from "@/services/stay";

const schema = z.object({
  idVerified: z.boolean(),
  idDocType: z.enum(["AADHAAR", "PASSPORT", "DRIVING_LICENSE", "VOTER_ID", "PAN"]).optional().nullable(),
  idNumber: z.string().trim().min(4, "Enter the ID number").max(30).optional().nullable(),
  idFileId: z.string().uuid().optional().nullable(),
  depositCollected: z.number().int().min(0).max(100_000_000).default(0),
  cashCollected: z.number().int().min(0).max(100_000_000).default(0),
  assignBedIds: z.array(z.string().uuid()).max(24).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  allowEarly: z.boolean().default(false),
});

/** POST: check the guest in (ID verified, beds confirmed, cash collected). Only the ID's last 4 digits are stored. */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requireStaffOrOwner();
  const { booking } = await staffBooking(u, params.id);
  const body = await parseBody(req, schema);
  if (body.idVerified && !body.idDocType) throw badRequest("Select the ID document type");
  if (body.idFileId && body.idFileId !== booking.idProofFileId) await ownFile(u.id, body.idFileId, ["ID_PROOF"]);
  if (body.assignBedIds?.length && booking.unit === "ROOM") throw badRequest("Entire-room bookings keep all beds of the room");
  await checkIn(booking.id, u.id, body);
  await audit({ actorId: u.id, action: "booking.check_in", entityType: "booking", entityId: booking.id, before: { status: booking.status }, after: { status: "CHECKED_IN", idDocType: body.idDocType, depositCollected: body.depositCollected, cashCollected: body.cashCollected, beds: body.assignBedIds ?? undefined, early: body.allowEarly }, ...reqMeta(req) });
  return { ok: true };
});
