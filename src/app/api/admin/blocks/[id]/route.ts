import { eq } from "drizzle-orm";
import { db } from "@/db";
import { inventoryBlocks } from "@/db/schema";
import { api } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { notFound } from "@/lib/errors";
import { releaseBlock } from "@/services/availability";
import { logAudit } from "../../_lib/util";

/** DELETE — release an inventory block (any creator). */
export const DELETE = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("properties.manage");
  const [b] = await db.select().from(inventoryBlocks).where(eq(inventoryBlocks.id, params.id));
  if (!b) throw notFound("Block not found");
  await releaseBlock(b.id);
  await logAudit(req, u, "inventory_block.release", "inventory_block", b.id, b, null);
  return { ok: true };
});
