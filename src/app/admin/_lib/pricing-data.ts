import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rooms } from "@/db/schema";
import { getActivePlan } from "@/services/pricing";
import type { PlanValues, RoomInfo, Suggestion } from "@/components/admin/pricing-editor";

export async function loadRoomPricing(roomId: string): Promise<{ room: RoomInfo & { propertyId: string; approvalStatus: string }; plan: PlanValues | null; suggestion: Suggestion; planMeta: { id: string; effectiveFrom: Date; updatedAt: Date } | null } | null> {
  const [r] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!r) return null;
  return roomPricingFrom(r);
}

export async function roomPricingFrom(r: typeof rooms.$inferSelect) {
  const p = await getActivePlan(r.id);
  const hasSuggestion = r.suggestedNightlyBed != null || r.suggestedNightlyRoom != null || r.suggestedMonthlyBed != null || r.suggestedMonthlyRoom != null;
  return {
    room: {
      id: r.id,
      propertyId: r.propertyId,
      approvalStatus: r.approvalStatus,
      roomNumber: r.roomNumber,
      name: r.name,
      category: r.category,
      sharingCapacity: r.sharingCapacity,
      totalBeds: r.totalBeds,
      maxOccupancy: r.maxOccupancy,
      isAC: r.isAC,
      allowBedBooking: r.allowBedBooking,
      allowEntireRoomBooking: r.allowEntireRoomBooking,
    },
    plan: p
      ? {
          name: p.name,
          nightlyBed: p.nightlyBed,
          nightlyRoom: p.nightlyRoom,
          weeklyBed: p.weeklyBed,
          weeklyRoom: p.weeklyRoom,
          monthlyBed: p.monthlyBed,
          monthlyRoom: p.monthlyRoom,
          extraAdultPerNight: p.extraAdultPerNight,
          childPerNight: p.childPerNight,
          acChargePerNight: p.acChargePerNight,
          foodPerPersonPerDay: p.foodPerPersonPerDay,
          laundryPerMonth: p.laundryPerMonth,
          cleaningFee: p.cleaningFee,
          securityDepositBed: p.securityDepositBed,
          securityDepositRoom: p.securityDepositRoom,
          durationPrices: p.durationPrices.map((d) => ({ unit: d.unit, nights: d.nights, totalPrice: d.totalPrice })),
        }
      : null,
    suggestion: hasSuggestion ? { nightlyBed: r.suggestedNightlyBed, nightlyRoom: r.suggestedNightlyRoom, monthlyBed: r.suggestedMonthlyBed, monthlyRoom: r.suggestedMonthlyRoom, deposit: r.suggestedDeposit, note: r.suggestedNote, submittedAt: r.priceSubmittedAt } : null,
    planMeta: p ? { id: p.id, effectiveFrom: p.effectiveFrom, updatedAt: p.updatedAt } : null,
  };
}
