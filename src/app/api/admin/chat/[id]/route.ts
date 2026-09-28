import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { chatConversations } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { listMessages, postMessage } from "@/services/livechat";

export const GET = api<{ id: string }>(async (req, { params }) => {
  await requirePermission("livechat.manage", "support.manage");
  const after = req.nextUrl.searchParams.get("after");
  const msgs = await listMessages(params.id, after ? new Date(after) : undefined);
  await db.update(chatConversations).set({ unreadForAgent: 0 }).where(eq(chatConversations.id, params.id));
  return msgs;
});

const schema = z.object({ body: z.string().trim().min(1).max(4000) });
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("livechat.manage", "support.manage");
  const { body } = await parseBody(req, schema);
  return postMessage(params.id, body, { agentId: u.id });
});

/** PATCH {status:"CLOSED"|"OPEN"} */
export const PATCH = api<{ id: string }>(async (req, { params }) => {
  await requirePermission("livechat.manage", "support.manage");
  const { status } = await parseBody(req, z.object({ status: z.enum(["OPEN", "CLOSED"]) }));
  await db.update(chatConversations).set({ status }).where(eq(chatConversations.id, params.id));
  return { ok: true };
});
