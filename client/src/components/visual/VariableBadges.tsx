export function VariableBadges({ variables }: { variables: Record<string, string | number | null> }) {
  return (
    <div className="flex flex-wrap gap-1.5 content-start">
      {Object.entries(variables).map(([k, v]) => (
        <span key={k} className="font-mono text-xs bg-zinc-900 border border-zinc-700 rounded px-2 py-1">{k}={String(v)}</span>
      ))}
    </div>
  );
}
