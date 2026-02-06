interface SkeletonLoaderProps {
  type?: "card" | "table" | "chart";
  count?: number;
}

export function SkeletonLoader({
  type = "card",
  count = 3,
}: SkeletonLoaderProps) {
  if (type === "table") {
    return (
      <div className="space-y-2">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="h-4 bg-base-300 rounded w-16" />
            <div className="h-4 bg-base-300 rounded flex-1" />
            <div className="h-4 bg-base-300 rounded w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (type === "chart") {
    return (
      <div className="animate-pulse">
        <div className="h-48 bg-base-300 rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card bg-base-100 shadow-sm p-4 animate-pulse">
          <div className="flex gap-3 items-center">
            <div className="h-8 w-20 bg-base-300 rounded" />
            <div className="h-4 bg-base-300 rounded flex-1" />
            <div className="h-8 w-24 bg-base-300 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
