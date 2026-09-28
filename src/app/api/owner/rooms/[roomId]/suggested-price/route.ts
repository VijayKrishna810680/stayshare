import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rooms } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { forbidden } from "@/lib/errors";
import { getSettings } from "@/lib/settings";
import { ownerRoom, requireOwner } from "@/lib/owner-access";
import { suggestedPriceSchema } from "@/components/owner/schemas";

/**
 * PUT: optional SUGGESTED prices for StayShare team review. Only when the admin setting
 * owner.allowPriceSuggestion is on. Never customer-facing — admins set the real price plan.
 */
export const PUT = api<{ roomId: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const { "owner.allowPriceSuggestion": allowed } = await getSettings(["owner.allowPriceSuggestion"]);
  if (!allowed) throw forbidden("Prices are set by the StayShare team");
  const { room } = await ownerRoom(u, params.roomId);
  const body = await parseBody(req, suggestedPriceSchema);
  await db.update(rooms).set({ ...body, priceSubmittedAt: new Date(), updatedBy: u.id }).where(eq(rooms.id, room.id));
  await audit({ actorId: u.id, action: "room.price_suggestion", entityType: "room", entityId: room.id, before: { suggestedNightlyBed: room.suggestedNightlyBed, suggestedNightlyRoom: room.suggestedNightlyRoom, suggestedMonthlyBed: room.suggestedMonthlyBed, suggestedMonthlyRoom: room.suggestedMonthlyRoom, suggestedDeposit: room.suggestedDeposit }, after: body, ...reqMeta(req) });
  return { ok: true };
});
