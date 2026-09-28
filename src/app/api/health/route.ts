import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ status: "ok", db: "ok", uptimeSec: Math.round(process.uptime()), latencyMs: Date.now() - started, version: process.env.APP_VERSION ?? "dev" });
  } catch (e) {
    return NextResponse.json({ status: "degraded", db: "down", error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
