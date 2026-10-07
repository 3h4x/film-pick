import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import NotInterestedButton from "@/components/movie-detail/NotInterestedButton";
import RatingControls from "@/components/movie-detail/RatingControls";

describe("NotInterestedButton", () => {
  it("offers and shows the not-interested state", () => {
    const off = renderToStaticMarkup(createElement(NotInterestedButton, { dismissed: false, isSaving: false, onToggle: vi.fn() }));
    const on = renderToStaticMarkup(createElement(NotInterestedButton, { dismissed: true, isSaving: false, onToggle: vi.fn() }));
    expect(off).toContain('aria-pressed="false"');
    expect(on).toContain('aria-pressed="true"');
    expect(on).toContain("Click to undo");
  });
});

describe("RatingControls", () => {
  const render = (showRatingPicker: boolean) =>
    renderToStaticMarkup(
      createElement(RatingControls, {
        globalRating: 7.9,
        userRating: 8,
        isRating: false,
        showRatingPicker,
        onTogglePicker: vi.fn(),
        onRate: vi.fn(),
      }),
    );

  it("floats the 1-10 picker under the ♥ badge instead of opening it in the row", () => {
    const html = render(true);
    expect(html).toContain('role="group"');
    expect(html).toContain("absolute left-0 top-full");
    expect(html.match(/title="Rate \d+\/10"/g)).toHaveLength(10);
    expect(html).toContain('aria-expanded="true"');
  });

  it("shows only the badges while closed", () => {
    const html = render(false);
    expect(html).not.toContain('role="group"');
    expect(html).toContain(">♥ 8<");
    expect(html).toContain(">★ 7.9<");
  });
});
