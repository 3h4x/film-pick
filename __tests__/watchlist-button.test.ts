import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import WatchlistButton from "@/components/movie-detail/WatchlistButton";

function render(onWatchlist: boolean, isSaving = false) {
  return renderToStaticMarkup(
    createElement(WatchlistButton, { onWatchlist, isSaving, onToggle: vi.fn() }),
  );
}

describe("WatchlistButton", () => {
  it("offers to add a film that is not on the watchlist", () => {
    const html = render(false);
    expect(html).toContain("Want to watch");
    expect(html).toContain('aria-pressed="false"');
  });

  it("shows a film already on the watchlist as pressed", () => {
    const html = render(true);
    expect(html).toContain("On watchlist");
    expect(html).toContain('aria-pressed="true"');
  });

  it("is disabled while saving", () => {
    expect(render(false, true)).toContain("disabled");
  });
});
