import type { VisualVariable } from "@/lib/visualize";

export function VariableBadges({ variables }: { variables: VisualVariable[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 content-start">
      {variables.map((v) => (
        <span key={v.name} className="font-mono text-xs bg-zinc-900 border border-zinc-700 rounded px-2 py-1">{v.name}={String(v.value)}</span>
      ))}
    </div>
  );
}
