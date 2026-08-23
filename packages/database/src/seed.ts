import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { pool, closeDatabase } from "./index.js";

const seedsDir = fileURLToPath(
  new URL("../../../infra/seeds/", import.meta.url)
);

async function seed(): Promise<void> {
  const files = (await readdir(seedsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const filename of files) {
    const sql = await readFile(resolve(seedsDir, filename), "utf8");
    await pool.query(sql);
    console.log(`Applied seed: ${filename}`);
  }
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
