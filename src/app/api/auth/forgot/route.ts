import { z } from "zod";
import { db } from "@/db";
import { passwordResets } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { findUserByIdentifier } from "@/lib/auth/users";
import { env } from "@/lib/env";
import { randomToken, sha256 } from "@/lib/crypto";
import { notify } from "@/services/notifications";
import { logger } from "@/lib/logger";

const schema = z.object({ identifier: z.string().trim().min(3) });

/** Always responds the same way so attackers can't discover which accounts exist. */
export const POST = api(
  async (req) => {
    const { identifier } = await parseBody(req, schema);
    const u = await findUserByIdentifier(identifier);
    let devLink: string | undefined;
    if (u && !u.deletedAt) {
      const token = randomToken(32);
      await db.insert(passwordResets).values({ userId: u.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60_000) });
      const link = `${env.appUrl}/reset-password?token=${token}`;
      logger.info("auth.reset_link", { userId: u.id });
      await notify("password.reset", { userId: u.id, vars: { name: u.name, link, minutes: 30 } });
      if (env.otpDevMode) devLink = `/reset-password?token=${token}`;
    }
    return { sent: true, devLink };
  },
  { rateLimit: { limit: 5, windowSec: 900 } },
);
