import "server-only";
import type { NextRequest } from "next/server";
import { db, type Tx } from "@/db";
import { priceHistory } from "@/db/schema";
import { audit } from "@/lib/audit";
import { reqMeta } from "@/lib/api";
import type { CurrentUser } from "@/lib/auth/current";

/** Audit helper for admin mutations (captures ip + user agent). */
export async function logAudit(
  req: NextRequest,
  u: Pick<CurrentUser, "id">,
  action: string,
  entityType: string,
  entityId: string | null,
  before?: unknown,
  after?: unknown,
  tx?: Tx,
) {
  await audit({ actorId: u.id, action, entityType, entityId, before, after, ...reqMeta(req) }, tx);
}

const norm = (v: unknown) => (v === undefined || v === null || v === "" ? null : typeof v === "object" ? JSON.stringify(v) : String(v));

/** Insert one price_history row per changed field. Returns number of rows written. */
export async function recordPriceChanges(
  args: {
    entityType: string;
    entityId: string;
    before: Record<string, unknown> | null | undefined;
    after: Record<string, unknown>;
    fields: string[];
    changedBy: string;
    reason: string | null | undefined;
    effectiveFrom?: Date | null;
    effectiveTo?: Date | null;
    prefix?: string;
  },
  tx?: Tx,
) {
  const rows = args.fields
    .filter((f) => f in args.after && norm(args.before?.[f]) !== norm(args.after[f]))
    .map((f) => ({
      entityType: args.entityType,
      entityId: args.entityId,
      field: (args.prefix ?? "") + f,
      oldValue: norm(args.before?.[f]),
      newValue: norm(args.after[f]),
      changedBy: args.changedBy,
      reason: args.reason ?? null,
      effectiveFrom: args.effectiveFrom ?? new Date(),
      effectiveTo: args.effectiveTo ?? null,
    }));
  if (rows.length) await (tx ?? db).insert(priceHistory).values(rows);
  return rows.length;
}

/** Strip keys with undefined values (for partial updates). */
export function defined<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function isFkViolation(e: unknown) {
  const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return code === "23503";
}
export function isUniqueViolation(e: unknown) {
  const code = (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}
