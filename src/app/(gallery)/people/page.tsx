"use client";

import Link from "next/link";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";

export default function PeoplePage() {
  const { data: people, isLoading } = trpc.people.list.useQuery();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">People</h1>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      ) : people && people.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {people.map((person) => (
            <PersonCard key={person.id} person={person} />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">No people tagged yet.</p>
      )}
    </div>
  );
}

function PersonCard({
  person,
}: {
  person: {
    id: string;
    name: string;
    slug: string;
    mediaCount: number;
    coverUrl: string | null;
  };
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <Link
      href={`/people/${person.slug}`}
      className="group relative overflow-hidden rounded-xl bg-muted aspect-square block"
    >
      {person.coverUrl ? (
        <>
          {!loaded && <Skeleton className="absolute inset-0" />}
          <img
            src={person.coverUrl}
            alt={person.name}
            loading="lazy"
            className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${loaded ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setLoaded(true)}
          />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <svg className="size-16 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4">
        <h3 className="text-sm font-medium text-white">{person.name}</h3>
        <p className="text-xs text-white/70">
          {person.mediaCount} {person.mediaCount === 1 ? "photo" : "photos"}
        </p>
      </div>
    </Link>
  );
}
