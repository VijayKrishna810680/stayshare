import "server-only";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { chatConversations, chatMessages, users } from "@/db/schema";
import { notFound } from "@/lib/errors";

export async function getConversation(opts: { userId?: string | null; visitorToken?: string | null }) {
  if (opts.userId) {
    const [c] = await db.select().from(chatConversations).where(and(eq(chatConversations.userId, opts.userId), eq(chatConversations.status, "OPEN"))).orderBy(desc(chatConversations.createdAt)).limit(1);
    if (c) return c;
  }
  if (opts.visitorToken) {
    const [c] = await db.select().from(chatConversations).where(eq(chatConversations.visitorToken, opts.visitorToken));
    if (c && c.status === "OPEN") return c;
  }
  return null;
}

export async function startConversation(opts: { userId?: string | null; name?: string | null; contact?: string | null; visitorToken?: string | null }) {
  const existing = await getConversation(opts);
  if (existing) return existing;
  const [c] = await db
    .insert(chatConversations)
    .values({ userId: opts.userId ?? null, visitorName: opts.name ?? null, visitorContact: opts.contact ?? null, visitorToken: opts.userId ? null : opts.visitorToken })
    .returning();
  await db.insert(chatMessages).values({ conversationId: c!.id, fromAgent: true, body: "Hi! 👋 Welcome to StayShare support. How can we help you today?" });
  return c!;
}

export async function listMessages(conversationId: string, after?: Date) {
  return db
    .select({ id: chatMessages.id, body: chatMessages.body, fromAgent: chatMessages.fromAgent, createdAt: chatMessages.createdAt, authorName: users.name })
    .from(chatMessages)
    .leftJoin(users, eq(users.id, chatMessages.authorId))
    .where(after ? and(eq(chatMessages.conversationId, conversationId), gt(chatMessages.createdAt, after)) : eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAt));
}

export async function postMessage(conversationId: string, body: string, from: { agentId?: string; userId?: string | null }) {
  const [c] = await db.select().from(chatConversations).where(eq(chatConversations.id, conversationId));
  if (!c) throw notFound("Conversation not found");
  const fromAgent = Boolean(from.agentId);
  const [m] = await db.insert(chatMessages).values({ conversationId, body: body.slice(0, 4000), fromAgent, authorId: from.agentId ?? from.userId ?? null }).returning();
  await db
    .update(chatConversations)
    .set({
      lastMessageAt: new Date(),
      status: "OPEN",
      ...(fromAgent
        ? { unreadForUser: sql`${chatConversations.unreadForUser} + 1`, unreadForAgent: 0, assignedToId: c.assignedToId ?? from.agentId }
        : { unreadForAgent: sql`${chatConversations.unreadForAgent} + 1`, unreadForUser: 0 }),
    })
    .where(eq(chatConversations.id, conversationId));
  return m!;
}
