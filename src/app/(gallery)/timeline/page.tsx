"use client";

import { trpc } from "@/lib/trpc";
import { MasonryGrid } from "@/components/gallery/masonry-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function TimelinePage() {
  const { data: yearTags, isLoading: loadingTags } =
    trpc.tags.getCounts.useQuery({ category: "year" });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold tracking-tight">Timeline</h1>

      {loadingTags ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24" />
          ))}
        </div>
      ) : yearTags && yearTags.length > 0 ? (
        <div className="space-y-12">
          {yearTags
            .sort((a, b) => b.tagName.localeCompare(a.tagName))
            .map((year) => (
              <YearSection key={year.tagId} tagId={year.tagId} year={year.tagName} count={year.count} />
            ))}
        </div>
      ) : (
        <p className="text-muted-foreground">
          No timeline data available. Run the seed script to populate year tags.
        </p>
      )}
    </div>
  );
}

function YearSection({
  tagId,
  year,
  count,
}: {
  tagId: string;
  year: string;
  count: number;
}) {
  const { data, isLoading } = trpc.media.list.useQuery({
    tagIds: [tagId],
    limit: 20,
  });

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-bold">{year}</h2>
        <Badge variant="secondary">{count} items</Badge>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <MasonryGrid
          items={data.items.map((m) => ({
            id: m.id,
            title: m.title,
            filename: m.filename,
            type: m.type,
            thumbnailUrl: m.thumbnailUrl,
            thumbnailFrameUrls: m.thumbnailFrameUrls,
            albumId: m.albumId,
          }))}
        />
      ) : null}
    </section>
  );
}
