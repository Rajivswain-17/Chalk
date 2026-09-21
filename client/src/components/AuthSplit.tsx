import Link from "next/link";
import { PenLine, Play } from "lucide-react";

// AuthSplit — split-screen shell for /login + /signup.
// Left: dark chalkboard panel (illustration, tagline, proof stats) — hidden
// below lg so mobile gets only the clean auth card. Right: cream auth column.

// Real product proof only — no invented user counts.
const PROOF_STATS = ["10–15s to first scene", "Realtime Streaming", "AI Voice Sync"] as const;

/** Static SVG vignette: sketch board, play button, voice-sync bars. */
function BoardIllustration() {
  return (
    <svg viewBox="0 0 400 240" className="w-full max-w-md" aria-hidden>
      <rect x="20" y="16" width="360" height="208" rx="16" fill="#ffffff" opacity="0.06" />
      <rect x="20" y="16" width="360" height="208" rx="16" fill="none" stroke="#f2c4a0" strokeOpacity="0.5" strokeWidth="2" strokeDasharray="10 8" />
      {/* sketch circle + arrow (the "drawing" strokes) */}
      <circle cx="130" cy="110" r="44" fill="none" stroke="#f2c4a0" strokeWidth="4" strokeLinecap="round" strokeDasharray="210 70" />
      <path d="M190 150 C 240 150, 250 120, 300 118 M282 106 L302 118 L284 130" fill="none" stroke="#7c8cf8" strokeWidth="4" strokeLinecap="round" />
      {/* script lines */}
      <line x1="56" y1="188" x2="200" y2="188" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="6" strokeLinecap="round" />
      <line x1="56" y1="202" x2="160" y2="202" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="6" strokeLinecap="round" />
      {/* play button */}
      <circle cx="330" cy="70" r="24" fill="#f2c4a0" />
      <path d="M323 58 L341 70 L323 82 Z" fill="#0a0a12" />
      {/* voice-sync bars */}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <rect
          key={i}
          x={236 + i * 14}
          y={186 - [10, 22, 16, 28, 20, 12, 24][i]}
          width="8"
          height={[10, 22, 16, 28, 20, 12, 24][i]}
          rx="4"
          fill="#34d399"
          opacity="0.85"
        />
      ))}
    </svg>
  );
}

interface AuthSplitProps {
  eyebrow: string;
  children: React.ReactNode;
}

export function AuthSplit({ eyebrow, children }: AuthSplitProps) {
  return (
    <div className="flex w-full flex-1 flex-col lg:grid lg:grid-cols-2">
      {/* Left — dark chalkboard panel, desktop only */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#0a0a12] p-10 text-zinc-100 lg:flex xl:p-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-0 size-80 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, #f2c4a0 0%, transparent 70%)" }}
        />
        <Link href="/" className="relative flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-[#f2c4a0] text-black">
            <PenLine className="size-5" />
          </span>
          <span className="text-xl font-semibold tracking-tight">Chalk</span>
        </Link>

        <div className="relative space-y-6">
          <BoardIllustration />
          <div>
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-zinc-300">
              <Play className="size-3" /> {eyebrow}
            </p>
            <p className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-balance xl:text-4xl">
              Turn any idea into an animated whiteboard video in seconds.
            </p>
          </div>
        </div>

        <p className="relative text-sm text-zinc-400">
          {PROOF_STATS.join("  •  ")}
        </p>
      </aside>

      {/* Right — cream auth column (the only pane on mobile) */}
      <div className="relative flex flex-1 flex-col justify-center px-4 py-10 sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-16 -z-10 size-96 -translate-x-1/2 rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(circle, #f7e3bd 0%, transparent 70%)" }}
        />
        {/* mobile wordmark (desktop has it in the dark panel) */}
        <Link href="/" className="mb-6 flex items-center justify-center gap-2 lg:hidden">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <PenLine className="size-5" />
          </span>
          <span className="text-xl font-semibold tracking-tight">Chalk</span>
        </Link>
        <div className="relative mx-auto w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
