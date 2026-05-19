/**
 * Cross-platform db:reset — deletes greenroom.db, pushes schema, re-seeds.
 * Used by `npm run db:reset` on Windows where `rm -f` is unavailable.
 */
import { unlinkSync, existsSync } from "fs";
import { execSync } from "child_process";

const dbPath = "data/greenroom.db";
if (existsSync(dbPath)) {
  try {
    unlinkSync(dbPath);
    console.log(`Removed ${dbPath}`);
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? err.code : "";
    if (code === "EBUSY") {
      console.error(
        "Could not delete greenroom.db — stop `npm run dev` (and Drizzle Studio) first, then retry.",
      );
      process.exit(1);
    }
    throw err;
  }
}

execSync("npx drizzle-kit push", { stdio: "inherit" });
execSync("npx tsx db/seed.ts", { stdio: "inherit" });
