// ============================================================================
// Chalk — Tier 1 Lucide resolver (Chalk/server/src/services/icons/lucideResolver.ts)
// ----------------------------------------------------------------------------
// Fast offline path: AI icon keywords ("leaf", "sun") → raw SVG strings from
// the locally installed Lucide package. No network, no quota, deterministic.
// Returns null on miss so the master resolver can fall through to disk cache
// → Iconify API (Tier 2). Never throws for a miss — miss is a normal outcome.
// ============================================================================

import { readFile } from "fs/promises"; // Async SVG reads (non-blocking).
import path from "path"; // Package-dir + filename joins.
import { createRequire } from "module"; // Resolve lucide package location.

// require() bound to this file, so package lookups start at server/.
// Used to locate `lucide-static` / `lucide` on disk without importing them
// (importing every icon up front would bloat worker memory).
// NOTE: CJS build (module: CommonJS), so __filename exists at runtime.
const require = createRequire(__filename);

/**
 * Normalize a designer keyword into Lucide's kebab-case file names.
 * - "Leaf" → "leaf" | "  Sun Light " → "sun-light" | "arrowRight" → "arrow-right"
 * Lowercasing + collapsing separators covers the three ways the sceneDesigner
 * emits keywords (Title Case, spaces, camelCase). Dots/underscores collapse too.
 */
function toKebab(keyword: string): string {
  return (
    keyword
      .trim()
      .toLowerCase()
      // camelCase boundary → hyphen: "arrowRight" → "arrow-right".
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase()
      // spaces/underscores/dots → hyphen, collapse repeats, trim edges.
      .replace(/[\s_.]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

/** camelCase variant ("sun-light" → "sunLight") — tried for ESM icon registries. */
function toCamel(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Resolve one keyword to a raw Lucide SVG string (Tier 1, offline).
 *
 * @param keyword - Designer `content` value, e.g. "leaf", "Arrow Right".
 * @returns Raw `<svg …>…</svg>` string, or null when no local icon matches.
 *
 * --- Lucide package layout (why raw file reads) ---
 * - `lucide-static/icons/<kebab>.svg` — one plain SVG per icon (PREFERRED:
 *   file is already the exact string the compositor inlines into Remotion).
 * - `lucide/dist/esm/icons/<kebab>.js` — ESM module exporting icon-node data
 *   (used only as a fallback probe: existence ⇒ known icon name).
 * Reading the .svg file avoids importing React (`lucide-react` returns
 * components, not strings, and would need server-side rendering to extract
 * markup). File I/O keeps this resolver framework-free and worker-safe.
 */
export async function resolveLucideIcon(
  keyword: string,
): Promise<string | null> {
  const kebab = toKebab(keyword);
  if (!kebab) return null; // Empty/whitespace keyword — nothing to look up.

  // --- Attempt 1: lucide-static raw SVG (fast path) -------------------------
  // Typical install: server/node_modules/lucide-static/icons/leaf.svg.
  // require.resolve(".../package.json") yields the package root without
  // executing any code — safe even when the package is ESM-only.
  try {
    const pkgJson = require.resolve("lucide-static/package.json");
    const svgPath = path.join(path.dirname(pkgJson), "icons", `${kebab}.svg`);
    return await readFile(svgPath, "utf8");
  } catch {
    // Miss OR package not installed — fall through to attempt 2, never throw.
  }

  // --- Attempt 2: `lucide` ESM icon module probe ----------------------------
  // Layout: lucide/dist/esm/icons/<kebab>.js exporting the icon node.
  // We only check EXISTENCE here (readable file ⇒ known icon); the actual SVG
  // markup still comes from attempt 1 on setups that ship both. If only the
  // JS module exists, surface a null so Tier 2 (Iconify) supplies the markup
  // rather than us hand-assembling <path> tags from icon-node arrays (fragile
  // across Lucide versions — attribute order/shape changes break snapshots).
  try {
    const pkgJson = require.resolve("lucide/package.json");
    const pkgDir = path.dirname(pkgJson);
    const candidates = [
      path.join(pkgDir, "dist", "esm", "icons", `${kebab}.js`),
      path.join(pkgDir, "dist", "esm", "icons", `${toCamel(kebab)}.js`),
    ];
    for (const p of candidates) {
      try {
        await readFile(p, "utf8"); // Existence probe only.
        // Known name but no pre-rendered SVG on disk → defer to Tier 2.
        return null;
      } catch {
        continue;
      }
    }
  } catch {
    // `lucide` package absent entirely — Tier 2 will handle it.
  }

  // Total Tier-1 miss: master resolver proceeds to disk cache → Iconify API.
  return null;
}
