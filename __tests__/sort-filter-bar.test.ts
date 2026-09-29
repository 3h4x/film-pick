// tamtam inspected 2026-05-21
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SortFilterBar, {
  scrollActiveSortChipIntoView,
} from "@/components/SortFilterBar";

type FakeButton = Pick<HTMLButtonElement, "offsetLeft" | "offsetWidth">;

interface FakeContainer {
  clientWidth: number;
  scrollLeft: number;
  scrollWidth: number;
  querySelector: (selector: string) => HTMLButtonElement | null;
  querySelectorAll: (selector: string) => HTMLButtonElement[];
  scrollTo: (options: { left: number }) => void;
}

function createButton(offsetLeft: number, offsetWidth: number): FakeButton {
  return {
    offsetLeft,
    offsetWidth,
  };
}

function createContainer({
  buttons,
  activeIndex,
  clientWidth,
  scrollLeft,
  scrollWidth,
}: {
  buttons: FakeButton[];
  activeIndex: number;
  clientWidth: number;
  scrollLeft: number;
  scrollWidth: number;
}) {
  const scrollTo = vi.fn();
  const activeButton = buttons[activeIndex] as HTMLButtonElement;
  const sortButtons = buttons as HTMLButtonElement[];
  const container: FakeContainer = {
    clientWidth,
    scrollLeft,
    scrollWidth,
    querySelector: (selector) =>
      selector === '[data-active="true"]' ? activeButton : null,
    querySelectorAll: (selector) =>
      selector === "button[data-active]" ? sortButtons : [],
    scrollTo,
  };

  return {
    container: container as unknown as HTMLDivElement,
    scrollTo,
  };
}

function renderSortFilterBar(
  sortDir: "asc" | "desc",
  overrides: Partial<ComponentProps<typeof SortFilterBar>> = {},
) {
  return renderToStaticMarkup(
    createElement(SortFilterBar, {
      sort: "created_at",
      sortDir,
      genre: "",
      genres: [],
      source: "",
      sources: [],
      year: "",
      years: [],
      runtime: "",
      language: "",
      languages: [],
      unratedOnly: false,
      hasFileOnly: false,
      onSortChange: vi.fn(),
      onSortDirChange: vi.fn(),
      onGenreChange: vi.fn(),
      onSourceChange: vi.fn(),
      onYearChange: vi.fn(),
      onRuntimeChange: vi.fn(),
      onLanguageChange: vi.fn(),
      onUnratedChange: vi.fn(),
      onHasFileChange: vi.fn(),
      ...overrides,
    }),
  );
}

describe("SortFilterBar runtime and language filters", () => {
  it("always offers the runtime buckets", () => {
    const html = renderSortFilterBar("desc");

    expect(html).toContain('aria-label="Filter by runtime"');
    expect(html).toContain("Under 90 min");
    expect(html).toContain("90–120 min");
    expect(html).toContain("Over 120 min");
  });

  it("hides the language filter until a movie has a language", () => {
    expect(renderSortFilterBar("desc")).not.toContain("Filter by original language");
  });

  it("lists library languages by name", () => {
    const html = renderSortFilterBar("desc", { languages: ["en", "pl"], language: "pl" });

    expect(html).toContain('aria-label="Filter by original language"');
    expect(html).toContain('<option value="en">English</option>');
    expect(html).toMatch(/<option value="pl" selected="">Polish<\/option>/);
  });
});

describe("SortFilterBar accessibility", () => {
  it("labels the descending state toggle with the ascending action", () => {
    const html = renderSortFilterBar("desc");

    expect(html).toContain('aria-label="Switch to ascending sort"');
    expect(html).not.toContain('aria-label="Sort in descending order"');
  });

  it("labels the ascending state toggle with the descending action", () => {
    const html = renderSortFilterBar("asc");

    expect(html).toContain('aria-label="Switch to descending sort"');
    expect(html).not.toContain('aria-label="Sort in ascending order"');
  });
});

describe("scrollActiveSortChipIntoView", () => {
  it("snaps rightward far enough to clear the trailing mobile controls", () => {
    const { container, scrollTo } = createContainer({
      buttons: [
        createButton(0, 50),
        createButton(60, 50),
        createButton(120, 50),
        createButton(180, 30),
      ],
      activeIndex: 3,
      clientWidth: 100,
      scrollLeft: 0,
      scrollWidth: 320,
    });

    scrollActiveSortChipIntoView(container, 390);

    expect(scrollTo).toHaveBeenCalledWith({ left: 220 });
  });

  it("snaps leftward to the last boundary that keeps the active chip visible", () => {
    const { container, scrollTo } = createContainer({
      buttons: [
        createButton(0, 50),
        createButton(60, 50),
        createButton(120, 50),
        createButton(180, 50),
      ],
      activeIndex: 1,
      clientWidth: 100,
      scrollLeft: 150,
      scrollWidth: 260,
    });

    scrollActiveSortChipIntoView(container, 390);

    expect(scrollTo).toHaveBeenCalledWith({ left: 60 });
  });

  it("does not scroll when the active chip is already fully visible", () => {
    const { container, scrollTo } = createContainer({
      buttons: [
        createButton(0, 50),
        createButton(60, 50),
        createButton(120, 50),
      ],
      activeIndex: 1,
      clientWidth: 160,
      scrollLeft: 0,
      scrollWidth: 210,
    });

    scrollActiveSortChipIntoView(container, 1024);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("accounts for trailing mobile controls after the last sort chip", () => {
    const { container, scrollTo } = createContainer({
      buttons: [
        createButton(0, 50),
        createButton(60, 50),
        createButton(120, 50),
        createButton(180, 50),
      ],
      activeIndex: 3,
      clientWidth: 100,
      scrollLeft: 0,
      scrollWidth: 290,
    });

    scrollActiveSortChipIntoView(container, 390);

    expect(scrollTo).toHaveBeenCalledWith({ left: 190 });
  });
});
