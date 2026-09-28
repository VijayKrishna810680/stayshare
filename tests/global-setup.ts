import { execSync } from "child_process";

/** Migrate + seed a dedicated test database once per run. */
export default function setup() {
  if (process.env.SKIP_DB_SETUP === "1") return;
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://stayshare:stayshare@localhost:5432/stayshare_test";
  const env = { ...process.env, DATABASE_URL: url, NODE_ENV: "test" as const };
  execSync("npx tsx scripts/migrate.ts", { env, stdio: "inherit" });
  execSync("npx tsx --conditions=react-server scripts/seed.ts", { env, stdio: "ignore" });
}
