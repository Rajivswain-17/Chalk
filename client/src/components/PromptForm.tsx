"use client";

// PromptForm — generation entry: prompt + optional title + aspect toggle.
// Creates the chat session LOCALLY (same shape as ChatWorkspace) in the
// shared localStorage history, then routes to the chat workspace root (/)
// where ActiveChatView fetches POST /api/visualize. Surfaces validation
// inline instead of a dead spinner.

import { useRouter } from "next/navigation";
import { Monitor, Smartphone } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { AspectRatio } from "@/lib/api";
import { cn } from "@/lib/utils";

const MIN_PROMPT = 10;
const MAX_PROMPT = 1000;

export function PromptForm() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const length = prompt.trim().length;
  const valid = length >= MIN_PROMPT && length <= MAX_PROMPT;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || pending) return;
    setPending(true);
    setError(null);
    try {
      const trimmed = prompt.trim();
      const id = crypto.randomUUID();
      const session = {
        id,
        prompt: trimmed,
        title:
          title.trim() ||
          (trimmed.length > 40 ? trimmed.slice(0, 38) + "..." : trimmed),
        aspectRatio,
        jobId: id,
        videoId: "",
        createdAt: Date.now(),
      };
      try {
        const raw = localStorage.getItem("chalk_recent_chats_v2");
        const stored = raw ? JSON.parse(raw) : [];
        localStorage.setItem(
          "chalk_recent_chats_v2",
          JSON.stringify([session, ...(Array.isArray(stored) ? stored : [])].slice(0, 30)),
        );
      } catch {
        // Ignore storage errors; the workspace still opens fresh.
      }
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPending(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="prompt" className="text-sm font-medium">
              What should Chalk explain?
            </label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Explain how the immune system fights viruses…"
              rows={4}
              maxLength={MAX_PROMPT + 100} // Soft cap; backend enforces 1000.
              disabled={pending}
            />
            <p
              className={cn(
                "text-right text-xs tabular-nums",
                valid ? "text-muted-foreground" : "text-amber-600",
              )}
            >
              {length}/{MAX_PROMPT} (min {MIN_PROMPT})
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className="flex rounded-md border p-0.5"
              role="group"
              aria-label="Aspect ratio"
            >
              {(
                [
                  { value: "16:9", label: "Widescreen", Icon: Monitor },
                  { value: "9:16", label: "Vertical", Icon: Smartphone },
                ] as const
              ).map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  disabled={pending}
                  onClick={() => setAspectRatio(value)}
                  aria-pressed={aspectRatio === value}
                  className={cn(
                    "flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors",
                    aspectRatio === value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional)"
              maxLength={200}
              disabled={pending}
              aria-label="Visualization title (optional)"
              className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] min-w-40"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={!valid || pending} className="w-full">
            {pending ? "Starting visualization…" : "Generate visualization"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
