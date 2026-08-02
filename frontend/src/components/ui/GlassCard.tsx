"use client";
import { cn } from "@/lib/utils";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
}

export default function GlassCard({ glow = false, className, children, ...props }: GlassCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border border-white/[0.06] bg-neutral-900/60 backdrop-blur-md",
        className
      )}
      {...props}
    >
      {glow && (
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
      )}
      {children}
    </div>
  );
}
