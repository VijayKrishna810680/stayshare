import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { properties, rooms } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current";
import { badRequest, notFound } from "@/lib/errors";
import { roomsAvailability, sweepExpiredHolds } from "@/services/availability";
import { buildQuote } from "@/services/pricing";

const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";
const schema = z.object({
  roomId: z.string().uuid(),
  unit: z.enum(["BED", "ROOM"]),
  bedsCount: z.number().int().min(1).max(20).default(1),
  bedIds: z.array(z.string().uuid()).max(20).optional(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20).default(0),
  services: z.array(z.enum(["FOOD", "LAUNDRY"])).max(2).default([]),
  couponCode: z.string().trim().max(40).optional().nullable(),
});

/** Live price for a prospective booking, computed by the admin-controlled pricing engine. */
export const POST = api(
  async (req) => {
    const body = await parseBody(req, schema);
    const user = await getCurrentUser();
    const [room] = await db
      .select({ id: rooms.id, approval: rooms.approvalStatus, active: rooms.active, deletedAt: rooms.deletedAt, totalBeds: rooms.totalBeds, pApproval: properties.approvalStatus, pActive: properties.active, pBlocked: properties.blocked })
      .from(rooms)
      .innerJoin(properties, eq(properties.id, rooms.propertyId))
      .where(and(eq(rooms.id, body.roomId)));
    if (!room || room.approval !== "APPROVED" || !room.active || room.deletedAt || room.pApproval !== "APPROVED" || !room.pActive || room.pBlocked) throw notFound("Room is not available for booking");
    if (body.checkOut <= body.checkIn) throw badRequest("Check-out must be after check-in");

    await sweepExpiredHolds();
    const avail = (await roomsAvailability([body.roomId], body.checkIn, body.checkOut)).get(body.roomId)!;
    const bedIds = body.unit === "BED" ? (body.bedIds?.length ? body.bedIds : Array(Math.max(body.bedsCount, body.adults)).fill(PLACEHOLDER)) : Array(room.totalBeds).fill(PLACEHOLDER);
    const { quote, coupon } = await buildQuote({
      roomId: body.roomId,
      unit: body.unit,
      bedIds,
      checkIn: body.checkIn,
      checkOut: body.checkOut,
      adults: body.adults,
      children: body.children,
      services: body.services,
      couponCode: body.couponCode || null,
      customerId: user?.id ?? null,
    });
    return {
      quote: {
        lines: quote.lines,
        totalAmount: quote.totalAmount,
        payableExDeposit: quote.payableExDeposit,
        securityDeposit: quote.securityDeposit,
        couponDiscount: quote.couponDiscount,
        nights: quote.nights,
        units: quote.units,
        tierLabel: quote.tierLabel,
        baseNightlyPerUnit: quote.baseNightlyPerUnit,
        nonRefundable: quote.nonRefundable,
        taxRateBps: quote.taxRateBps,
      },
      coupon: coupon ? { code: coupon.code } : null,
      availability: { totalBeds: avail.totalBeds, availableBeds: avail.availableBeds, entireRoomAvailable: avail.entireRoomAvailable },
    };
  },
  { rateLimit: { limit: 240, windowSec: 60 } },
);
