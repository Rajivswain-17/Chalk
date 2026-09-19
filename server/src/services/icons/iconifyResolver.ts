// ============================================================================
// Chalk — master icon resolver (Chalk/server/src/services/icons/iconifyResolver.ts)
// ----------------------------------------------------------------------------
// 2-tier strategy for designer `content` keywords → raw SVG strings:
//   Tier 1 (offline): resolveLucideIcon() — local package, zero latency/quota.
//   Disk cache:       ICON_CACHE_DIR/{keyword}.svg — past Iconify hits.
//   Tier 2 (online):  Iconify API search + fetch — 200k+ icons, rate-limited.
// Returns null only when ALL tiers miss (compositor then skips the element).
// ============================================================================

import axios from "axios"; // HTTP client for Iconify search + SVG fetch.
import { mkdir, readFile, writeFile } from "fs/promises"; // Cache file I/O.
import path from "path"; // Cache-dir joins (Linux Docker safe).
import { resolveLucideIcon } from "./lucideResolver"; // Tier 1 import.

// Disk cache root from Chalk/.env (default "/app/cache/icons"). Persisted via
// Docker volume so re-renders NEVER re-fetch a known icon — saves Iconify
// quota, removes network flakiness from repeat builds, and keeps renders
// reproducible (same bytes in, same frames out).
const ICON_CACHE_DIR = process.env.ICON_CACHE_DIR ?? "/app/cache/icons";

/** Normalize cache keys: " Sun_Light " → "sun-light" (one file per concept). */
function toCacheKey(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/[\s_.]+/g, "-").replace(/-+/g, "-");
}

/** Iconify search response subset: we only need the first "prefix:name" hit. */
interface IconifySearchResponse {
  icons?: string[]; // e.g. ["mdi:leaf", "lucide:leaf"] — "prefix:name" pairs.
  total?: number;
}

/**
 * Resolve one keyword to raw SVG via Tier 1 → cache → Tier 2.
 *
 * @param keyword - Designer VisualElement.content, e.g. "leaf".
 * @returns Raw `<svg…>` string, or null if every tier misses (caller skips).
 *   Never throws for a miss — throws only on unexpected FS errors; network
 *   failures degrade to null so one bad icon never fails the whole scene.
 */
export async function resolveIcon(keyword: string): Promise<string | null> {
  const key = toCacheKey(keyword);
  if (!key) return null; // Empty keyword — nothing to resolve.

  // --- Step 1 — Tier 1: local Lucide ----------------------------------------
  // Zero-cost fast path: ~1500 common icons (arrows, shapes, nature) live in
  // node_modules. Hit here ⇒ return immediately, no disk/API latency. This
  // ordering also keeps renders deterministic — local SVGs are version-pinned
  // with the Docker image, unlike live API results that can change upstream.
  try {
    const local = await resolveLucideIcon(keyword);
    if (local) return local;
  } catch {
    // Tier 1 I/O hiccup — continue down the chain rather than failing the icon.
  }

  // --- Step 2 — Disk cache --------------------------------------------------
  // Path: ICON_CACHE_DIR/{key}.svg (e.g. /app/cache/icons/leaf.svg).
  // Why BEFORE the API: a prior video already paid the search+fetch cost for
  // this keyword — re-reading bytes is ~1ms vs ~500ms + quota. Cache files are
  // content-addressed by normalized keyword, so "Leaf" and "leaf" share one
  // entry. Corrupt/empty files are ignored (treated as miss → re-fetch).
  const cachePath = path.join(ICON_CACHE_DIR, `${key}.svg`);
  try {
    const cached = await readFile(cachePath, "utf8");
    if (cached.trim().startsWith("<svg")) return cached;
  } catch {
    // ENOENT (first sight of this keyword) — proceed to Tier 2.
  }

  // --- Step 3 — Tier 2: Iconify API (search → fetch → cache) ----------------
  // Fallback reasoning: Iconify aggregates 200k+ icons across sets (mdi, ph,
  // tabler…), covering the long tail Lucide lacks ("photosynthesis", brand
  // marks). Two calls: (a) search returns "prefix:name"; (b) direct SVG fetch
  // returns render-ready markup. Result is cached to disk so this 2-call cost
  // is paid exactly ONCE per keyword for all future videos.
  try {
    // (a) Search: limit=1 — we take the top relevance hit. Designers emit
    // generic nouns ("leaf"), so top-hit precision is high; fancier ranking
    // (icon counts, set preference) is future work, not correctness.
    const search = await axios.get<IconifySearchResponse>(
      "https://api.iconify.design/search",
      { params: { query: key, limit: 1 }, timeout: 10_000 },
    );
    const hit = search.data.icons?.[0];
    if (!hit || !hit.includes(":")) return null; // No match — total miss.

    // (b) Fetch: "prefix:name" → /{prefix}/{name}.svg returns `image/svg+xml`.
    // Split on FIRST colon only (names never contain extra colons, but the
    // guard keeps malformed hits from producing a bad URL).
    const sep = hit.indexOf(":");
    const prefix = hit.slice(0, sep);
    const name = hit.slice(sep + 1);
    const svgRes = await axios.get<string>(
      `https://api.iconify.design/${prefix}/${name}.svg`,
      { timeout: 10_000, responseType: "text" },
    );
    const svg = typeof svgRes.data === "string" ? svgRes.data : "";
    if (!svg.trim().startsWith("<svg")) return null;

    // (c) Cache: mkdir recursive (first-ever Tier-2 hit creates the tree),
    // then write-through so the NEXT resolveIcon() for this keyword stops at
    // Step 2. Fire-and-forget failures here must not fail the icon — the SVG
    // is already in hand, so a cache-write error only costs a future re-fetch.
    try {
      await mkdir(ICON_CACHE_DIR, { recursive: true });
      await writeFile(cachePath, svg, "utf8");
    } catch {
      // Cache unwritable (read-only mount?) — still return the live SVG.
    }
    return svg;
  } catch {
    // Network down / Iconify 429 / timeout — degrade to null. The compositor
    // skips unresolvable elements (text label remains), so the scene still
    // renders instead of failing the whole video on one decorative icon.
    return null;
  }
}
