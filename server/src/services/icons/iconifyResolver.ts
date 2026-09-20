import axios from "axios";
import { createHash } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { env } from "../../lib/env";
import { resolveLucideIcon } from "./lucideResolver";

interface IconifySearchResponse {
  icons?: string[];
}

function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 100);
}

function cacheName(keyword: string): string {
  return `${createHash("sha256").update(keyword).digest("hex")}.svg`;
}

/** Remove active/external SVG content before it is passed to Chromium. */
function sanitizeSvg(svg: string): string | null {
  if (Buffer.byteLength(svg, "utf8") > 500_000) return null;
  let safe = svg.trim();
  if (!safe.startsWith("<svg") || !safe.endsWith("</svg>")) return null;
  safe = safe
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/\s(?:href|xlink:href)\s*=\s*("(?:https?:|data:|javascript:)[^"]*"|'(?:https?:|data:|javascript:)[^']*')/gi, "");
  return safe;
}

/** Resolve Lucide locally, then a disk cache, then Iconify as the final tier. */
export async function resolveIcon(keyword: string): Promise<string | null> {
  const normalized = normalizeKeyword(keyword);
  if (!normalized) return null;

  const local = await resolveLucideIcon(normalized);
  if (local) return sanitizeSvg(local);

  const cachePath = path.join(env.ICON_CACHE_DIR, cacheName(normalized));
  try {
    const cached = sanitizeSvg(await readFile(cachePath, "utf8"));
    if (cached) return cached;
  } catch {
    // A cache miss is expected for a concept that has not been rendered before.
  }

  try {
    const search = await axios.get<IconifySearchResponse>(
      "https://api.iconify.design/search",
      { params: { query: normalized, limit: 32 }, timeout: 10_000 },
    );
    const hit = search.data.icons?.[0];
    if (!hit || !/^[a-z0-9-]+:[a-z0-9-]+$/i.test(hit)) return null;

    const [prefix, name] = hit.split(":", 2);
    const response = await axios.get<string>(
      `https://api.iconify.design/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`,
      { timeout: 10_000, responseType: "text", maxContentLength: 500_000 },
    );
    const svg = sanitizeSvg(typeof response.data === "string" ? response.data : "");
    if (!svg) return null;

    try {
      await mkdir(env.ICON_CACHE_DIR, { recursive: true });
      const temporaryPath = `${cachePath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, svg, "utf8");
      await rename(temporaryPath, cachePath);
    } catch {
      // Rendering can continue with the downloaded SVG if caching is unavailable.
    }
    return svg;
  } catch {
    return null;
  }
}
