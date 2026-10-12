// server/src/scenes/tools/prompt-fixtures.ts
// The four shipped sidebar prompts, copied verbatim from
// client/src/components/ChatWorkspace.tsx (FEATURED_PROMPTS). Presets must
// resolve in tier 1 (no LLM call), so this file is the contract's other side.
// If you change a preset there, change it here or routes:check fails loudly.
export const FEATURED_PROMPTS: readonly string[] = [
  "Explain LeetCode 112 Path Sum with binary tree depth-first search step-by-step target subtraction.",
  "Explain Two Sum algorithm using two pointers on a sorted array with left and right pointers moving inward.",
  "Explain how credit scores are calculated: payment history (35%), credit utilization (30%), length of history, and impact of high debt.",
  "Explain TCP 3-Way Handshake step-by-step with SYN, SYN-ACK, and ACK packet state transitions between client and server.",
];
