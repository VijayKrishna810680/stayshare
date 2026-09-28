import { cookies } from "next/headers";
import { z } from "zod";
import { api, parseBody } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current";
import { badRequest } from "@/lib/errors";
import { getConversation, postMessage } from "@/services/livechat";

const schema = z.object({ body: z.string().trim().min(1).max(4000) });

export const POST = api(
  async (req) => {
    const u = await getCurrentUser();
    const vt = (await cookies()).get("ss_chat")?.value;
    const c = await getConversation({ userId: u?.id, visitorToken: vt });
    if (!c) throw badRequest("Start a chat first");
    const { body } = await parseBody(req, schema);
    return postMessage(c.id, body, { userId: u?.id });
  },
  { rateLimit: { limit: 30, windowSec: 60 } },
);
