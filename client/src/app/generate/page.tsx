import Link from "next/link";
import { ArrowLeft, PenLine } from "lucide-react";
import { PromptForm } from "@/components/PromptForm";
import { UserMenu } from "@/components/UserMenu";

// /generate — standalone generation page (linked from the hero CTA).
// Submitting routes to /watch/[jobId]?video=… where rendering is streamed.

export default function GeneratePage() {
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
        <UserMenu />
      </header>

      <main className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            Start a new video
          </h1>
          <p className="text-muted-foreground">
            Describe the topic — playback begins with Scene 1 while the rest
            still renders.
          </p>
        </div>
        <PromptForm />
      </main>
    </div>
  );
}
