import { PenLine, Play, Radio, Sparkles } from "lucide-react";
import { PromptForm } from "@/components/PromptForm";

// Home — hero + generation form + how-it-works. Server component; all
// interactivity lives in PromptForm ("use client").

const HOW_IT_WORKS = [
  {
    Icon: Sparkles,
    title: "Describe anything",
    body: "One prompt becomes a 3–5 scene plan, voiceover script, and hand-drawn layout — no timeline editing.",
  },
  {
    Icon: Radio,
    title: "Watch it draw live",
    body: "Scenes stream over HLS the moment each finishes. Playback starts in seconds while the rest still renders.",
  },
  {
    Icon: Play,
    title: "Share anywhere",
    body: "Widescreen for YouTube, vertical for Shorts and Reels — sealed HLS playlist when the last scene lands.",
  },
] as const;

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-10">
      <header className="mb-8 flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
          <PenLine className="size-5" />
        </span>
        <span className="text-xl font-semibold tracking-tight">Chalk</span>
        <span className="ml-auto text-xs text-muted-foreground">
          AI whiteboard explainer videos
        </span>
      </header>

      <main className="space-y-10">
        <div className="space-y-3 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-balance">
            Explain anything, watch it draw itself
          </h1>
          <p className="mx-auto max-w-xl text-muted-foreground">
            Type a topic. Chalk writes the script, narrates it, sketches each
            scene by hand — and streams the video live as it renders.
          </p>
        </div>

        <PromptForm />

        <section className="grid gap-4 sm:grid-cols-3">
          {HOW_IT_WORKS.map(({ Icon, title, body }) => (
            <div key={title} className="rounded-lg border p-4">
              <Icon className="mb-2 size-5 text-primary" />
              <h2 className="mb-1 text-sm font-medium">{title}</h2>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="mt-auto pt-10 text-center text-xs text-muted-foreground">
        Renders stream progressively — playback begins with Scene 1, no waiting
        for the full video.
      </footer>
    </div>
  );
}
