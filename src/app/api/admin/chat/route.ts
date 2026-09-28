import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatConversations, users } from "@/db/schema";
import { api } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";

/** Support inbox: GET /api/admin/chat?status=OPEN|CLOSED */
export const GET = api(async (req) => {
  await requirePermission("livechat.manage", "support.manage");
  const status = req.nextUrl.searchParams.get("status") ?? "OPEN";
  return db
    .select({ id: chatConversations.id, status: chatConversations.status, visitorName: chatConversations.visitorName, visitorContact: chatConversations.visitorContact, userName: users.name, userEmail: users.email, lastMessageAt: chatConversations.lastMessageAt, unread: chatConversations.unreadForAgent })
    .from(chatConversations)
    .leftJoin(users, eq(users.id, chatConversations.userId))
    .where(eq(chatConversations.status, status))
    .orderBy(desc(chatConversations.lastMessageAt))
    .limit(100);
});
