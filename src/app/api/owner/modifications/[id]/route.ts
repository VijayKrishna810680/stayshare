import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookingModifications } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { notFound } from "@/lib/errors";
import { ownerBooking, requireOwner } from "@/lib/owner-access";
import { decideModification } from "@/services/stay";

/** POST {approve, note}: approve or reject a guest's pending change request. */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const [m] = await db.select().from(bookingModifications).where(eq(bookingModifications.id, params.id));
  if (!m) throw notFound("Request not found");
  await ownerBooking(u, m.bookingId);
  const body = await parseBody(req, z.object({ approve: z.boolean(), note: z.string().trim().max(300).optional() }));
  const res = await decideModification(m.id, u.id, body.approve, body.note);
  await audit({ actorId: u.id, action: body.approve ? "modification.approve" : "modification.reject", entityType: "booking", entityId: m.bookingId, after: { modificationId: m.id, type: m.type, note: body.note }, ...reqMeta(req) });
  return { status: res.status };
});
