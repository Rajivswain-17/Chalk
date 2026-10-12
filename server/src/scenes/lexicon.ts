// Algorithm-side routing vocabulary (spec §6.1 tier 1).
//
// PROVENANCE: the first block exists because all four shipped sidebar presets
// (client/src/components/ChatWorkspace.tsx FEATURED_PROMPTS) MUST resolve here —
// a preset that fell through to the LLM router would silently add a call to
// every canned click. The rest is the "small algorithm lexicon" the spec calls
// for, chosen from the topics the algorithm system prompt already names.
// Words are matched on word boundaries, case-insensitively; keep entries
// single-token so the match cannot fire inside an unrelated word.

/** Must cover every FEATURED_PROMPTS string. routes:check enforces this. */
export const PRESET_TERMS: readonly string[] = [
  // LeetCode 112: Path Sum
  "leetcode", "path sum", "binary tree", "depth-first", "depth first",
  // Two Sum: Two-Pointer Technique
  "two sum", "two-pointer", "two pointer", "sorted array",
  // How Credit Scores Work
  "credit score", "payment history", "credit utilization",
  // TCP 3-Way Handshake
  "tcp", "handshake", "syn-ack", "syn ack", "packet",
];

export const ALGORITHM_TERMS: readonly string[] = [
  ...PRESET_TERMS,
  "algorithm", "algorithms", "leetcode", "dsa", "array", "arrays",
  "binary search", "sliding window", "two pointers", "sorting", "sort",
  "hash map", "hashmap", "stack", "queue", "linked list", "recursion",
  "graph", "dfs", "bfs", "dynamic programming", "backtracking", "greedy",
  "complexity", "pseudocode", "big o", "data structure",
];
