import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { identityDocuments, ownerProfiles } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { EmptyState, PageHeader } from "@/components/ui";
import { KycForm } from "@/components/owner/kyc-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Documents & KYC" };

export default async function KycPage() {
  const u = await pageUser({ role: "OWNER" });
  const [op] = await db.select().from(ownerProfiles).where(eq(ownerProfiles.userId, u.id));
  if (!op) return <EmptyState title="Partner profile missing" description="Contact StayShare support." />;
  const docs = await db.select().from(identityDocuments).where(and(eq(identityDocuments.userId, u.id), isNull(identityDocuments.deletedAt))).orderBy(desc(identityDocuments.createdAt));
  return (
    <>
      <PageHeader title="Documents & KYC" description="Business verification for payouts and listing approval. Property documents are managed on each property." />
      <KycForm
        state={{ businessName: op.businessName, businessType: op.businessType, gstin: op.gstin, panLast4: op.panLast4, address: op.address, kycStatus: op.kycStatus, kycNotes: op.kycNotes }}
        docs={docs.map((d) => ({ id: d.id, docType: d.docType, numberLast4: d.numberLast4, fileId: d.fileId, status: d.status, createdAt: d.createdAt.toISOString() }))}
      />
    </>
  );
}
