import { api } from "@/lib/api";
import { publicCoupons } from "@/lib/site/coupons";

/** Public, currently valid coupons (offers page & checkout suggestions). */
export const GET = api(async () => publicCoupons());
