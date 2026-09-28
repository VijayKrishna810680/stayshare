import { api } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { cancelSubscription } from "@/services/subscriptions";

export const POST = api<{ id: string }>(async (_req, { params }) => {
  const u = await requireUser();
  await cancelSubscription(params.id, { id: u.id, isAdmin: u.has("settings.manage") });
  return { ok: true };
});
