/** Role & permission catalogue. Roles map to permission keys; admins can create custom roles. */
export const ROLE = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  OWNER: "OWNER",
  STAFF: "STAFF",
  CUSTOMER: "CUSTOMER",
} as const;
export type RoleKey = (typeof ROLE)[keyof typeof ROLE] | (string & {});

export const PERMISSIONS = {
  // admin portal
  "admin.access": "Access the administrator portal",
  "users.view": "View customers, owners and staff",
  "users.manage": "Suspend / reactivate users",
  "admins.manage": "Create administrators and manage roles & permissions",
  "properties.view": "View all properties",
  "properties.approve": "Approve / reject properties, rooms, images and facilities",
  "properties.manage": "Edit or block any property",
  "kyc.approve": "Approve owner KYC and bank details",
  "pricing.manage": "Set final prices, duration prices and pricing rules",
  "taxes.manage": "Configure taxes",
  "commissions.manage": "Configure platform commission",
  "coupons.manage": "Manage coupons and promotions",
  "policies.manage": "Manage cancellation / refund policies",
  "bookings.view": "View all bookings",
  "bookings.manage": "Cancel / modify any booking",
  "payments.view": "View payments and transactions",
  "refunds.approve": "Approve and process refunds",
  "payouts.manage": "Approve, hold and process owner payouts",
  "reviews.moderate": "Moderate reviews",
  "support.manage": "Manage support tickets",
  "content.manage": "Manage cities, banners, FAQs, pages, templates, catalogue",
  "reports.view": "View and export reports",
  "reports.financial": "View sensitive financial reports",
  "audit.view": "View audit logs",
  "settings.manage": "Change application settings (OTP step-up required)",
  "livechat.manage": "Answer customer live chats",
  "integrations.manage": "Manage payment gateway & integrations",
  // owner portal
  "owner.access": "Access the property-partner portal",
  // staff portal
  "staff.access": "Access the property-staff portal",
  "checkin.manage": "Check guests in and out",
} as const;
export type PermissionKey = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as PermissionKey[];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  SUPER_ADMIN: ALL,
  ADMIN: ALL.filter((p) => !["admins.manage", "integrations.manage", "reports.financial", "owner.access", "staff.access"].includes(p)),
  OWNER: ["owner.access", "staff.access", "checkin.manage"],
  STAFF: ["staff.access", "checkin.manage"],
  CUSTOMER: [],
};

export function isAdminRole(roles: string[]) {
  return roles.includes(ROLE.SUPER_ADMIN) || roles.includes(ROLE.ADMIN);
}
