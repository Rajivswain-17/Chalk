import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import path from "path";

// Drizzle Kit runs outside the application bootstrap. Load the server-local
// file first and the repository-root file second so host and Docker workflows
// resolve the same DATABASE_URL without relying on the caller's shell state.
config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), "../.env") });

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://chalk:chalk@localhost:5432/chalk";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/repository/schema",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl },
  verbose: true,
  strict: true,
});
