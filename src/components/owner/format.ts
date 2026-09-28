/** Formatting helpers usable from both server and client components. */
export function humanize(s: string | null | undefined) {
  if (!s) return "—";
  return s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export const GENDER_OPTIONS = [
  { value: "ANY", label: "Anyone" },
  { value: "MIXED", label: "Mixed (co-ed)" },
  { value: "MALE_ONLY", label: "Men only" },
  { value: "FEMALE_ONLY", label: "Women only" },
  { value: "FAMILY", label: "Families" },
] as const;

export const AUDIENCE_OPTIONS = [
  { value: "STUDENTS", label: "Students" },
  { value: "WORKING_PROFESSIONALS", label: "Working professionals" },
  { value: "TRAVELLERS", label: "Travellers" },
  { value: "FAMILIES", label: "Families" },
  { value: "BACKPACKERS", label: "Backpackers" },
  { value: "CORPORATE", label: "Corporate teams" },
] as const;

export const BED_TYPES = ["SINGLE", "BUNK_UPPER", "BUNK_LOWER", "DOUBLE", "QUEEN"] as const;
export const ROOM_CATEGORIES = ["PRIVATE", "SHARED", "FAMILY", "DORMITORY"] as const;
export const DOC_TYPES = [
  { value: "OWNERSHIP_PROOF", label: "Ownership / lease agreement" },
  { value: "TRADE_LICENSE", label: "Trade licence" },
  { value: "FIRE_NOC", label: "Fire NOC" },
  { value: "POLICE_NOC", label: "Police verification / NOC" },
  { value: "GST_CERTIFICATE", label: "GST certificate" },
  { value: "ELECTRICITY_BILL", label: "Electricity bill" },
  { value: "OTHER", label: "Other" },
] as const;
export const KYC_DOC_TYPES = [
  { value: "PAN", label: "PAN card" },
  { value: "AADHAAR", label: "Aadhaar" },
  { value: "GST_CERTIFICATE", label: "GST certificate" },
  { value: "BUSINESS_REGISTRATION", label: "Business registration" },
  { value: "CANCELLED_CHEQUE", label: "Cancelled cheque" },
  { value: "PASSPORT", label: "Passport" },
] as const;
export const ID_TYPES = [
  { value: "AADHAAR", label: "Aadhaar" },
  { value: "PASSPORT", label: "Passport" },
  { value: "DRIVING_LICENSE", label: "Driving licence" },
  { value: "VOTER_ID", label: "Voter ID" },
  { value: "PAN", label: "PAN card" },
] as const;

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}
