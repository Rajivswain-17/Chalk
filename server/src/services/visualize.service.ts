import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getOpenAIClient, openAIModel } from "../lib/openai";
import { visualizeResponseSchema, visualVariableSchema, type VisualStep } from "../validators/visualize";

export const llmPlanSchema = z.object({
  steps: z.array(z.object({
    title: z.string(), subtitle: z.string().optional(),
    stageType: z.enum(["array", "tree"]),
    elements: z.array(z.object({
      id: z.string(), value: z.string(), indexLabel: z.string().optional(),
      state: z.enum(["default", "active", "compare", "found", "visited", "path"]),
      pointer: z.string().nullable().optional(),
    })).min(1).max(12),
    codeLines: z.array(z.string()).min(3).max(12),
    activeLine: z.number().int().min(0),
    variables: z.array(visualVariableSchema).max(8),
    explanation: z.string(),
    calculation: z.string(),
  })).min(6).max(12),
});

export async function generateVisualization(prompt: string): Promise<VisualStep[]> {
  const client = getOpenAIClient();
  const completion = await client.beta.chat.completions.parse({
    model: openAIModel,
    messages: [
      { role: "system", content: `You are Chalk, an elite visual explainer engine inspired by high-quality educational interactives (like dsa.chaicode.com).
Your goal is to break down concepts, algorithms, and biological/system mechanisms into 6 to 10 crystal-clear visual steps.
MANDATORY 3-PHASE PEDAGOGICAL FLOW:
PHASE 1 - THE QUESTION BREAKDOWN (STEP 1):
   - Explain the problem statement in plain English: the rules, the inputs, and the real-world intuition behind it.
   - 'title' MUST be "Problem Breakdown: <Topic Name>" (e.g. "Problem Breakdown: Koko Eating Bananas").
   - 'subtitle' MUST be the short real goal (e.g. "Find minimum eating speed k").
   - 'explanation' MUST define what each input means and state the core constraint (the bound, the target value, or the success condition).
   - 'elements' MUST show the ORIGINAL input, in its given order.
   - Set 'calculation' to a compact restatement of the constraint (e.g. "piles = [3,6,7,11], h = 8 hours").
PHASE 2 - CONCRETE EXAMPLES WITH MATH (STEP 2):
   - 'title' MUST be "Examples & Mathematical Intuition".
   - Present 2 distinct worked examples, one after the other, each with the arithmetic shown step by step.
   - Set 'calculation' to the fully expanded arithmetic of the second example.
PHASE 3 - VISUAL ALGORITHM EXECUTION (STEPS 3 TO N):
   - Carry out the visual simulation (binary search, two pointers, sliding window, DFS/BFS, ...), one logical change per step.
   - Whenever a step performs a comparison or any arithmetic, set 'calculation' to the fully expanded live equation with its verdict in parentheses at the end:
     "hours = ceil(3/4) + ceil(6/4) + ceil(7/4) + ceil(11/4) = 1 + 2 + 2 + 3 = 8 <= 8 (valid)" or
     "nums[i] + nums[j] + nums[left] + nums[right] = -2 + (-1) + 1 + 2 = 0 == target (match found)" or
     "nums[mid] = 7 > target = 5 (too large, move right)".
   - The verdict in parentheses MUST start with one of: valid, invalid, match found, too small, too large, move left, move right.
   - Explain causal actions, not just observations: "Because total hours (8) <= h (8), speed 4 works, so we search for a smaller valid speed."
   - Clearly set element states: 'active' for the main subject, 'compare' for interactions, 'found' for successes, and 'visited' for processed elements.
FINAL STEP (STEP N):
   - Summarize the answer, the time complexity (e.g. O(N * log(max(piles)))), and the optimal takeaway.
EXPLANATION REQUIREMENTS:
- Each step's explanation must be 2 to 4 sentences long (stay under 600 characters), warm, clear, and pedagogical.
- Do NOT just state what happened; explain *why* it happened and what it leads to next.
- Keep code/pseudocode clean, readable, and directly mapped to the activeLine index.
ADDITIONAL RULES:
- Use stageType 'array' for array/list topics (Two Sum, Binary Search, Sliding Window, Sorting) and 'tree' for hierarchical topics (DFS, BFS, Path Sum).
- For tree steps, list elements in heap order (index 0 root, children of i at 2i+1 and 2i+2).
- Each element needs a pointer name only when relevant (i, j, left, right, curr, low, high, target).
- Use "" for 'calculation' only on steps with no arithmetic or comparison at all.` },
      { role: "user", content: prompt },
    ],
    response_format: zodResponseFormat(llmPlanSchema, "visual_plan"),
    temperature: 0.5,
  }, { timeout: 60_000 });
  const plan = completion.choices[0]?.message.parsed;
  // `calculation` is required by the strict LLM schema; drop the empty-string
  // placeholder so narrative steps render no Live Math badge.
  const parsed = visualizeResponseSchema.safeParse(
    plan
      ? {
          steps: plan.steps.map((s, i) => ({
            ...s,
            stepIndex: i,
            calculation: s.calculation.trim() ? s.calculation : undefined,
          })),
        }
      : { steps: [] },
  );
  if (!parsed.success) {
    console.error("VISUAL_INVALID", JSON.stringify(parsed.error.issues), `received ${plan?.steps.length ?? 0} steps`);
    throw Object.assign(new Error("VISUAL_INVALID"), { status: 502 });
  }
  return parsed.data.steps;
}
