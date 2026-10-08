export function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  };

  return (
    <div className="flex items-center justify-center p-8">
      <div
        className={`${sizes[size]} border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin`}
      />
    </div>
  );
}

export function LoadingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <LoadingSpinner size="lg" />
      <p className="text-slate-500">加载中...</p>
    </div>
  );
}

export function LoadingCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse">
      <div className="h-4 bg-slate-200 rounded w-1/4 mb-4"></div>
      <div className="space-y-3">
        <div className="h-3 bg-slate-200 rounded"></div>
        <div className="h-3 bg-slate-200 rounded w-5/6"></div>
        <div className="h-3 bg-slate-200 rounded w-4/6"></div>
      </div>
    </div>
  );
}
