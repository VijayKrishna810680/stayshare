import "server-only";
import { getSettings } from "./settings";

/** Server-side helper for pages: support contacts (null when not configured yet). */
export async function getSupportContacts() {
  const s = await getSettings(["platform.supportEmail", "platform.supportPhone", "platform.whatsapp", "platform.liveChatEnabled", "platform.supportHours"]);
  return { email: s["platform.supportEmail"] || null, phone: s["platform.supportPhone"] || null, whatsapp: s["platform.whatsapp"] || null, liveChat: Boolean(s["platform.liveChatEnabled"]), hours: s["platform.supportHours"] || null };
}
