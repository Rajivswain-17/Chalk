// TEMPORARY stub for the removed `hls.js` dependency.
//
// Task 4 uninstalled `hls.js` (the chat no longer streams HLS video) but kept
// the legacy `VideoPlayer` / `WatchView` / `/watch` files untouched for Task 5
// to delete. Until then, `tsconfig.json` maps the bare `hls.js` import to this
// no-op stub so `next build` still resolves and type-checks.
//
// The stub reports `isSupported() === false`, so the legacy player degrades to
// its "cannot play HLS stream" message. Nothing in the new visual-explainer
// flow imports this file.
//
// DELETE WITH: client/src/components/VideoPlayer.tsx (Task 5) + the
// `hls.js` entry in tsconfig `paths`.

export interface HlsErrorData {
  fatal: boolean;
  type: string;
}

const Events = {
  MANIFEST_PARSED: "manifestParsed",
  ERROR: "hlsError",
} as const;

const ErrorTypes = {
  NETWORK_ERROR: "networkError",
} as const;

export default class HlsStub {
  static readonly Events = Events;
  static readonly ErrorTypes = ErrorTypes;

  static isSupported(): boolean {
    return false;
  }

  constructor(_config?: {
    maxBufferLength?: number;
    xhrSetup?: (xhr: XMLHttpRequest) => void;
  }) {}

  loadSource(_url: string): void {}

  attachMedia(_video: HTMLVideoElement): void {}

  on(_event: string, _cb: (event: string, data: HlsErrorData) => void): void {}

  startLoad(): void {}

  destroy(): void {}
}
