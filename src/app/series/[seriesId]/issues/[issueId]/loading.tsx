'use client'

import { Skeleton, SkeletonText } from '@/components/ui/LoadingSpinner'

export default function IssueEditorLoading() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="flex h-screen">
        {/* Left column - Navigation skeleton */}
        <div className="w-64 border-r border-zinc-800 p-4 space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <div className="space-y-2 mt-6">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-5 w-5/6 ml-4" />
            <Skeleton className="h-5 w-4/6 ml-8" />
            <Skeleton className="h-5 w-5/6 ml-4" />
            <Skeleton className="h-5 w-4/6 ml-8" />
          </div>
          <div className="space-y-2 mt-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-5 w-5/6 ml-4" />
            <Skeleton className="h-5 w-4/6 ml-8" />
          </div>
        </div>

        {/* Center column - Editor skeleton */}
        <div className="flex-1 p-6 space-y-6">
          <Skeleton className="h-10 w-1/3" />
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-4">
            <Skeleton className="h-6 w-1/4" />
            <SkeletonText lines={4} />
            <div className="border-t border-zinc-800 pt-4 mt-4">
              <Skeleton className="h-5 w-1/5 mb-2" />
              <Skeleton className="h-8 w-full" />
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-4">
            <Skeleton className="h-6 w-1/4" />
            <SkeletonText lines={3} />
          </div>
        </div>

        {/* Right column - Toolkit skeleton */}
        <div className="w-80 border-l border-zinc-800 p-4 space-y-4">
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
          <div className="space-y-3 mt-4">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
