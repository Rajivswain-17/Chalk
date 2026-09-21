import Link from "next/link";
import { ArrowLeft, PenLine, Sparkles, Layers, Video, Radio, Cpu, Eye } from "lucide-react";
import { UserMenu } from "@/components/UserMenu";

// /how-it-works  pipeline explainer for the Zero-Voice Visual State Machine.
// Mirrors the actual stages: plan -> 5-zone stage layout -> render -> package -> stream.

const STAGES = [
  {
    icon: Sparkles,
    title: "1. Visual State Planning",
    body: "OpenAI Structured Outputs (GPT-4o) decomposes any DSA algorithm, LeetCode problem, or real-world concept into 3 to 6 progressive visual steps with stage elements, logic rules, dynamic state variables, and timed captions.",
  },
  {
    icon: Layers,
    title: "2. 5-Zone Stage Layout",
    body: "Each scene is structured into a 5-zone visual canvas: Header (Concept Title & Step Dots), Center Stage (Array Boxes, Comparison Cards, or Flow Nodes with animated pointers like left ▲ and right ▲), Monospace Logic Rules Panel, Dynamic State Box, and Bottom Caption Pill.",
  },
  {
    icon: Video,
    title: "3. 30 FPS Dynamic Rendering",
    body: "Remotion renders the step-by-step visual transitions at 30 fps. Active logic rules glow in amber with ▶ indicators, stage elements pulse with highlight borders, and state variables update in real time.",
  },
  {
    icon: Cpu,
    title: "4. Zero-Voice Universal Audio Packaging",
    body: "Zero voiceover required. FFmpeg packages the rendered visuals into HLS segments and multiplexes a clean, silent AAC audio track to ensure 100% native playback across all desktop browsers, Android, and iOS Safari.",
  },
  {
    icon: Radio,
    title: "5. Live In-Line HLS Streaming",
    body: "Playback begins the moment Step 1 is packaged. Through Server-Sent Events (SSE), the client VideoPlayer embeds directly inside your chat thread and streams live while subsequent steps continue rendering in the background.",
  },
] as const;

export default function HowItWorksPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 text-zinc-100">
      <header className="mb-8 flex items-center justify-between border-b border-zinc-800/80 pb-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 text-zinc-950 font-bold shadow-md shadow-amber-500/20">
            <PenLine className="size-5" />
          </span>
          <div>
            <span className="text-lg font-semibold tracking-tight">Chalk</span>
            <span className="ml-2 text-[10px] font-medium tracking-wider uppercase bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">Visual 2.0</span>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200"
          >
            <ArrowLeft className="size-3.5" /> Workspace
          </Link>
          <UserMenu />
        </div>
      </header>

      <main className="space-y-8">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium">
            <Eye className="size-3.5" /> Zero Voiceover • Pure Visual Clarity
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100">
            How Chalk Visual Works
          </h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Chalk turns complex DSA logic, LeetCode solutions, and system concepts into animated, self-explanatory visual state machines.
          </p>
        </div>

        <div className="space-y-4">
          {STAGES.map((stage) => {
            const Icon = stage.icon;
            return (
              <div
                key={stage.title}
                className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/60 hover:bg-zinc-900 transition-colors space-y-2"
              >
                <div className="flex items-center gap-2.5">
                  <div className="size-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                    <Icon className="size-4" />
                  </div>
                  <h2 className="font-semibold text-base text-zinc-100">{stage.title}</h2>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed pl-9.5">
                  {stage.body}
                </p>
              </div>
            );
          })}
        </div>

        <div className="pt-4 flex justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 text-zinc-950 font-semibold text-sm hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20"
          >
            Open Visual Workspace
          </Link>
        </div>
      </main>
    </div>
  );
}
