"use client";

import { use } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { AlbumCard } from "@/components/gallery/album-card";
import { MasonryGrid } from "@/components/gallery/masonry-grid";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export default function AlbumDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { data, isLoading } = trpc.albums.getBySlug.useQuery({
    slug,
    limit: 60,
  });

  const { data: breadcrumbs } = trpc.albums.getBreadcrumbs.useQuery(
    { albumId: data?.album?.id ?? "" },
    { enabled: !!data?.album?.id }
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {Array.from({ length: 18 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return <p className="text-muted-foreground">Album not found.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 1 && (
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/albums" />}>Albums</BreadcrumbLink>
            </BreadcrumbItem>
            {breadcrumbs.map((crumb, i) => (
              <BreadcrumbItem key={crumb.id}>
                <BreadcrumbSeparator />
                {i === breadcrumbs.length - 1 ? (
                  <BreadcrumbPage>{crumb.title}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link href={`/albums/${crumb.slug}`} />}>{crumb.title}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {data.album.title}
        </h1>
        {data.album.description && (
          <p className="text-muted-foreground mt-1">{data.album.description}</p>
        )}
      </div>

      {/* Child albums */}
      {data.children.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">
            Sub-albums
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {data.children.map((child) => (
              <AlbumCard
                key={child.id}
                slug={child.slug}
                title={child.title}
                mediaCount={child.mediaCount}
                coverUrl={child.coverUrl}
              />
            ))}
          </div>
        </section>
      )}

      {/* Media grid */}
      {data.media.length > 0 && (
        <MasonryGrid
          items={data.media.map((m) => ({
            id: m.id,
            title: m.title,
            filename: m.filename,
            type: m.type,
            thumbnailUrl: m.thumbnailUrl,
            thumbnailFrameUrls: m.thumbnailFrameUrls,
            albumId: m.albumId,
          }))}
          hasMore={!!data.nextCursor}
        />
      )}

      {data.media.length === 0 && data.children.length === 0 && (
        <p className="text-muted-foreground">This album is empty.</p>
      )}
    </div>
  );
}
