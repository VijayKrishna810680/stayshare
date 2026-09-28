import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { chatConversations } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current";
import { randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getConversation, listMessages, startConversation } from "@/services/livechat";

const VISITOR = "ss_chat";

/** GET: my open conversation + messages (optionally ?after=ISO for polling). */
export const GET = api(async (req) => {
  const u = await getCurrentUser();
  const vt = (await cookies()).get(VISITOR)?.value;
  const c = await getConversation({ userId: u?.id, visitorToken: vt });
  if (!c) return { conversation: null, messages: [] };
  const after = req.nextUrl.searchParams.get("after");
  const messages = await listMessages(c.id, after ? new Date(after) : undefined);
  if (c.unreadForUser) await db.update(chatConversations).set({ unreadForUser: 0 }).where(eq(chatConversations.id, c.id));
  return { conversation: { id: c.id, status: c.status }, messages };
});

const startSchema = z.object({ name: z.string().trim().max(80).optional(), contact: z.string().trim().max(120).optional() });

/** POST: start (or resume) a chat. Logged-out visitors get an httpOnly token cookie. */
export const POST = api(
  async (req) => {
    const u = await getCurrentUser();
    const body = await parseBody(req, startSchema);
    const jar = await cookies();
    let vt = jar.get(VISITOR)?.value;
    if (!u && !vt) {
      vt = randomToken(24);
      jar.set(VISITOR, vt, { httpOnly: true, sameSite: "lax", secure: env.isProd, path: "/", maxAge: 60 * 60 * 24 * 30 });
    }
    const c = await startConversation({ userId: u?.id, name: u?.name ?? body.name, contact: u?.phone ?? u?.email ?? body.contact, visitorToken: vt });
    return NextResponse.json({ data: { conversation: { id: c.id, status: c.status }, messages: await listMessages(c.id) } });
  },
  { rateLimit: { limit: 20, windowSec: 600 } },
);
