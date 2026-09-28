import { LinkTabs } from "@/components/admin/ui";

export function PricingTabs({ active }: { active: "rooms" | "rules" | "history" }) {
  return (
    <LinkTabs
      active={active}
      tabs={[
        { key: "rooms", label: "Room prices", href: "/admin/pricing" },
        { key: "rules", label: "Pricing rules", href: "/admin/pricing/rules" },
        { key: "history", label: "Price history", href: "/admin/pricing/history" },
      ]}
    />
  );
}
