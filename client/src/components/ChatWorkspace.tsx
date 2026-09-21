"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PenLine,
  Plus,
  Compass,
  History,
  ArrowUp,
  Sparkles,
  Layers,
  Code2,
  Cpu,
  Coins,
  CheckCircle2,
  AlertCircle,
  LogOut,
  RefreshCw,
  Eye,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VisualExplainer } from "@/components/visual/VisualExplainer";
import { fetchVisualization, type VisualStep } from "@/lib/visualize";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

// Display-only badge value. The DOM stages ignore aspect ratio; sessions
// default to "16:9" with no user control.
type AspectRatio = "16:9" | "9:16";

interface ChatSession {
  id: string;
  prompt: string;
  title: string;
  aspectRatio: AspectRatio;
  jobId: string;
  videoId: string;
  createdAt: number;
  /** Cached visualization result — persisted so refreshes render instantly
   *  with zero API calls (prevents rate-limit 429s on reload). */
  steps?: VisualStep[];
}

const FEATURED_PROMPTS = [
  {
    category: "DSA & LeetCode",
    icon: Code2,
    color: "from-blue-500/20 to-cyan-500/20 border-blue-500/30 text-blue-400",
    title: "LeetCode 112: Path Sum",
    prompt: "Explain LeetCode 112 Path Sum with binary tree depth-first search step-by-step target subtraction.",
  },
  {
    category: "DSA & Algorithms",
    icon: Layers,
    color: "from-emerald-500/20 to-teal-500/20 border-emerald-500/30 text-emerald-400",
    title: "Two Sum: Two-Pointer Technique",
    prompt: "Explain Two Sum algorithm using two pointers on a sorted array with left and right pointers moving inward.",
  },
  {
    category: "Real-World Finance",
    icon: Coins,
    color: "from-amber-500/20 to-orange-500/20 border-amber-500/30 text-amber-400",
    title: "How Credit Scores Work",
    prompt: "Explain how credit scores are calculated: payment history (35%), credit utilization (30%), length of history, and impact of high debt.",
  },
  {
    category: "Computer Systems",
    icon: Cpu,
    color: "from-purple-500/20 to-pink-500/20 border-purple-500/30 text-purple-400",
    title: "TCP 3-Way Handshake",
    prompt: "Explain TCP 3-Way Handshake step-by-step with SYN, SYN-ACK, and ACK packet state transitions between client and server.",
  },
];

const STORAGE_KEY = "chalk_recent_chats_v2";

// Client-side safety net: the server normally answers within ~80s (observed
// worst case), so anything beyond 2 minutes is treated as a hung request and
// surfaced as a clear error with Retry instead of an infinite skeleton.
const GENERATION_TIMEOUT_MS = 120_000;

function fetchStepsWithTimeout(
  prompt: string
): Promise<{ steps: VisualStep[] }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            "Generation timed out after 2 minutes — the server took too long to respond. Please retry."
          )
        ),
      GENERATION_TIMEOUT_MS
    );
  });
  return Promise.race([fetchVisualization(prompt), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function ChatWorkspace() {
  const router = useRouter();
  const { user, booting, logout } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [promptInput, setPromptInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load saved chat history on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatSession[];
        setSessions(parsed);
        if (parsed.length > 0) {
          setActiveSession(parsed[0]);
        }
      }
    } catch {
      // Ignore local storage errors
    }
  }, []);

  const saveSessions = (updated: ChatSession[]) => {
    setSessions(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated.slice(0, 30)));
    } catch {
      // Ignore storage errors
    }
  };

  const handleNewChat = () => {
    setActiveSession(null);
    setPromptInput("");
    setErrorMessage(null);
  };

  const handleSelectSession = (session: ChatSession) => {
    setActiveSession(session);
    setErrorMessage(null);
  };

  const handleDeleteSession = (session: ChatSession) => {
    const updated = sessions.filter((s) => s.jobId !== session.jobId);
    saveSessions(updated);
    if (activeSession?.jobId === session.jobId) {
      setActiveSession(null);
    }
  };

  // Persist a successful visualization result into the session (state +
  // localStorage) so refreshes and recent-chat clicks skip the API entirely.
  const handleCacheSteps = (jobId: string, steps: VisualStep[]) => {
    const updated = sessions.map((s) =>
      s.jobId === jobId ? { ...s, steps } : s
    );
    saveSessions(updated);
    setActiveSession((prev) =>
      prev && prev.jobId === jobId ? { ...prev, steps } : prev
    );
  };

  const handleStartGeneration = (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || trimmed.length < 10) {
      setErrorMessage("Prompt must be at least 10 characters long.");
      return;
    }

    if (!user && !booting) {
      router.push("/login?next=" + encodeURIComponent(window.location.pathname));
      return;
    }

    const id = crypto.randomUUID();
    const newSession: ChatSession = {
      id,
      prompt: trimmed,
      title: trimmed.length > 40 ? trimmed.slice(0, 38) + "..." : trimmed,
      aspectRatio: "16:9",
      jobId: id,
      videoId: "",
      createdAt: Date.now(),
    };

    const updated = [newSession, ...sessions];
    saveSessions(updated);
    setActiveSession(newSession);
    setPromptInput("");
    setErrorMessage(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleStartGeneration(promptInput);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#0d0f14] text-zinc-100 antialiased">
      {/* Left Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r border-zinc-800/80 bg-[#11131a] transition-all duration-300 ease-in-out",
          sidebarOpen ? "w-72" : "w-0 overflow-hidden border-r-0"
        )}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800/60">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 text-zinc-950 font-bold shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
              <PenLine className="size-5" />
            </div>
            <div>
              <span className="font-semibold tracking-tight text-base text-zinc-100 flex items-center gap-1.5">
                Chalk <span className="text-[10px] font-medium tracking-wider uppercase bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">Visual</span>
              </span>
              <p className="text-[11px] text-zinc-400">Zero-Voice Explainer Engine</p>
            </div>
          </Link>
        </div>

        {/* Action Button: New Chat */}
        <div className="p-3">
          <Button
            onClick={handleNewChat}
            className="w-full justify-start gap-2 bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-200 border border-zinc-700/50 rounded-xl h-10 shadow-sm"
          >
            <Plus className="size-4 text-amber-400" />
            <span className="font-medium text-sm">New Visualization</span>
            <span className="ml-auto text-[10px] font-mono text-zinc-400 bg-zinc-900/60 px-1.5 py-0.5 rounded border border-zinc-700/40">
              Ctrl K
            </span>
          </Button>
        </div>

        {/* Navigation / History list */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4 text-xs">
          {/* Featured Presets */}
          <div>
            <div className="px-2 pb-1.5 font-medium text-zinc-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Compass className="size-3.5 text-zinc-400" /> Featured Explanations
            </div>
            <div className="space-y-1">
              {FEATURED_PROMPTS.map((item) => (
                <button
                  key={item.title}
                  onClick={() => {
                    setPromptInput(item.prompt);
                    handleStartGeneration(item.prompt);
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-zinc-800/50 text-zinc-300 transition-colors flex items-center gap-2 group"
                >
                  <item.icon className="size-3.5 shrink-0 text-amber-400/80 group-hover:text-amber-300" />
                  <span className="truncate">{item.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* History */}
          <div>
            <div className="px-2 pb-1.5 font-medium text-zinc-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <History className="size-3.5 text-zinc-400" /> Recent Visuals
            </div>
            {sessions.length === 0 ? (
              <div className="px-2.5 py-4 text-zinc-400 text-center italic">
                No visualizations yet.
              </div>
            ) : (
              <div className="space-y-1">
                {sessions.map((session) => {
                  const isActive = activeSession?.jobId === session.jobId;
                  return (
                    <div
                      key={session.jobId}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectSession(session)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSelectSession(session);
                        }
                      }}
                      className={cn(
                        "w-full text-left px-2.5 py-2 rounded-lg transition-colors flex items-center justify-between gap-2 group cursor-pointer",
                        isActive
                          ? "bg-amber-500/15 text-amber-200 font-medium border border-amber-500/30"
                          : "hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200"
                      )}
                    >
                      <span className={cn("size-2 rounded-full shrink-0", isActive ? "bg-amber-400" : "bg-zinc-600")} />
                      <span className="truncate flex-1">{session.title}</span>
                      <span className="text-[10px] text-zinc-400 uppercase tabular-nums shrink-0">
                        {session.aspectRatio}
                      </span>
                      <button
                        type="button"
                        aria-label={`Delete ${session.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSession(session);
                        }}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-neutral-500 hover:text-red-400 shrink-0"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* User profile footer */}
        <div className="p-3 border-t border-zinc-800/60 bg-[#0e1017]">
          {booting ? (
            <div className="flex items-center gap-3 p-1 animate-pulse">
              <div className="size-8 rounded-full bg-zinc-800" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3 w-20 bg-zinc-800 rounded" />
                <div className="h-2 w-12 bg-zinc-800 rounded" />
              </div>
            </div>
          ) : user ? (
            <div className="flex items-center justify-between p-1">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-amber-500 to-amber-600 text-zinc-950 text-xs font-bold shadow">
                  {(user.name || user.email).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-200 truncate">{user.name || user.email}</p>
                  <p className="text-[10px] text-amber-400 font-medium">Pro Engine</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void logout()}
                className="size-7 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-lg"
                title="Log out"
              >
                <LogOut className="size-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="flex-1 text-center py-1.5 text-xs font-medium bg-amber-500 text-zinc-950 rounded-lg hover:bg-amber-400 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="flex-1 text-center py-1.5 text-xs font-medium bg-zinc-800 text-zinc-200 rounded-lg hover:bg-zinc-700 transition-colors border border-zinc-700/50"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* Main Chat / Stage Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top Navbar */}
        <header className="h-14 border-b border-zinc-800/80 bg-[#11131a]/80 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
              title="Toggle sidebar"
            >
              <Layers className="size-4" />
            </button>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-zinc-200">
                {activeSession ? activeSession.title : "Chalk All-Rounder Visual Workspace"}
              </span>
              {activeSession && (
                <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400 uppercase">
                  {activeSession.aspectRatio}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-900/80 px-2.5 py-1 rounded-full border border-zinc-800">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Zero-Voice Active</span>
            </div>
            <Link
              href="/how-it-works"
              className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded transition-colors"
            >
              How it works
            </Link>
          </div>
        </header>

        {/* Content Scroll View */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
          {!activeSession ? (
            /* Welcome Hero & Presets */
            <div className="w-full max-w-5xl xl:max-w-6xl mx-auto py-8 sm:py-12 space-y-8">
              <div className="text-center space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium">
                  <Sparkles className="size-3.5" /> All-Rounder Visual Explainer Engine
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-100">
                  What would you like to visualize?
                </h1>
                <p className="text-zinc-400 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
                  Turn any DSA algorithm, LeetCode problem, or real-world concept into a step-by-step visual state machine with logic rules, state variables, and animated pointers. No voiceover needed.
                </p>
              </div>

              {/* Preset Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {FEATURED_PROMPTS.map((item) => (
                  <button
                    key={item.title}
                    onClick={() => {
                      setPromptInput(item.prompt);
                      handleStartGeneration(item.prompt);
                    }}
                    className={cn(
                      "p-4 rounded-xl border text-left transition-all duration-200 hover:scale-[1.01] hover:border-amber-500/40 bg-gradient-to-b from-zinc-900/90 to-zinc-900/40 hover:bg-zinc-850/80 shadow-sm group",
                      item.color
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                        {item.category}
                      </span>
                      <item.icon className="size-4 text-zinc-300 group-hover:text-amber-400 transition-colors" />
                    </div>
                    <h2 className="font-semibold text-sm text-zinc-100 group-hover:text-amber-200 transition-colors">
                      {item.title}
                    </h2>
                    <p className="text-xs text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                      {item.prompt}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Active Chat Thread */
            <ActiveChatView
              key={activeSession.jobId}
              session={activeSession}
              onCacheSteps={handleCacheSteps}
            />
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Docked Prompt Input Bar */}
        <div className="p-4 sm:p-6 border-t border-zinc-800/80 bg-[#11131a]/95 backdrop-blur-md shrink-0">
          <div className="w-full max-w-5xl xl:max-w-6xl mx-auto space-y-3">
            {errorMessage && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                <AlertCircle className="size-4 shrink-0 text-red-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="relative bg-zinc-900/90 border border-zinc-800 rounded-2xl p-2 shadow-xl focus-within:border-amber-500/50 transition-colors">
              <textarea
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder="Ask Chalk to visualize anything (e.g., LeetCode 112 Path Sum, Binary Search, Credit Score Mechanics)..."
                rows={2}
                className="w-full bg-transparent px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 resize-none outline-none"
              />

              <div className="flex items-center justify-end pt-2 px-2 border-t border-zinc-800/50">
                {/* Submit button */}
                <Button
                  type="submit"
                  disabled={promptInput.trim().length < 10}
                  className="rounded-xl size-9 p-0 bg-gradient-to-tr from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-zinc-950 font-bold shadow-md shadow-amber-500/20 disabled:opacity-40"
                >
                  <ArrowUp className="size-4" />
                </Button>
              </div>
            </form>

            <p className="text-[11px] text-zinc-500 text-center">
              Zero Voiceover • Visual State Machine • Code Logic & Highlighted Rules • Timed Captions
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

/** Component for the active visual explanation inside the chat thread */
function ActiveChatView({
  session,
  onCacheSteps,
}: {
  session: ChatSession;
  onCacheSteps: (jobId: string, steps: VisualStep[]) => void;
}) {
  // Cache hit: hydrate straight from the persisted session so a refresh or
  // recent-chat click renders finished state immediately (0 API calls).
  const [steps, setSteps] = useState<VisualStep[] | null>(
    () => session.steps ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !session.steps);
  const [elapsed, setElapsed] = useState(0);

  // Live elapsed-seconds counter while generating, so a long OpenAI call
  // (observed up to ~78s) reads as "working", not "frozen".
  useEffect(() => {
    if (!loading) return;
    const tick = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(tick);
  }, [loading]);

  // Keep the latest callback in a ref so the fetch effect runs exactly once
  // per session regardless of parent re-render identity churn.
  const cacheRef = useRef(onCacheSteps);
  useEffect(() => {
    cacheRef.current = onCacheSteps;
  }, [onCacheSteps]);

  const tooShort = session.prompt.trim().length < 10;

  // Remounted per session via key={session.jobId}, so initial state doubles as
  // the reset: no synchronous setState inside the effect below.
  const retry = () => {
    setLoading(true);
    setError(null);
    setElapsed(0);
    fetchStepsWithTimeout(session.prompt)
      .then((r) => {
        setSteps(r.steps);
        cacheRef.current(session.jobId, r.steps);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load visualization"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // Cached sessions skip the fetch entirely — zero API calls on reload.
    if (tooShort || session.steps) return;
    let cancelled = false;
    fetchStepsWithTimeout(session.prompt)
      .then((r) => {
        // Persist unconditionally: the API result is valuable even if the
        // user navigated away mid-flight; guard only the local setState.
        cacheRef.current(session.jobId, r.steps);
        if (!cancelled) setSteps(r.steps);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load visualization");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session.prompt, session.jobId, session.steps, tooShort]);

  const isFinished = !loading && !error && steps !== null && !tooShort;
  const hasFailed = !loading && error !== null;

  return (
    <div className="w-full max-w-6xl xl:max-w-7xl mx-auto space-y-6">
      {/* User Message Bubble */}
      <div className="flex justify-end">
        <div className="max-w-xl bg-zinc-800/80 border border-zinc-700/60 rounded-2xl rounded-tr-sm p-4 text-zinc-100 shadow-md space-y-1.5">
          <p className="text-sm font-medium leading-relaxed">{session.prompt}</p>
          <div className="flex items-center justify-end gap-2 text-[10px] text-zinc-400 font-mono">
            <span>{session.aspectRatio}</span>
            <span>•</span>
            <span>{new Date(session.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        </div>
      </div>

      {/* AI Bot Response Message */}
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 text-zinc-950 font-bold shadow-md shadow-amber-500/20">
          <PenLine className="size-5" />
        </div>

        <div className="flex-1 space-y-4">
          <div className="bg-transparent border-0 p-0 shadow-none space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
              <div>
                <h2 className="font-semibold text-sm text-zinc-100 flex items-center gap-2">
                  <span>Chalk Visual Explainer</span>
                  {tooShort ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                      <AlertCircle className="size-3" /> Too short
                    </span>
                  ) : isFinished ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      <CheckCircle2 className="size-3" /> Ready
                    </span>
                  ) : hasFailed ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                      <AlertCircle className="size-3" /> Failed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                      <RefreshCw className="size-3 animate-spin" /> Rendering Live
                    </span>
                  )}
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">{session.title}</p>
              </div>

              {steps !== null && !tooShort && (
                <Badge variant="secondary" className="text-xs font-mono">
                  {steps.length} steps
                </Badge>
              )}
            </div>

            {tooShort ? (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs">
                Prompt must be at least 10 characters long.
              </div>
            ) : loading ? (
              <div className="space-y-3" aria-label="Loading visualization">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-amber-300/90">
                    <RefreshCw className="size-3 animate-spin text-amber-400" />
                    Generating your visual — usually 10–60 seconds, keep this
                    tab open
                  </span>
                  <span className="font-mono tabular-nums text-zinc-500">
                    {elapsed}s
                  </span>
                </div>
                <div className="h-48 rounded-xl bg-zinc-800/80 animate-pulse" />
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="h-24 rounded-xl bg-zinc-800/80 animate-pulse" />
                  <div className="h-24 rounded-xl bg-zinc-800/80 animate-pulse" />
                </div>
                <div className="h-10 rounded-xl bg-zinc-800/80 animate-pulse" />
              </div>
            ) : error ? (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs space-y-2">
                <p className="font-semibold">Visualization failed</p>
                <p>{error}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={retry}
                  className="gap-1.5 border-red-500/30 text-red-200 hover:bg-red-500/10 hover:text-red-100"
                >
                  <RefreshCw className="size-3.5" /> Retry
                </Button>
              </div>
            ) : steps ? (
              <div className="pt-2">
                <VisualExplainer steps={steps} title={session.title} />
              </div>
            ) : null}

            {/* Footer Metadata */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/60 text-xs text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Eye className="size-3.5 text-zinc-500" />
                <span>Zero Voiceover • Visual Step Machine</span>
              </span>
              {steps !== null && !tooShort && (
                <span className="tabular-nums font-mono text-zinc-400">
                  {steps.length} steps ready
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
