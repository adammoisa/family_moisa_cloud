"use client";

import { trpc } from "@/lib/trpc";

interface FavoriteButtonProps {
  mediaId: string;
  variant?: "card" | "lightbox";
}

export function FavoriteButton({ mediaId, variant = "card" }: FavoriteButtonProps) {
  const utils = trpc.useUtils();
  const { data } = trpc.favorites.isFavorited.useQuery({ mediaId });
  const toggle = trpc.favorites.toggle.useMutation({
    onMutate: async () => {
      await utils.favorites.isFavorited.cancel({ mediaId });
      const prev = utils.favorites.isFavorited.getData({ mediaId });
      utils.favorites.isFavorited.setData({ mediaId }, (old) =>
        old ? { favorited: !old.favorited } : { favorited: true }
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        utils.favorites.isFavorited.setData({ mediaId }, context.prev);
      }
    },
    onSettled: () => {
      utils.favorites.isFavorited.invalidate({ mediaId });
      utils.favorites.list.invalidate();
    },
  });

  const isFav = data?.favorited ?? false;

  if (variant === "lightbox") {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggle.mutate({ mediaId });
        }}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors ${
          isFav
            ? "text-red-400 hover:text-red-300 hover:bg-white/10"
            : "text-white/70 hover:text-white hover:bg-white/10"
        }`}
      >
        <svg
          className="size-4"
          fill={isFav ? "currentColor" : "none"}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
          />
        </svg>
        {isFav ? "Favorited" : "Favorite"}
      </button>
    );
  }

  // Card variant - small heart overlay
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        toggle.mutate({ mediaId });
      }}
      className={`absolute top-2 right-2 z-10 rounded-full p-1.5 transition-all ${
        isFav
          ? "bg-red-500/80 text-white opacity-100"
          : "bg-black/40 text-white/70 opacity-0 group-hover:opacity-100 hover:bg-black/60 hover:text-white"
      }`}
    >
      <svg
        className="size-3.5"
        fill={isFav ? "currentColor" : "none"}
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      </svg>
    </button>
  );
}
