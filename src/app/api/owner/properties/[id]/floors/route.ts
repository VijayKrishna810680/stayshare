import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { floors } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { conflict } from "@/lib/errors";
import { assertOwnsProperty, requireOwner } from "@/lib/owner-access";
import { floorSchema } from "@/components/owner/schemas";


export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const p = await assertOwnsProperty(u, params.id);
  const body = await parseBody(req, floorSchema);
  const [dup] = await db.select({ id: floors.id }).from(floors).where(and(eq(floors.propertyId, p.id), eq(floors.number, body.number)));
  if (dup) throw conflict(`Floor ${body.number} already exists`);
  const [f] = await db.insert(floors).values({ propertyId: p.id, number: body.number, name: body.name || (body.number === 0 ? "Ground floor" : `Floor ${body.number}`) }).returning();
  await audit({ actorId: u.id, action: "floor.create", entityType: "floor", entityId: f!.id, after: f, ...reqMeta(req) });
  return f;
});
