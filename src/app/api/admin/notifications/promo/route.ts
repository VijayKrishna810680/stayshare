import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { badRequest } from "@/lib/errors";
import { notify } from "@/services/notifications";
import { logAudit } from "../../_lib/util";

const schema = z.object({
  title: z.string().trim().min(3).max(80),
  message: z.string().trim().min(5).max(500),
  segment: z.enum(["ALL_CUSTOMERS", "CITY", "OWNERS", "MEMBERS"]),
  cityId: z.string().uuid().nullable().optional(),
  link: z.string().trim().max(300).nullable().optional(),
});

/** POST — send a promotional notification (promo.offer templates) to a customer segment. */
export const POST = api(
  async (req) => {
    const u = await requirePermission("content.manage");
    const b = await parseBody(req, schema);
    if (b.segment === "CITY" && !b.cityId) throw badRequest("Choose a city");
    const q =
      b.segment === "OWNERS"
        ? sql`SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE r.key = 'OWNER' AND u.status = 'ACTIVE' AND u.deleted_at IS NULL`
        : b.segment === "MEMBERS"
          ? sql`SELECT DISTINCT s.user_id AS id FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE s.status = 'ACTIVE' AND s.audience = 'CUSTOMER' AND s.ends_at > now() AND u.status = 'ACTIVE'`
          : b.segment === "CITY"
            ? sql`SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id AND r.key = 'CUSTOMER'
                  LEFT JOIN customer_profiles cp ON cp.user_id = u.id
                  WHERE u.status = 'ACTIVE' AND u.deleted_at IS NULL AND (lower(cp.city) = (SELECT lower(name) FROM cities WHERE id = ${b.cityId}::uuid)
                    OR EXISTS (SELECT 1 FROM bookings bk JOIN properties p ON p.id = bk.property_id WHERE bk.customer_id = u.id AND p.city_id = ${b.cityId}::uuid))`
            : sql`SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE r.key = 'CUSTOMER' AND u.status = 'ACTIVE' AND u.deleted_at IS NULL`;
    const ids = ((await db.execute(sql`${q} LIMIT 20000`)).rows as { id: string }[]).map((r) => r.id);
    if (!ids.length) throw badRequest("No recipients match this segment");
    const message = b.link ? `${b.message} ${b.link}` : b.message;
    for (let i = 0; i < ids.length; i += 25) {
      await Promise.all(ids.slice(i, i + 25).map((id) => notify("promo.offer", { userId: id, vars: { title: b.title, message }, data: { link: b.link ?? null, campaign: true } })));
    }
    await logAudit(req, u, "notification.promo_send", "notification", null, null, { ...b, recipients: ids.length });
    return { recipients: ids.length };
  },
  { rateLimit: { limit: 10, windowSec: 600 } },
);
