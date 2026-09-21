"use client";

// AuthForm — split-screen credential form: rounded h-12 inputs with password
// eye toggle, dark full-width submit, toggle link, OR divider, stacked OAuth
// buttons (backend /api/auth/oauth/:provider), terms microcopy.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, ArrowRight, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_URL } from "@/lib/auth-client";
import { GitHubLogo, GoogleLogo } from "@/components/OAuthButtons";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export type AuthMode = "login" | "signup";

const OAUTH_ERRORS: Record<string, string> = {
  oauth: "Social login failed. Try again or use email.",
  no_email: "That account hides its email — expose one contributor or sign up with email.",
};

function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/generate";
}

interface AuthFormProps {
  mode: AuthMode;
  next: string | null;
  oauthError: string | null;
  providers: { google: boolean; github: boolean };
}

export function AuthForm({ mode, next, oauthError, providers }: AuthFormProps) {
  const { login, signup } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    oauthError ? (OAUTH_ERRORS[oauthError] ?? OAUTH_ERRORS.oauth) : null,
  );

  const destination = safeNext(next);
  const title = mode === "login" ? "Access your Chalk" : "Create your Chalk account";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      if (mode === "login") await login({ email: email.trim(), password });
      else await signup({ name: name.trim(), email: email.trim(), password });
      router.push(destination);
      router.refresh(); // Re-run proxy guards with the fresh cookies.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPending(false);
    }
  }

  const switchHref =
    mode === "login"
      ? next
        ? `/signup?next=${encodeURIComponent(next)}`
        : "/signup"
      : next
        ? `/login?next=${encodeURIComponent(next)}`
        : "/login";

  const oauthHref = (provider: "google" | "github") =>
    `${API_URL}/api/auth/oauth/${provider}?next=${encodeURIComponent(destination)}`;
  const showOAuth = providers.google || providers.github;

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            Don&apos;t have an account?{" "}
            <Link href={switchHref} className="font-medium text-foreground underline underline-offset-4">
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href={switchHref} className="font-medium text-foreground underline underline-offset-4">
              Log in
            </Link>
          </>
        )}
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {mode === "signup" && (
          <div className="space-y-2">
            <Label htmlFor="name" className="font-semibold">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
              maxLength={100}
              required
              disabled={pending}
              autoComplete="name"
              className="h-12 rounded-xl bg-background text-base"
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email" className="font-semibold">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            maxLength={254}
            required
            disabled={pending}
            autoComplete="email"
            className="h-12 rounded-xl bg-background text-base"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="font-semibold">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
              minLength={mode === "signup" ? 8 : 1}
              maxLength={128}
              required
              disabled={pending}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="h-12 rounded-xl bg-background pr-11 text-base"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              disabled={pending}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={pending}
          className="h-12 w-full rounded-xl bg-zinc-900 text-[15px] font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? "Please wait…" : (
            <> {mode === "login" ? "Log in" : "Create account"} <ArrowRight className="size-4" /> </>
          )}
        </Button>
      </form>

      {showOAuth && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs font-medium tracking-widest text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> OR{" "}
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-2">
            {providers.google && (
              // Plain anchor: cross-origin top-level navigation to the API.
              <a
                href={oauthHref("google")}
                className={cn(
                  "flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-input bg-background px-4 text-[15px] font-medium shadow-xs transition-colors hover:bg-muted",
                  pending && "pointer-events-none opacity-50",
                )}
              >
                <GoogleLogo className="size-5" /> Continue with Google
              </a>
            )}
            {providers.github && (
              <a
                href={oauthHref("github")}
                className={cn(
                  "flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-input bg-background px-4 text-[15px] font-medium shadow-xs transition-colors hover:bg-muted",
                  pending && "pointer-events-none opacity-50",
                )}
              >
                <GitHubLogo className="size-5" /> Continue with GitHub
              </a>
            )}
          </div>
        </>
      )}

      <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
        By continuing, you agree to our Terms &amp; Privacy Policy.
      </p>
    </div>
  );
}
