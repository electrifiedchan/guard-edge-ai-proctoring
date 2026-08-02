import { cn } from "@/lib/utils";

interface StatProps {
  value: string | number;
  label: string;
  delta?: string;
  deltaUp?: boolean;
  className?: string;
}

export default function Stat({ value, label, delta, deltaUp, className }: StatProps) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="font-mono text-2xl text-neutral-100">{value}</span>
      <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-neutral-500">{label}</span>
      {delta && (
        <span className={cn("text-[11px] font-mono", deltaUp ? "text-emerald-400" : "text-red-400")}>
          {delta}
        </span>
      )}
    </div>
  );
}
