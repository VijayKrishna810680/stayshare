import { pageUser } from "@/lib/auth/page";
import { getSettings } from "@/lib/settings";
import { Alert, PageHeader } from "@/components/ui";
import { ChatInbox } from "@/components/admin/chat-inbox";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live chat" };

export default async function ChatPage() {
  const u = await pageUser({ perm: ["livechat.manage", "support.manage"] });
  const s = await getSettings(["platform.liveChatEnabled"]);
  return (
    <>
      <PageHeader title="Live chat" description="Real-time conversations from the customer site. The thread refreshes every few seconds." />
      {!s["platform.liveChatEnabled"] && (
        <div className="mb-4">
          <Alert tone="warn">Live chat is currently disabled for customers (Settings → Contact &amp; support). Existing conversations can still be answered.</Alert>
        </div>
      )}
      <ChatInbox canTicket={u.has("support.manage")} />
    </>
  );
}
