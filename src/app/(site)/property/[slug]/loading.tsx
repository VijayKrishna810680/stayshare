import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="container-page py-6" aria-busy="true" aria-label="Loading property">
      <Skeleton className="mb-3 h-4 w-64" />
      <Skeleton className="h-8 w-80" />
      <Skeleton className="mt-2 h-4 w-48" />
      <Skeleton className="mt-4 h-64 w-full rounded-3xl sm:h-[26rem]" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
        <Skeleton className="hidden h-[28rem] w-full rounded-2xl lg:block" />
      </div>
    </div>
  );
}
