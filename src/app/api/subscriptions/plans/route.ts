import { api } from "@/lib/api";
import { listPlans } from "@/services/subscriptions";

/** Public: active plans. ?audience=CUSTOMER|OWNER */
export const GET = api(async (req) => {
  const a = req.nextUrl.searchParams.get("audience");
  return listPlans(a === "OWNER" || a === "CUSTOMER" ? a : undefined);
});
