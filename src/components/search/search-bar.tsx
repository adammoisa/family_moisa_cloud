"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export function SearchBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: tagResults } = trpc.tags.autocomplete.useQuery(
    { query },
    { enabled: open && query.length > 0 }
  );

  const { data: mediaResults } = trpc.media.search.useQuery(
    { query, limit: 5 },
    { enabled: open && query.length > 1 }
  );

  const { data: clipResults } = trpc.clips.search.useQuery(
    { query, limit: 3 },
    { enabled: open && query.length > 1 }
  );

  // Build flat list of results for keyboard navigation
  const allResults: { label: string; value: string; type: string; category?: string }[] = [];
  if (tagResults) {
    for (const tag of tagResults) {
      allResults.push({
        label: tag.name,
        value: `/search?tag=${tag.slug}&category=${tag.category}`,
        type: "tag",
        category: tag.category,
      });
    }
  }
  if (clipResults) {
    for (const clip of clipResults) {
      allResults.push({
        label: clip.title,
        value: `/clips?play=${clip.id}`,
        type: "clip",
      });
    }
  }
  if (mediaResults) {
    for (const item of mediaResults) {
      allResults.push({
        label: item.title || item.filename,
        value: `/search?q=${encodeURIComponent(item.title || item.filename)}`,
        type: item.type,
      });
    }
  }
  if (query.length > 1) {
    allResults.push({
      label: `Search all for "${query}"`,
      value: `/search?q=${encodeURIComponent(query)}`,
      type: "action",
    });
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = useCallback(
    (value: string) => {
      setOpen(false);
      setQuery("");
      router.push(value);
    },
    [router]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, allResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && allResults[selectedIndex]) {
      handleSelect(allResults[selectedIndex].value);
    }
  };

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

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          {/* Search panel */}
          <div
            ref={containerRef}
            className="fixed top-[20%] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 rounded-xl border bg-popover shadow-2xl"
          >
            <div className="flex items-center border-b px-3">
              <svg className="size-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search photos, people, places..."
                className="flex-1 bg-transparent px-3 py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
              <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
                ESC
              </kbd>
            </div>

            {allResults.length > 0 && (
              <div className="max-h-72 overflow-y-auto p-1">
                {tagResults && tagResults.length > 0 && (
                  <div className="px-2 py-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Tags</p>
                  </div>
                )}
                {tagResults?.map((tag, i) => (
                  <button
                    key={`tag-${tag.id}`}
                    onClick={() => handleSelect(`/search?tag=${tag.slug}&category=${tag.category}`)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                      selectedIndex === i ? "bg-muted text-foreground" : "text-foreground/80 hover:bg-muted/50"
                    }`}
                  >
                    <Badge
                      variant="secondary"
                      className={`text-[10px] ${categoryColors[tag.category] || ""}`}
                    >
                      {tag.category}
                    </Badge>
                    {tag.name}
                  </button>
                ))}

                {clipResults && clipResults.length > 0 && (
                  <div className="px-2 py-1.5 mt-1">
                    <p className="text-xs font-medium text-muted-foreground">Clips</p>
                  </div>
                )}
                {clipResults?.map((clip, i) => {
                  const idx = (tagResults?.length || 0) + i;
                  return (
                    <button
                      key={`clip-${clip.id}`}
                      onClick={() => handleSelect(`/clips?play=${clip.id}`)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                        selectedIndex === idx ? "bg-muted text-foreground" : "text-foreground/80 hover:bg-muted/50"
                      }`}
                    >
                      <svg className="size-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
                      </svg>
                      <span className="truncate">{clip.title}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{clip.mediaTitle}</span>
                    </button>
                  );
                })}

                {mediaResults && mediaResults.length > 0 && (
                  <div className="px-2 py-1.5 mt-1">
                    <p className="text-xs font-medium text-muted-foreground">Photos & Videos</p>
                  </div>
                )}
                {mediaResults?.map((item, i) => {
                  const idx = (tagResults?.length || 0) + (clipResults?.length || 0) + i;
                  return (
                    <button
                      key={`media-${item.id}`}
                      onClick={() =>
                        handleSelect(`/search?q=${encodeURIComponent(item.title || item.filename)}`)
                      }
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                        selectedIndex === idx ? "bg-muted text-foreground" : "text-foreground/80 hover:bg-muted/50"
                      }`}
                    >
                      <svg className="size-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        {item.type === "video" ? (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        )}
                      </svg>
                      <span className="truncate">{item.title || item.filename}</span>
                    </button>
                  );
                })}

                {query.length > 1 && (
                  <>
                    <div className="my-1 h-px bg-border" />
                    <button
                      onClick={() => handleSelect(`/search?q=${encodeURIComponent(query)}`)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                        selectedIndex === allResults.length - 1
                          ? "bg-muted text-foreground"
                          : "text-foreground/80 hover:bg-muted/50"
                      }`}
                    >
                      <svg className="size-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      Search all for &quot;{query}&quot;
                    </button>
                  </>
                )}
              </div>
            )}

            {query.length > 0 && allResults.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No results found.
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
