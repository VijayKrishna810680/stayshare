import "server-only";
import { db } from "@/db";
import { pageUser } from "@/lib/auth/page";
import { PageHeader } from "@/components/ui";
import { ResourceManager } from "@/components/admin/resource-manager";
import type { Opt } from "@/components/admin/resource-config";
import { RESOURCES } from "@/app/api/admin/_lib/resources";

export async function loadRows(resource: string) {
  const r = RESOURCES[resource]!;
  return (await db
    .select()
    .from(r.table)
    .orderBy(...r.orderBy(r.table as unknown as Record<string, unknown>))
    .limit(2000)) as (Record<string, unknown> & { id: string })[];
}

/** Standard "list + CRUD" admin page for a registry resource. */
export async function ResourcePage({ resource, title, description, options = {}, before, after }: { resource: string; title: string; description?: string; options?: Record<string, Opt[]>; before?: React.ReactNode; after?: React.ReactNode }) {
  const r = RESOURCES[resource]!;
  await pageUser({ perm: r.perm });
  const rows = await loadRows(resource);
  return (
    <>
      <PageHeader title={title} description={description} />
      {before}
      <ResourceManager resource={resource} rows={rows} options={options} title={title} />
      {after}
    </>
  );
}
