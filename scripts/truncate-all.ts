import { Pool } from "pg";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE '_prisma_%'"
    );
    const tables = rows.map((r: { tablename: string }) => `"${r.tablename}"`);
    if (tables.length) {
      await client.query(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
      console.log(`✓ Truncated ${tables.length} tables`);
    } else {
      console.log("No tables to truncate");
    }
  } finally {
    client.release();
    await pool.end();
  }
})();
