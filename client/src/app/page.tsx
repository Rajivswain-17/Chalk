import Link from "next/link";
import {
  Captions,
  Clapperboard,
  MonitorPlay,
  PenLine,
  Radio,
  Sparkles,
  ArrowRight,
} from "lucide-react";

// Home — full-viewport dark hero, full-bleed (no centered card column).
// CTAs route to real pages (/generate, /how-it-works); nothing scrolls.

const STACK_BADGES = [
  { Icon: Sparkles, label: "OpenAI gpt-4o" },
  { Icon: Captions, label: "ElevenLabs voice" },
  { Icon: Clapperboard, label: "Remotion render" },
  { Icon: Radio, label: "Live HLS stream" },
  { Icon: MonitorPlay, label: "16:9 + 9:16" },
] as const;

const STATS = [
  { value: "10–15s", label: "to first scene playback" },
  { value: "3–5", label: "hand-drawn scenes per video" },
  { value: "30 fps", label: "sketch-stroke Remotion render" },
] as const;

export default function Home() {
  return (
    <div className="flex w-full flex-1 flex-col">
      {/* Top nav — full width */}
      <header className="flex w-full items-center gap-2 px-4 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <PenLine className="size-5" />
          </span>
          <span className="text-xl font-semibold tracking-tight">Chalk</span>
        </Link>
        <nav className="ml-8 hidden items-center gap-5 text-sm text-muted-foreground sm:flex">
          <Link href="/generate" className="hover:text-foreground">Generate</Link>
          <Link href="/how-it-works" className="hover:text-foreground">How it works</Link>
        </nav>
        <Link
          href="/generate"
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          New video <ArrowRight className="size-4" />
        </Link>
      </header>

      {/* Full-screen dark hero */}
      <section className="relative flex w-full flex-1 items-center justify-center overflow-hidden bg-[#14161c] px-4 py-16 sm:px-8">
        {/* soft warm + cool glows */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 right-[5%] size-96 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, #f2c4a0 0%, transparent 70%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 left-[5%] size-96 rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, #7c8cf8 0%, transparent 70%)" }}
        />

        <div className="relative w-full max-w-5xl text-center">
          <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs text-zinc-300">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Chalk 1.0&nbsp;&nbsp;·&nbsp;&nbsp;Progressive whiteboard rendering
          </p>
          <h1 className="mx-auto max-w-4xl text-5xl font-semibold tracking-tight text-zinc-50 text-balance sm:text-7xl">
            Explain anything,
            <br />
            <span className="text-[#f2c4a0]">watch it draw itself.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-zinc-400 sm:text-lg">
            Type a topic. Chalk writes the script, narrates it, sketches each
            scene by hand — and streams the video live as it renders.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/generate"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#f2c4a0] px-6 font-medium text-black transition-colors hover:bg-[#f7d3b5]"
            >
              Generate a video <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex h-12 items-center rounded-xl border border-white/20 px-6 text-zinc-200 transition-colors hover:bg-white/5"
            >
              How it works
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            {STACK_BADGES.map(({ Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300"
              >
                <Icon className="size-3.5" /> {label}
              </span>
            ))}
          </div>

          <dl className="mx-auto mt-10 grid max-w-2xl grid-cols-3 divide-x divide-white/10 rounded-xl border border-white/10 bg-white/[0.03]">
            {STATS.map(({ value, label }) => (
              <div key={label} className="px-4 py-5">
                <dd className="text-2xl font-semibold text-zinc-50 tabular-nums sm:text-3xl">
                  {value}
                </dd>
                <dt className="mt-1 text-[11px] leading-tight text-zinc-500">
                  {label}
                </dt>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}
