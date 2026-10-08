import { cn } from "@/lib/utils";

interface ProgressProps {
  value: number;
  max?: number;
  className?: string;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

export function Progress({
  value,
  max = 100,
  className,
  showLabel = false,
  size = "md",
}: ProgressProps) {
  const percentage = Math.min(Math.round((value / max) * 100), 100);

  const heights = {
    sm: "h-1.5",
    md: "h-2",
    lg: "h-3",
  };

  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <div className="flex justify-between text-sm mb-1">
          <span className="text-slate-600">进度</span>
          <span className="font-medium text-slate-900">{percentage}%</span>
        </div>
      )}
      <div
        className={cn(
          "w-full bg-slate-200 rounded-full overflow-hidden",
          heights[size]
        )}
      >
        <div
          className="h-full bg-blue-600 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
