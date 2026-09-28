import { z } from "zod";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { requireStepUp } from "@/lib/auth/step-up";
import { createUserAccount } from "@/lib/auth/users";
import { badRequest } from "@/lib/errors";
import { setAdminRoles } from "../_lib/admins";
import { logAudit } from "../_lib/util";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  phone: z.string().trim().regex(/^\+?[0-9 ]{10,15}$/, "Enter a valid mobile number").nullable().optional(),
  password: z.string().min(10, "Password must be at least 10 characters").max(100).regex(/[A-Z]/, "Include an uppercase letter").regex(/[0-9]/, "Include a number"),
  roleKeys: z.array(z.string()).min(1, "Choose at least one role"),
});

/** POST — create an administrator (OTP step-up required). */
export const POST = api(async (req) => {
  const u = await requirePermission("admins.manage");
  const b = await parseBody(req, schema);
  if (b.roleKeys.includes("SUPER_ADMIN") && !u.isSuperAdmin) throw badRequest("Only a super administrator can create another super administrator");
  await requireStepUp(u);
  const created = await createUserAccount({ name: b.name, email: b.email, phone: b.phone || null, password: b.password, role: "CUSTOMER", emailVerified: true, createdBy: u.id });
  const res = await setAdminRoles(created.id, b.roleKeys);
  await logAudit(req, u, "admin.create", "user", created.id, null, { name: b.name, email: b.email, roles: res.after });
  return { id: created.id };
});
