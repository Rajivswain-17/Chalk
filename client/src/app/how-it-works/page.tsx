import Link from "next/link";
import { ArrowLeft, PenLine } from "lucide-react";

// /how-it-works — standalone pipeline explainer (linked from the hero CTA).
// Mirrors the backend's actual stages: plan → script → voice → design →
// icons → render → package → stream.

const STAGES = [
  {
    title: "1. Plan",
    body: "The planner agent breaks your prompt into 3–5 ordered scenes with titles and duration budgets.",
  },
  {
    title: "2. Script",
    body: "Each scene's narration is rewritten for the ear — short spoken sentences, no jargon walls.",
  },
  {
    title: "3. Voice",
    body: "ElevenLabs synthesizes broadcast-grade narration and returns word-level millisecond timings.",
  },
  {
    title: "4. Design",
    body: "The designer agent lays out text, shapes, arrows, and icon keywords on a 1920×1080 canvas, synced to the spoken words.",
  },
  {
    title: "5. Icons",
    body: "Keywords resolve from local Lucide SVGs first; niche concepts fall back to the cached Iconify library.",
  },
  {
    title: "6. Render",
    body: "Remotion + Rough.js draw every stroke progressively at 30 fps — the invisible-hand effect, no fake hand PNG.",
  },
  {
    title: "7. Stream",
    body: "FFmpeg packages each finished scene into HLS segments. Your player starts at Scene 1 within seconds via live progress events.",
  },
] as const;

export default function HowItWorksPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6">
      <header className="mb-8 flex items-center gap-2">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <PenLine className="size-5" />
          </span>
          <span className="text-xl font-semibold tracking-tight">Chalk</span>
        </Link>
        <Link
          href="/"
          className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Home
        </Link>
      </header>

      <main className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">How it works</h1>
          <p className="text-muted-foreground">
            Seven stages, one prompt — streaming live from the first scene.
          </p>
        </div>
        <ol className="space-y-3">
          {STAGES.map(({ title, body }) => (
            <li key={title} className="rounded-lg border bg-card p-4">
              <h2 className="mb-1 text-sm font-medium">{title}</h2>
              <p className="text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
        <Link
          href="/generate"
          className="inline-flex h-11 items-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Try it — generate a video
        </Link>
      </main>
    </div>
  );
}
