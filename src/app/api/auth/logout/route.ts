import { api } from "@/lib/api";
import { revokeCurrentSession } from "@/lib/auth/session";

export const POST = api(async () => {
  await revokeCurrentSession();
  return { ok: true };
});
