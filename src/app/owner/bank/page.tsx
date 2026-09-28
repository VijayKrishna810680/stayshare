import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ownerProfiles } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { EmptyState, PageHeader } from "@/components/ui";
import { BankForm } from "@/components/owner/kyc-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bank & UPI" };

export default async function BankPage() {
  const u = await pageUser({ role: "OWNER" });
  const [op] = await db.select().from(ownerProfiles).where(eq(ownerProfiles.userId, u.id));
  if (!op) return <EmptyState title="Partner profile missing" description="Contact StayShare support." />;
  return (
    <>
      <PageHeader title="Bank & UPI details" description="Where StayShare sends your payouts. Account numbers are encrypted and always shown masked." />
      <BankForm state={{ bankAccountName: op.bankAccountName, bankAccountLast4: op.bankAccountLast4, bankIfsc: op.bankIfsc, bankName: op.bankName, upiId: op.upiId, bankVerified: op.bankVerified }} />
    </>
  );
}
