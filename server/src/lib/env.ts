import { config } from "dotenv";
import path from "path";
import { z } from "zod";

// Local npm commands run from Chalk/server while Docker Compose injects
// Chalk/.env directly. Loading both locations keeps both workflows consistent;
// existing process variables always win because `override` remains false.
config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), "../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://chalk:chalk@localhost:5432/chalk"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o"),
  ELEVENLABS_API_KEY: z.string().default(""),
  ELEVENLABS_VOICE_ID: z.string().min(1).default("21m00Tcm4TlvDq8ikWAM"),
  OUTPUT_DIR: z.string().min(1).default(path.resolve(process.cwd(), "output")),
  ICON_CACHE_DIR: z.string().min(1).default(path.resolve(process.cwd(), "cache/icons")),
  CHROMIUM_PATH: z.string().optional(),
  REMOTION_BUNDLE_PATH: z.string().optional(),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  // --- Auth (JWT cookies + OAuth) -------------------------------------------
  // JWT_SECRET signs 15-min access tokens. The default is dev-only: session.ts
  // refuses to boot production with it (fail-closed, no silent weak keys).
  JWT_SECRET: z.string().min(1).default("dev-only-jwt-secret-change-me"),
  // Public base URLs. APP_URL builds OAuth redirect_uris; CLIENT_URL is where
  // the OAuth callback lands after setting cookies (must be CORS-allowed).
  APP_URL: z.string().url().default("http://localhost:3001"),
  CLIENT_URL: z.string().url().default("http://localhost:3000"),
  // OAuth apps. Empty = provider disabled (GET /api/auth/providers reports it
  // so the UI hides that button instead of linking to a dead flow).
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GITHUB_CLIENT_ID: z.string().default(""),
  GITHUB_CLIENT_SECRET: z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

/** Validated process configuration shared by the API and worker. */
export const env = parsed.data;

/** Reject placeholder or missing provider keys only when a paid API is called. */
export function requireSecret(name: "OPENAI_API_KEY" | "ELEVENLABS_API_KEY"): string {
  const value = env[name].trim();
  if (!value || value.startsWith("your_")) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}
