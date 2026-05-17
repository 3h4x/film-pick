export interface TmdbHelperHealth {
  liveRequestCount: number;
  cacheHitCount: number;
  retryCount: number;
  nonOkCount: number;
}

export interface TmdbHealthSnapshot {
  processLocal: true;
  liveRequestCount: number;
  cacheHitCount: number;
  retryCount: number;
  nonOkCount: number;
  last429At: string | null;
  lastErrorStatus: number | null;
  lastErrorMessage: string | null;
  updatedAt: string | null;
  helpers: Record<string, TmdbHelperHealth>;
}
