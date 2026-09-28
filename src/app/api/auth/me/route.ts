import { api } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current";

export const GET = api(async () => {
  const u = await getCurrentUser();
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, roles: u.roles, perms: u.perms, isAdmin: u.isAdmin, isOwner: u.isOwner, isStaff: u.isStaff };
});
