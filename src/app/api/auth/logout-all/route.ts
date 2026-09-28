import { api } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { clearAuthCookies, revokeAllSessions } from "@/lib/auth/session";

/** Log out from every device. */
export const POST = api(async () => {
  const u = await requireUser();
  await revokeAllSessions(u.id);
  await clearAuthCookies();
  return { ok: true };
});
