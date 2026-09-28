import { z } from "zod";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { requireStepUp } from "@/lib/auth/step-up";
import { badRequest, forbidden } from "@/lib/errors";
import { setAdminRoles } from "../../../_lib/admins";
import { logAudit } from "../../../_lib/util";

/** PUT {roleKeys} — replace an administrator's roles (OTP step-up required). */
export const PUT = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("admins.manage");
  const { roleKeys } = await parseBody(req, z.object({ roleKeys: z.array(z.string()) }));
  if (params.id === u.id && u.isSuperAdmin && !roleKeys.includes("SUPER_ADMIN")) throw badRequest("You cannot remove your own super administrator role");
  if (!u.isSuperAdmin && roleKeys.includes("SUPER_ADMIN")) throw forbidden("Only a super administrator can grant the super administrator role");
  await requireStepUp(u);
  const res = await setAdminRoles(params.id, roleKeys);
  await logAudit(req, u, "admin.roles_update", "user", params.id, { roles: res.before }, { roles: res.after });
  return res;
});
