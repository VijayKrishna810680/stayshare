import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { properties, staffAssignments, staffProfiles, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { PageHeader } from "@/components/ui";
import { StaffAccounts } from "@/components/owner/staff-accounts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staff accounts" };

export default async function StaffPage() {
  const u = await pageUser({ role: "OWNER" });
  const props = await db.select({ id: properties.id, name: properties.name }).from(properties).where(and(eq(properties.ownerId, u.id), isNull(properties.deletedAt))).orderBy(asc(properties.name));
  const staff = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, lastLoginAt: users.lastLoginAt, designation: staffProfiles.designation, active: staffProfiles.active }).from(staffProfiles).innerJoin(users, eq(users.id, staffProfiles.userId)).where(eq(staffProfiles.employerId, u.id)).orderBy(asc(users.name));
  const asg = staff.length && props.length ? await db.select().from(staffAssignments).where(and(inArray(staffAssignments.userId, staff.map((s) => s.id)), inArray(staffAssignments.propertyId, props.map((p) => p.id)))) : [];
  return (
    <>
      <PageHeader title="Staff accounts" description="Front-desk logins for your team. Staff can check guests in/out, manage housekeeping and maintenance — never your earnings or payouts." />
      <StaffAccounts properties={props} staff={staff.map((s) => ({ ...s, lastLoginAt: s.lastLoginAt?.toISOString() ?? null, propertyIds: asg.filter((a) => a.userId === s.id).map((a) => a.propertyId) }))} />
    </>
  );
}
