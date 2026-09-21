"use client";

// UserMenu — header identity: loading shimmer → Login link → avatar + logout.
// Lives inside AuthProvider (all headers using it render under layout).

import Link from "next/link";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export function UserMenu() {
  const { user, booting, logout } = useAuth();

  if (booting) {
    return <span aria-hidden className="size-8 animate-pulse rounded-full bg-muted" />;
  }
  if (!user) {
    return (
      <Link
        href="/login"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Log in
      </Link>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <span
        title={user.email}
        aria-label={`Signed in as ${user.name}`}
        className="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
      >
        {(user.name || user.email).trim().charAt(0).toUpperCase()}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Log out"
        onClick={() => void logout()}
      >
        <LogOut className="size-4" />
      </Button>
    </span>
  );
}
