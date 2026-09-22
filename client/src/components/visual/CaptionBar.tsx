export function CaptionBar({ title, subtitle, explanation }: { title: string; subtitle?: string; explanation: string }) {
  return (
    <div className="min-h-[72px] px-6 py-4 border-t border-neutral-800/60 bg-[#0e1018] flex flex-col gap-1">
      <p className="text-base font-semibold text-white tracking-wide">
        {title}
        {subtitle ? <span className="text-neutral-400 font-normal"> — {subtitle}</span> : null}
      </p>
      <p className="text-base sm:text-lg font-medium text-neutral-200 leading-relaxed max-w-5xl select-text">
        {explanation}
      </p>
    </div>
  );
}
