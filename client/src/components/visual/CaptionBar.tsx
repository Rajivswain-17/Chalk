export function CaptionBar({ title, subtitle, explanation }: { title: string; subtitle?: string; explanation: string }) {
  return (
    <div className="px-4 py-3 border-t border-zinc-800">
      <p className="text-sm font-medium">{title}{subtitle ? <span className="text-zinc-400"> — {subtitle}</span> : null}</p>
      <p className="text-sm text-zinc-300">{explanation}</p>
    </div>
  );
}
