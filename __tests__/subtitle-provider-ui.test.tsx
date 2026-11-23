import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SubtitlesSection from "@/components/movie-detail/SubtitlesSection";
import { useSubtitleLanguage } from "@/lib/hooks/useSubtitleLanguage";

vi.mock("@/lib/hooks/useSubtitleLanguage", () => ({ useSubtitleLanguage: vi.fn() }));

function renderSection(downloadAvailable: boolean) {
  vi.mocked(useSubtitleLanguage).mockReturnValue({
    language: "en", setLanguage: vi.fn(), saveLanguage: vi.fn(), loading: false,
    saving: false, error: null, downloadAvailable,
  });
  return renderToStaticMarkup(<SubtitlesSection
    movieTitle="Sample Movie" filePath="/mnt/library/Sample Movie (1999).mp4"
    hasSubtitles={false} subtitlesList={[]} isSubtitleUploading={false}
    isDraggingSub={false} subtitleError={null} isSubtitleDownloading={false}
    subtitleNotice={null} onDragOver={vi.fn()} onDragLeave={vi.fn()} onDrop={vi.fn()}
    onSubtitleUpload={vi.fn()} onSubtitleDownload={vi.fn()}
  />);
}

describe("subtitle provider availability", () => {
  it("explains unavailable downloads while keeping manual search and upload", () => {
    const html = renderSection(false);
    expect(html).toContain("OpenSubtitles is not configured");
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).toContain("Search OpenSubtitles");
    expect(html).toContain('type="file"');
  });

  it("allows downloads when a provider is configured", () => {
    const html = renderSection(true);
    expect(html).not.toContain("OpenSubtitles is not configured");
    expect(html).not.toMatch(/<button[^>]*disabled=""/);
  });
});
