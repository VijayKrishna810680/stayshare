import { CardGridSkeleton, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="container-page py-6">
      <Skeleton className="mb-3 h-4 w-40" />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div className="hidden space-y-3 lg:block">
          <Skeleton className="h-[32rem] w-full rounded-2xl" />
        </div>
        <div>
          <Skeleton className="mb-4 h-8 w-56" />
          <CardGridSkeleton count={6} />
        </div>
      </div>
    </div>
  );
}
