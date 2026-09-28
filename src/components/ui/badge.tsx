import { cn } from "@/lib/cn";

type Tone = "slate" | "brand" | "green" | "amber" | "red" | "blue" | "purple";
const tones: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  purple: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function Badge({ tone = "slate", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tones[tone], className)}>{children}</span>;
}

const STATUS_TONES: Record<string, Tone> = {
  APPROVED: "green", SENT: "green", ACTIVE: "green", CONFIRMED: "green", CAPTURED: "green", COMPLETED: "green", PAID: "green", PUBLISHED: "green", RESOLVED: "green", CLEAN: "green", AVAILABLE: "green", ELIGIBLE: "green", CHECKED_IN: "blue",
  PENDING: "amber", PAYMENT_PENDING: "amber", INVENTORY_LOCKED: "amber", DRAFT: "slate", CHECK_IN_PENDING: "amber", REQUESTED: "amber", PROCESSING: "blue", AUTHORIZED: "blue", IN_PROGRESS: "blue", ASSIGNED: "blue", OPEN: "amber", ON_HOLD: "purple", REFUND_PENDING: "amber", CANCELLATION_REQUESTED: "amber", AWAITING_PAYMENT: "amber", CREATED: "slate", NEEDS_CLEANING: "amber", CLEANING: "amber", RESERVED: "blue", OCCUPIED: "blue", IN_PAYOUT: "blue", WAITING_FOR_CUSTOMER: "purple", WAITING_FOR_PROPERTY: "purple", CHANGES_REQUESTED: "purple", CHECKED_OUT: "slate",
  REJECTED: "red", FAILED: "red", CANCELLED: "red", SUSPENDED: "red", NO_SHOW: "red", BLOCKED: "red", HIDDEN: "red", REVERSED: "red", URGENT: "red", HIGH: "amber",
  REFUNDED: "purple", PARTIALLY_REFUNDED: "purple", CLOSED: "slate", NOT_SUBMITTED: "slate", UNDER_MAINTENANCE: "red", OK: "green", APPLIED: "green", LOW: "slate", MEDIUM: "blue",
};

export function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  if (!status) return null;
  return (
    <Badge tone={STATUS_TONES[status] ?? "slate"} className={className}>
      {status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
    </Badge>
  );
}
