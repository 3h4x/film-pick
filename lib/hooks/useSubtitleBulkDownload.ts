"use client";

import { useState } from "react";
import type { BulkSubtitleEvent } from "@/lib/subtitle-download";
import { getErrorMessage } from "@/lib/utils";

export interface SubtitleBulkState {
  running: boolean;
  total: number;
  processed: number;
  current: string | null;
  downloaded: number;
  notFound: number;
  skipped: number;
  errors: number;
  /** Titles that got subtitles matched by name rather than by file — worth a spot check. */
  titleMatches: string[];
  finished: boolean;
  error: string | null;
}

export const INITIAL_SUBTITLE_BULK_STATE: SubtitleBulkState = {
  running: false,
  total: 0,
  processed: 0,
  current: null,
  downloaded: 0,
  notFound: 0,
  skipped: 0,
  errors: 0,
  titleMatches: [],
  finished: false,
  error: null,
};

/** What the download-missing route streams: the loop's events, or a fatal error. */
export type SubtitleBulkStreamEvent =
  | BulkSubtitleEvent
  | { type: "error"; error: string };

export function applySubtitleBulkEvent(
  state: SubtitleBulkState,
  event: SubtitleBulkStreamEvent,
): SubtitleBulkState {
  switch (event.type) {
    case "start":
      return { ...state, total: event.total };
    case "progress": {
      const { result } = event;
      return {
        ...state,
        processed: event.index,
        current: event.title,
        downloaded: state.downloaded + (result.status === "downloaded" ? 1 : 0),
        notFound: state.notFound + (result.status === "not_found" ? 1 : 0),
        errors: state.errors + (result.status === "error" ? 1 : 0),
        skipped:
          state.skipped +
          (result.status === "exists" || result.status === "no_file" ? 1 : 0),
        titleMatches:
          result.status === "downloaded" && !result.hashMatch
            ? [...state.titleMatches, event.title]
            : state.titleMatches,
      };
    }
    case "done":
      return { ...state, running: false, finished: true, current: null };
    case "error":
      return { ...state, running: false, error: event.error };
  }
}

export function useSubtitleBulkDownload() {
  const [state, setState] = useState<SubtitleBulkState>(
    INITIAL_SUBTITLE_BULK_STATE,
  );

  async function start() {
    setState({ ...INITIAL_SUBTITLE_BULK_STATE, running: true });
    try {
      const res = await fetch("/api/subtitles/download-missing", {
        method: "POST",
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as SubtitleBulkStreamEvent;
          setState((prev) => applySubtitleBulkEvent(prev, event));
        }
      }
      // A stream that ends without "done" was cut off (server restart, proxy).
      setState((prev) =>
        prev.running ? { ...prev, running: false, error: "Connection lost" } : prev,
      );
    } catch (error) {
      setState((prev) => ({
        ...prev,
        running: false,
        error: getErrorMessage(error),
      }));
    }
  }

  return { state, start };
}
