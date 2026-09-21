"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type PlaySpeed = 0.5 | 1 | 2;

export function useVisualPlayer(total: number) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaySpeed>(1);

  const next = useCallback(() => setIndex((i) => Math.min(i + 1, Math.max(total - 1, 0))), [total]);
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);
  const goTo = useCallback((n: number) => setIndex(() => Math.min(Math.max(n, 0), Math.max(total - 1, 0))), [total]);
  const togglePlay = useCallback(() => setPlaying((p) => !p), []);
  const cycleSpeed = useCallback(() => setSpeed((s) => (s === 0.5 ? 1 : s === 1 ? 2 : 0.5)), []);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!playing || total <= 1) return;
    timer.current = setInterval(() => {
      setIndex((i) => {
        if (i >= total - 1) { setPlaying(false); return i; }
        return i + 1;
      });
    }, 4500 / speed);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, speed, total]);

  const [prevTotal, setPrevTotal] = useState(total);
  if (prevTotal !== total) { setPrevTotal(total); setIndex(0); setPlaying(false); }

  return { index, playing, speed, next, prev, goTo, togglePlay, cycleSpeed };
}
