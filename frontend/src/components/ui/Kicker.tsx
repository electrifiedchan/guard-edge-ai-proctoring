import { cn } from "@/lib/utils";

interface KickerProps {
  children: React.ReactNode;
  className?: string;
}

export default function Kicker({ children, className }: KickerProps) {
  return (
    <p className={cn("text-[11px] font-mono uppercase tracking-[0.2em] text-neutral-500", className)}>
      {children}
    </p>
  );
}
