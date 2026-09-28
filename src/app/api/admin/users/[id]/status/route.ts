import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { loadRolesAndPerms, revokeAllSessions } from "@/lib/auth/session";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { logAudit } from "../../../_lib/util";

/** POST {status: ACTIVE|SUSPENDED, reason} — suspending also revokes every session. */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("users.manage");
  const b = await parseBody(req, z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]), reason: z.string().trim().max(500).nullable().optional() }));
  if (params.id === u.id) throw badRequest("You cannot change your own account status");
  const [target] = await db.select().from(users).where(eq(users.id, params.id));
  if (!target) throw notFound("User not found");
  const { roles } = await loadRolesAndPerms(target.id);
  if (roles.includes("SUPER_ADMIN") && !u.isSuperAdmin) throw forbidden("Only a super administrator can suspend a super administrator");
  if (b.status === "SUSPENDED" && (!b.reason || b.reason.length < 3)) throw badRequest("Give a reason for the suspension");
  await db.update(users).set({ status: b.status, updatedBy: u.id, ...(b.status === "ACTIVE" ? { failedLoginCount: 0, lockedUntil: null } : {}) }).where(eq(users.id, target.id));
  if (b.status === "SUSPENDED") await revokeAllSessions(target.id);
  await logAudit(req, u, b.status === "SUSPENDED" ? "user.suspend" : "user.reactivate", "user", target.id, { status: target.status }, { status: b.status, reason: b.reason });
  return { status: b.status };
});
