/** Client-safe display labels for customer-facing pages. */
export const CATEGORY_LABEL: Record<string, string> = {
  PRIVATE: "Private room",
  SHARED: "Shared room",
  FAMILY: "Family room",
  DORMITORY: "Dormitory",
};

export const GENDER_LABEL: Record<string, string> = {
  MALE_ONLY: "Men only",
  FEMALE_ONLY: "Women only",
  MIXED: "Co-ed (mixed)",
  FAMILY: "Families",
  ANY: "Open to all",
};

export const AUDIENCE_LABEL: Record<string, string> = {
  STUDENTS: "Students",
  WORKING_PROFESSIONALS: "Working professionals",
  FAMILIES: "Families",
  TRAVELLERS: "Travellers",
};

export const DOC_TYPES: { value: string; label: string }[] = [
  { value: "AADHAAR", label: "Aadhaar card" },
  { value: "PASSPORT", label: "Passport" },
  { value: "DRIVING_LICENSE", label: "Driving licence" },
  { value: "VOTER_ID", label: "Voter ID" },
  { value: "PAN", label: "PAN card" },
];

export const TICKET_CATEGORIES: { value: string; label: string }[] = [
  { value: "BOOKING", label: "Booking" },
  { value: "PAYMENT", label: "Payment" },
  { value: "REFUND", label: "Refund" },
  { value: "CHECK_IN", label: "Check-in" },
  { value: "PROPERTY_ISSUE", label: "Property issue" },
  { value: "ROOM_ISSUE", label: "Room issue" },
  { value: "SAFETY", label: "Safety" },
  { value: "TECHNICAL", label: "App / website" },
  { value: "OTHER", label: "Something else" },
];

export const MOD_LABEL: Record<string, string> = {
  EXTEND_STAY: "Extend stay",
  EARLY_CHECK_IN: "Early check-in",
  LATE_CHECK_OUT: "Late check-out",
  ROOM_CHANGE: "Change room",
  BED_CHANGE: "Change bed",
  UPGRADE_AC: "Upgrade to AC",
  UPGRADE_PRIVATE: "Upgrade to private",
  ADD_GUEST: "Add a guest",
  REMOVE_GUEST: "Remove a guest",
};

export const REVIEW_CATEGORIES: { key: string; label: string; optional?: boolean }[] = [
  { key: "cleanliness", label: "Cleanliness" },
  { key: "location", label: "Location" },
  { key: "staff", label: "Staff" },
  { key: "facilities", label: "Facilities" },
  { key: "valueForMoney", label: "Value for money" },
  { key: "foodQuality", label: "Food quality", optional: true },
  { key: "safety", label: "Safety" },
];

export function humanize(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Booking tab buckets used by the customer dashboard. */
export const BOOKING_BUCKETS = {
  upcoming: ["DRAFT", "INVENTORY_LOCKED", "PAYMENT_PENDING", "CONFIRMED", "CHECK_IN_PENDING"],
  current: ["CHECKED_IN"],
  past: ["CHECKED_OUT", "COMPLETED", "NO_SHOW"],
  cancelled: ["CANCELLATION_REQUESTED", "CANCELLED", "REFUND_PENDING", "PARTIALLY_REFUNDED", "REFUNDED", "REJECTED"],
} as const;
export type BookingBucket = keyof typeof BOOKING_BUCKETS;
