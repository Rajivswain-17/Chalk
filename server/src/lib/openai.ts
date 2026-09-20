import OpenAI from "openai";
import { env, requireSecret } from "./env";

let client: OpenAI | undefined;

/** Lazily initialize OpenAI so the backend can boot before keys are configured. */
export function getOpenAIClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: requireSecret("OPENAI_API_KEY") });
  return client;
}

export const openAIModel = env.OPENAI_MODEL;
