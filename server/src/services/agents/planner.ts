import { zodResponseFormat } from "openai/helpers/zod";
import type { AspectRatio, VisualStateStep } from "../../types";
import { visualExplainerPlanSchema } from "../../validators";
import { getOpenAIClient, openAIModel } from "../../lib/openai";

/**
 * Universal Step-by-Step Visual Explainer Planner.
 * Generates an ordered state-machine progression of visual steps (Chai Visual style)
 * for ANY topic with ZERO voiceover.
 */
export async function planVisualSteps(
  prompt: string,
  aspectRatio: AspectRatio,
): Promise<VisualStateStep[]> {
  try {
    const completion = await getOpenAIClient().beta.chat.completions.parse({
      model: openAIModel,
      messages: [
        {
          role: "system",
          content: [
            "You are an expert visual educator who transforms any concept into a step-by-step visual state machine animation (similar to Chai Visual / DSA Visual / 3Blue1Brown).",
            "There is NO voiceover or narration. The entire explanation must be 100% visual, clear, and intuitive.",
            "Generate 3 to 6 progressive, sequential steps.",
            "For each step:",
            "1. conceptTitle: Main clear title (e.g., 'Two Pointers Intro', 'The Three-Digit Scale', 'Light Reaction').",
            "2. subtitle: Short 2-4 word category or subtopic.",
            "3. stageType: One of 'array_boxes' (horizontal array/list items), 'comparison_cards' (side-by-side cards e.g. Fair vs Good), 'stat_scale' (metrics/ranges), or 'flow_nodes' (connected concept blocks).",
            "4. stageElements: 2 to 7 visual items on the central stage with clear labels and values. Indicate which item is 'highlight: true' for this step, and optional pointers ('left', 'right', 'current', 'target').",
            "5. logicRules: 2 to 5 numbered code lines, formulas, or rules for the right panel. Set activeLine to the 1-based index currently being executed/highlighted.",
            "6. stateVariables: 1 to 4 key variables/metrics to display in the live state box (e.g. left=1, right=6, Score=720, O2=Produced).",
            "7. caption: Exactly 1 to 2 crisp, high-impact plain-English sentences explaining the exact action of this step (displayed in the bottom callout pill).",
            "8. durationSeconds: 4 to 6 seconds per step.",
            `Target canvas aspect ratio is ${aspectRatio}.`,
          ].join(" "),
        },
        { role: "user", content: prompt },
      ],
      response_format: zodResponseFormat(
        visualExplainerPlanSchema,
        "chalk_visual_plan",
      ),
      temperature: 0.6,
    });

    const plan = completion.choices[0]?.message.parsed;
    if (!plan || !plan.steps || plan.steps.length === 0) {
      throw new Error("OpenAI returned no parsed visual steps");
    }

    const totalSteps = plan.steps.length;
    return plan.steps.map((step, stepIndex) => ({
      ...step,
      stepIndex,
      totalSteps,
    }));
  } catch (error) {
    throw new Error(
      `planner: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
