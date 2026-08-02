"use client";

export default function CellStar() {
  const questions = [
    "Describe a time you led under pressure.",
    "Tell me about a conflict you resolved.",
    "Walk me through a complex decision.",
  ];
  return (
    <div className="flex flex-col gap-3 p-8 h-full">
      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">Questions · STAR Engine</span>
      <div className="flex-1 rounded-xl bg-neutral-950 border border-white/[0.06] px-4 flex flex-col justify-center divide-y divide-white/[0.06]">
        {questions.map((q, i) => (
          <div key={i} className="flex items-start gap-2.5 py-3">
            <span className="font-mono text-[10px] text-emerald-400/60 mt-0.5">0{i + 1}</span>
            <span className="font-sans text-[13px] tracking-normal text-neutral-300">{q}</span>
          </div>
        ))}
      </div>
      <p className="font-sans text-[13px] tracking-normal text-neutral-400">Resume-aware STAR question generation — tailored to your experience.</p>
    </div>
  );
}
