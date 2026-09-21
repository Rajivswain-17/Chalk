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
  })).min(6).max(12),
});

export async function generateVisualization(prompt: string): Promise<VisualStep[]> {
  const client = getOpenAIClient();
  const completion = await client.beta.chat.completions.parse({
    model: openAIModel,
    messages: [
      { role: "system", content: `You are Chalk, an elite visual explainer engine inspired by high-quality educational interactives (like dsa.chaicode.com).
Your goal is to break down concepts, algorithms, and biological/system mechanisms into 6 to 10 crystal-clear visual steps.
MANDATORY PEDAGOGICAL STRUCTURE:
1. STEP 1 (THE OVERVIEW / QUESTION SETUP):
   - Never jump immediately into execution.
   - Step 1 must introduce the concept, the initial state, the key players (e.g., pathogens, pointers, nodes), and what problem we are solving.
2. INTERMEDIATE STEPS (STEP-BY-STEP PROGRESSION):
   - Walk through the process with a single logical change per step.
   - Clearly set element states: 'active' for the main subject, 'compare' for interactions, 'found' for successes, and 'visited' for processed elements.
3. FINAL STEP (RESOLUTION & RECOVERY / RESULT):
   - Summarize the outcome, final time/space complexity, or biological immunity state.
EXPLANATION REQUIREMENTS:
- Each step's explanation must be 2 to 4 sentences long, warm, clear, and pedagogical.
- Do NOT just state what happened; explain *why* it happened and what it leads to next.
- Keep code/pseudocode clean, readable, and directly mapped to the activeLine index.
ADDITIONAL RULES:
- Use stageType 'array' for array/list topics (Two Sum, Binary Search, Sliding Window, Sorting) and 'tree' for hierarchical topics (DFS, BFS, Path Sum).
- For tree steps, list elements in heap order (index 0 root, children of i at 2i+1 and 2i+2).
- Each element needs a pointer name only when relevant (i, j, left, right, curr, low, high, target).` },
      { role: "user", content: prompt },
    ],
    response_format: zodResponseFormat(llmPlanSchema, "visual_plan"),
    temperature: 0.5,
  }, { timeout: 60_000 });
  const plan = completion.choices[0]?.message.parsed;
  const parsed = visualizeResponseSchema.safeParse(
    plan ? { steps: plan.steps.map((s, i) => ({ ...s, stepIndex: i })) } : { steps: [] },
  );
  if (!parsed.success) {
    console.error("VISUAL_INVALID", JSON.stringify(parsed.error.issues), `received ${plan?.steps.length ?? 0} steps`);
    throw Object.assign(new Error("VISUAL_INVALID"), { status: 502 });
  }
  return parsed.data.steps;
}
