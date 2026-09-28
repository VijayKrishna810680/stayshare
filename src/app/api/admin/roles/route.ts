import { z } from "zod";
import { db } from "@/db";
import { roles } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { requireStepUp } from "@/lib/auth/step-up";
import { conflict } from "@/lib/errors";
import { permKeys, setRolePermissions } from "../_lib/roles";
import { isUniqueViolation, logAudit } from "../_lib/util";

/** POST {key, name, description, permissions[]} — create a custom admin role. */
export const POST = api(async (req) => {
  const u = await requirePermission("admins.manage");
  const b = await parseBody(req, z.object({ key: z.string().trim().min(3).max(40), name: z.string().trim().min(2).max(80), description: z.string().max(300).nullable().optional(), permissions: permKeys }));
  await requireStepUp(u);
  const key = b.key.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const perms = [...new Set(["admin.access", ...b.permissions])];
  try {
    const [r] = await db.insert(roles).values({ key, name: b.name, description: b.description ?? null, isSystem: false }).returning();
    await setRolePermissions(r!.id, perms);
    await logAudit(req, u, "role.create", "role", r!.id, null, { key, name: b.name, permissions: perms });
    return r;
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("A role with this key already exists");
    throw e;
  }
});
