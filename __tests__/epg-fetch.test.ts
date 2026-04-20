import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getMemCache,
  setMemCache,
  invalidateMemCache,
  type EpgCache,
} from "@/lib/epg-fetch";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeCache(overrides: Partial<EpgCache> = {}): EpgCache {
  return {
    channels: [],
    programs: [],
    cachedAt: new Date().toISOString(),
    epgUrl: "https://example.com/epg.xml.gz",
    ...overrides,
  };
}

// ── Mem cache ──────────────────────────────────────────────────────────────────

describe("EPG mem cache", () => {
  beforeEach(() => {
    invalidateMemCache();
  });

  afterEach(() => {
    invalidateMemCache();
    vi.useRealTimers();
  });

  it("returns null when cache is empty", () => {
    expect(getMemCache()).toBeNull();
  });

  it("returns data immediately after setMemCache", () => {
    const cache = makeCache({ epgUrl: "https://test.com/epg.xml.gz" });
    setMemCache(cache);
    expect(getMemCache()).toEqual(cache);
  });

  it("returns null after invalidateMemCache", () => {
    setMemCache(makeCache());
    invalidateMemCache();
    expect(getMemCache()).toBeNull();
  });

  it("returns null after TTL expires", () => {
    vi.useFakeTimers();
    setMemCache(makeCache(), 1000); // 1s TTL
    vi.advanceTimersByTime(1001);
    expect(getMemCache()).toBeNull();
  });

  it("returns data before TTL expires", () => {
    vi.useFakeTimers();
    const cache = makeCache();
    setMemCache(cache, 5000); // 5s TTL
    vi.advanceTimersByTime(4999);
    expect(getMemCache()).toEqual(cache);
  });

  it("replaces existing cache with new setMemCache call", () => {
    const first = makeCache({ epgUrl: "https://first.com" });
    const second = makeCache({ epgUrl: "https://second.com" });
    setMemCache(first);
    setMemCache(second);
    expect(getMemCache()?.epgUrl).toBe("https://second.com");
  });

  it("preserves channels and programs in cache", () => {
    const cache = makeCache({
      channels: [{ id: "tvn7", name: "TVN 7", icon: null }],
      programs: [
        {
          channel: "tvn7",
          title: "Interstellar",
          start: "2026-04-20T20:00:00.000Z",
          stop: "2026-04-20T23:00:00.000Z",
          description: null,
          category: "Film",
          icon: null,
          rating: "8.6/10",
        },
      ],
    });
    setMemCache(cache);
    const retrieved = getMemCache();
    expect(retrieved?.channels).toHaveLength(1);
    expect(retrieved?.channels[0].name).toBe("TVN 7");
    expect(retrieved?.programs).toHaveLength(1);
    expect(retrieved?.programs[0].title).toBe("Interstellar");
  });

  it("default TTL is 30 minutes", () => {
    vi.useFakeTimers();
    setMemCache(makeCache());
    vi.advanceTimersByTime(30 * 60 * 1000 - 1);
    expect(getMemCache()).not.toBeNull();
    vi.advanceTimersByTime(2);
    expect(getMemCache()).toBeNull();
  });
});
