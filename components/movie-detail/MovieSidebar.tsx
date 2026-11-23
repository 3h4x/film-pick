"use client";

import CreditsSection from "@/components/movie-detail/CreditsSection";
import MoviePoster from "@/components/movie-detail/MoviePoster";
import TechnicalDetails from "@/components/movie-detail/TechnicalDetails";
import type {
  PersonRating,
  VideoMetadata,
} from "@/components/movie-detail/types";

interface MovieSidebarProps {
  title: string;
  posterUrl: string | null;
  filePath: string | null;
  showEmbedded: boolean;
  director: string | null;
  writer: string | null;
  actors: string | null;
  isLoadingMetadata: boolean;
  videoMetadata: VideoMetadata | null;
  personRatings: Record<string, PersonRating>;
  onEmbed?: () => void;
  onPersonClick?: (name: string) => void;
}

export default function MovieSidebar({
  title,
  posterUrl,
  filePath,
  showEmbedded,
  director,
  writer,
  actors,
  isLoadingMetadata,
  videoMetadata,
  personRatings,
  onEmbed,
  onPersonClick,
}: MovieSidebarProps) {
  return (
    <div className="order-2 lg:order-1 lg:col-span-4 space-y-6">
      <MoviePoster
        title={title}
        posterUrl={posterUrl}
        filePath={filePath}
        showEmbedded={showEmbedded}
        onEmbed={onEmbed}
      />

      <CreditsSection
        director={director}
        writer={writer}
        actors={actors}
        isLoadingMetadata={isLoadingMetadata}
        personRatings={personRatings}
        onPersonClick={onPersonClick}
      />

      <TechnicalDetails
        videoMetadata={videoMetadata}
        isLoadingMetadata={isLoadingMetadata}
      />
    </div>
  );
}
