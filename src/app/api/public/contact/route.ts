import { api } from "@/lib/api";
import { getSettings } from "@/lib/settings";

/** Public support contact details (blank until the app owner fills them in Admin → Settings). */
export const GET = api(async () => {
  const s = await getSettings(["platform.supportEmail", "platform.supportPhone", "platform.whatsapp", "platform.liveChatEnabled", "platform.supportHours", "platform.name"]);
  return { email: s["platform.supportEmail"] || null, phone: s["platform.supportPhone"] || null, whatsapp: s["platform.whatsapp"] || null, liveChat: s["platform.liveChatEnabled"], hours: s["platform.supportHours"] || null, name: s["platform.name"] };
});
