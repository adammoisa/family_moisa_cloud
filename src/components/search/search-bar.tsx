"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";

export function SearchBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  const { data: tagResults } = trpc.tags.autocomplete.useQuery(
    { query },
    { enabled: query.length > 0 }
  );

  const { data: mediaResults } = trpc.media.search.useQuery(
    { query, limit: 5 },
    { enabled: query.length > 1 }
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = useCallback(
    (value: string) => {
      setOpen(false);
      setQuery("");
      router.push(value);
    },
    [router]
  );

  const categoryColors: Record<string, string> = {
    person: "bg-blue-500/10 text-blue-500",
    location: "bg-green-500/10 text-green-500",
    event: "bg-purple-500/10 text-purple-500",
    year: "bg-amber-500/10 text-amber-500",
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors w-full max-w-sm"
      >
        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span>Search photos, people, places...</span>
        <kbd className="pointer-events-none ml-auto hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">&#x2318;</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search photos, people, places..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {tagResults && tagResults.length > 0 && (
            <CommandGroup heading="Tags">
              {tagResults.map((tag) => (
                <CommandItem
                  key={tag.id}
                  value={`tag-${tag.slug}`}
                  onSelect={() =>
                    handleSelect(`/search?tag=${tag.slug}&category=${tag.category}`)
                  }
                >
                  <Badge
                    variant="secondary"
                    className={`mr-2 ${categoryColors[tag.category] || ""}`}
                  >
                    {tag.category}
                  </Badge>
                  {tag.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {mediaResults && mediaResults.length > 0 && (
            <CommandGroup heading="Photos & Videos">
              {mediaResults.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`media-${item.id}`}
                  onSelect={() => handleSelect(`/albums/${item.albumId}?media=${item.id}`)}
                >
                  <span className="mr-2">
                    {item.type === "video" ? (
                      <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    )}
                  </span>
                  {item.title || item.filename}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {query.length > 1 && (
            <CommandGroup heading="Actions">
              <CommandItem
                value="search-all"
                onSelect={() => handleSelect(`/search?q=${encodeURIComponent(query)}`)}
              >
                <svg className="size-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Search all for &quot;{query}&quot;
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
