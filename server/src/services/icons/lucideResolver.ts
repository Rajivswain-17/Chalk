import { readFile } from "fs/promises";
import path from "path";
import { createRequire } from "module";

const localRequire = createRequire(__filename);

function toKebab(keyword: string): string {
  return keyword
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Resolve a common concept from Lucide's installed static SVG collection. */
export async function resolveLucideIcon(keyword: string): Promise<string | null> {
  const iconName = toKebab(keyword);
  if (!iconName) return null;

  try {
    const packagePath = localRequire.resolve("lucide-static/package.json");
    const svgPath = path.join(path.dirname(packagePath), "icons", `${iconName}.svg`);
    const svg = await readFile(svgPath, "utf8");
    return svg.trim().startsWith("<svg") ? svg : null;
  } catch {
    return null;
  }
}
