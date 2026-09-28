import "server-only";
import { redirect } from "next/navigation";
import type { PermissionKey } from "@/lib/rbac";
import { getCurrentUser, type CurrentUser } from "./current";

/** For Server Components/pages: redirect to login or /forbidden instead of throwing. */
export async function pageUser(opts: { perm?: PermissionKey | PermissionKey[]; role?: string | string[]; next?: string } = {}): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect(`/login${opts.next ? `?next=${encodeURIComponent(opts.next)}` : ""}`);
  const perms = opts.perm ? (Array.isArray(opts.perm) ? opts.perm : [opts.perm]) : [];
  if (perms.length && !perms.some((p) => u.perms.includes(p))) redirect("/forbidden");
  const roles = opts.role ? (Array.isArray(opts.role) ? opts.role : [opts.role]) : [];
  if (roles.length && !roles.some((r) => u.roles.includes(r))) redirect("/forbidden");
  return u;
}
