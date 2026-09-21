import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getOpenAIClient, openAIModel } from "../lib/openai";
import { visualizeResponseSchema, type VisualStep } from "../validators/visualize";

const llmPlanSchema = z.object({
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
    variables: z.record(z.union([z.string(), z.number(), z.null()])),
    explanation: z.string(),
  })).min(6).max(12),
});

export async function generateVisualization(prompt: string): Promise<VisualStep[]> {
  const client = getOpenAIClient();
  const completion = await client.beta.chat.completions.parse({
    model: openAIModel,
    messages: [
      { role: "system", content: "You are a DSA visual educator. Return 6-12 progressive steps. Use stageType 'array' for Two Sum/Binary Search/Sliding Window/Sorting and 'tree' for DFS/BFS/Path Sum. Each step: title, 5-10 codeLines with valid 0-based activeLine, 1-2 sentence explanation, state-colored elements with pointer names like i/j/left/right/curr. For tree steps, list elements in heap order (index 0 root, children of i at 2i+1 and 2i+2)." },
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
