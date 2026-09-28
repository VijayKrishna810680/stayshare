import { FormDialogButton } from "@/components/admin/widgets";

/** Allowed payout transitions (mirrors settlement.ts PAYOUT_FLOW) rendered as dialog buttons. */
const FLOW: Record<string, string[]> = {
  PENDING: ["APPROVED", "ON_HOLD", "FAILED"],
  ON_HOLD: ["PENDING", "APPROVED", "FAILED"],
  APPROVED: ["PROCESSING", "ON_HOLD", "FAILED"],
  PROCESSING: ["PAID", "FAILED"],
  PAID: ["REVERSED"],
  FAILED: ["PENDING"],
  REVERSED: [],
};
const LABEL: Record<string, string> = { APPROVED: "Approve", ON_HOLD: "Hold", PENDING: "Release / retry", PROCESSING: "Mark processing", PAID: "Mark paid", FAILED: "Mark failed", REVERSED: "Reverse" };

export function PayoutActions({ id, status, amount, deductions }: { id: string; status: string; amount: number; deductions: number }) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {(FLOW[status] ?? []).map((to) => (
        <FormDialogButton
          key={to}
          url={`/api/admin/payouts/${id}`}
          label={LABEL[to]}
          variant={to === "PAID" || to === "APPROVED" ? "primary" : to === "FAILED" || to === "REVERSED" ? "danger" : "outline"}
          title={`${LABEL[to]} payout`}
          description={`Gross ₹${(amount / 100).toLocaleString("en-IN")}${deductions ? ` · current deductions ₹${(deductions / 100).toLocaleString("en-IN")}` : ""}`}
          fields={[
            { name: "to", label: "New status", type: "select", options: [{ value: to, label: to.replace("_", " ").toLowerCase() }], required: true, defaultValue: to },
            ...(to === "PAID" ? [{ name: "reference", label: "Bank reference / UTR", required: true }] : []),
            ...(["APPROVED", "PROCESSING", "PAID"].includes(to) ? [{ name: "deductions", label: "Deductions (TDS, penalties, adjustments)", type: "money" as const, defaultValue: String(deductions / 100), hint: "Net paid = gross − deductions" }] : []),
            { name: "note", label: ["ON_HOLD", "FAILED", "REVERSED"].includes(to) ? "Reason (required)" : "Note", type: "textarea" as const, required: ["ON_HOLD", "FAILED", "REVERSED"].includes(to) },
          ]}
          submitText={LABEL[to]}
          success={`Payout ${LABEL[to]!.toLowerCase()}`}
          danger={to === "FAILED" || to === "REVERSED"}
        />
      ))}
    </div>
  );
}
