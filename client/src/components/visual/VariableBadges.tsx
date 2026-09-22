"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { VisualVariable } from "@/lib/visualize";
import { cn } from "@/lib/utils";

type Verdict = { ok: boolean; label: string };

const PAREN_VERDICT_RE = /\(([^()]*)\)\s*$/;
const VERDICT_FAIL_RE =
  /\b(invalid|false|fail(s|ed)?|no|too\s+(small|large|high|low|big)|move\s+(left|right)|exceed(s|ed)?|not)\b/i;
const VERDICT_PASS_RE =
  /\b(valid|match|true|pass(es|ed)?|success|found|works|yes)\b/i;
/** Comparison operators, longest first so `<=` never reads as `<`. */
const COMPARISON_RE = /(<=|>=|==|!=|<|>)/g;
const LEFT_OPERAND_RE = /(-?\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*)\s*$/;
const RIGHT_OPERAND_RE = /^\s*(-?\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*)/;
const ASSIGNMENT_RE = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(-?\d+(?:\.\d+)?)/g;

/** Numeric value of an operand token, resolving variable names when possible. */
function resolveOperand(token: string | undefined, values: Map<string, number>) {
  if (!token) return null;
  const literal = Number(token);
  if (Number.isFinite(literal)) return literal;
  return values.get(token) ?? null;
}

/**
 * Fallback verdict when the model omitted the "(verdict)" group: evaluate the
 * formula's LAST comparison, resolving names against the step's variables and
 * against any `name = number` assignment written in the formula itself
 * (e.g. `sum == target` with `target = 7`).
 *
 * Only equality (`==`/`!=`) yields a pill: it has unambiguous pass/fail
 * semantics (a match is a match regardless of which form the model wrote).
 * Relational truth does not — `mid < target` being true means "too small,
 * move right" narratively, not "valid" — so those return null rather than a
 * misleading pill. Also null when a side cannot resolve to a number.
 */
function verdictFromEquation(
  calculation: string,
  variables?: VisualVariable[]
): Verdict | null {
  const values = new Map<string, number>();
  for (const v of variables ?? []) {
    const num = Number(v.value);
    if (v.value !== null && Number.isFinite(num)) values.set(v.name.trim(), num);
  }
  for (const m of calculation.matchAll(ASSIGNMENT_RE)) {
    values.set(m[1], Number(m[2]));
  }

  const comparisons = [...calculation.matchAll(COMPARISON_RE)];
  const last = comparisons[comparisons.length - 1];
  const start = last?.index ?? -1;
  if (!last || start < 0) return null;

  const op = last[1];
  const left = resolveOperand(
    calculation.slice(0, start).match(LEFT_OPERAND_RE)?.[1],
    values
  );
  const right = resolveOperand(
    calculation.slice(start + op.length).match(RIGHT_OPERAND_RE)?.[1],
    values
  );
  if (left === null || right === null) return null;

  if (op !== "==" && op !== "!=") return null;
  const equal = left === right;
  return { ok: equal, label: equal ? "Match" : "No match" };
}

/**
 * Read the verdict: a trailing "(verdict)" group when the model supplied one,
 * otherwise the result of evaluating the equation's last comparison, so the
 * badge still carries a ✓/✗ pill when the parenthetical is missing.
 */
function parseVerdict(
  calculation: string,
  variables?: VisualVariable[]
): { formula: string; verdict: Verdict | null } {
  const trimmed = calculation.trim();
  const match = trimmed.match(PAREN_VERDICT_RE);
  const raw = match?.[1].trim() ?? "";
  const bad = VERDICT_FAIL_RE.test(raw);
  const good = !bad && VERDICT_PASS_RE.test(raw);
  const start = match?.index ?? -1;

  if (raw && (bad || good) && start >= 0) {
    return {
      formula: trimmed.slice(0, start).trim(),
      verdict: { ok: good, label: raw.charAt(0).toUpperCase() + raw.slice(1) },
    };
  }

  return { formula: trimmed, verdict: verdictFromEquation(trimmed, variables) };
}

/**
 * Live Math badge: renders the step's expanded arithmetic together with its
 * verdict — from the model's trailing "(verdict)" group when present, else
 * derived from the equation's own last comparison. Renders nothing when the
 * step carries no calculation, so narrative steps are never given an empty
 * amber shell.
 */
export function LiveMathBadge({
  calculation,
  variables,
}: {
  calculation?: string | null;
  variables?: VisualVariable[];
}) {
  if (!calculation || !calculation.trim()) return null;
  const { formula, verdict } = parseVerdict(calculation, variables);

  return (
    <motion.div
      key={calculation}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/25 flex items-center gap-3 shadow-[0_0_15px_rgba(251,191,36,0.08)]"
    >
      <span className="text-amber-400 font-mono font-bold text-sm bg-amber-500/20 px-2 py-0.5 rounded-md shrink-0">
        ∑
      </span>
      <span className="text-sm sm:text-base font-mono font-semibold text-amber-200 tracking-wide break-words min-w-0">
        {formula}
      </span>
      {verdict && (
        <span
          className={cn(
            "text-xs font-bold px-2 py-0.5 rounded-md border shrink-0",
            verdict.ok
              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
              : "bg-neutral-800/90 text-neutral-300 border-neutral-700"
          )}
        >
          {verdict.ok ? "✓" : "✗"} {verdict.label}
        </span>
      )}
    </motion.div>
  );
}

export function VariableBadges({
  variables,
}: {
  variables: VisualVariable[];
}) {
  const [flashingVars, setFlashingVars] = useState<Record<string, boolean>>({});
  const prevValuesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const changed: Record<string, boolean> = {};
    let hasChange = false;

    for (const v of variables) {
      const strVal = String(v.value);
      const prev = prevValuesRef.current[v.name];
      if (prev !== undefined && prev !== strVal) {
        changed[v.name] = true;
        hasChange = true;
      }
      prevValuesRef.current[v.name] = strVal;
    }

    if (hasChange) {
      setFlashingVars(changed);
      const timer = setTimeout(() => {
        setFlashingVars({});
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [variables]);

  if (!variables || variables.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-5 py-2.5">
      {variables.map((v) => {
        const isFlashing = flashingVars[v.name];

        return (
          <span
            key={v.name}
            className={cn(
              "bg-neutral-800/80 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono transition-all duration-300 flex items-center gap-1 select-none",
              isFlashing
                ? "ring-1 ring-amber-400/50 shadow-[0_0_12px_rgba(251,191,36,0.3)] bg-amber-950/40 border-amber-500/50"
                : ""
            )}
          >
            <span className="text-neutral-400">{v.name}</span>
            <span className="text-neutral-600">=</span>
            <span className="text-amber-300 font-semibold">
              {String(v.value)}
            </span>
          </span>
        );
      })}
    </div>
  );
}
