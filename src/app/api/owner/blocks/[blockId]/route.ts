import { eq } from "drizzle-orm";
import { db } from "@/db";
import { inventoryBlocks } from "@/db/schema";
import { api, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { conflict, notFound } from "@/lib/errors";
import { assertOwnsProperty, requireOwner } from "@/lib/owner-access";
import { releaseBlock } from "@/services/availability";

export const DELETE = api<{ blockId: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const [b] = await db.select().from(inventoryBlocks).where(eq(inventoryBlocks.id, params.blockId));
  if (!b) throw notFound("Block not found");
  await assertOwnsProperty(u, b.propertyId);
  if (b.releasedAt) throw conflict("Already released");
  if (b.reason === "ADMIN_BLOCK") throw conflict("This block was placed by the StayShare team");
  await releaseBlock(b.id);
  await audit({ actorId: u.id, action: "inventory.release", entityType: "property", entityId: b.propertyId, before: b, ...reqMeta(req) });
  return { ok: true };
});
