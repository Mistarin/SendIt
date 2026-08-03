// The sender's transmit tuning, in one place. The dropdowns in send/index.html
// are rendered from these lists via the %TX_FPS_OPTIONS% / %FRAME_BYTES_OPTIONS%
// tokens (see htmlTokens() in vite.config.ts), and the receiver's no-signal
// hint names its fallback values from here too — so the advice can never point
// at a setting the sender doesn't offer.

/** What the no-signal hint tells the user to turn the sender down to. */
export const NO_SIGNAL_HINT_FRAME_BYTES = 1465;
export const NO_SIGNAL_HINT_TX_FPS = 24;

export const DEFAULT_TX_FPS = 20;
export const DEFAULT_FRAME_BYTES = 1000;

export const SEND_PRESETS = {
  compatibility: { txFps: 20, frameBytes: 1000 },
  balanced: { txFps: NO_SIGNAL_HINT_TX_FPS, frameBytes: NO_SIGNAL_HINT_FRAME_BYTES },
  dense: { txFps: 60, frameBytes: 2953 },
} as const;

// The hint values appear in these lists by construction, not by coincidence.
export const TX_FPS_OPTIONS: readonly number[] = [10, 15, 20, NO_SIGNAL_HINT_TX_FPS, 30, 60];
export const FRAME_BYTES_OPTIONS: readonly number[] = [
  500,
  1000,
  NO_SIGNAL_HINT_FRAME_BYTES,
  1850,
  2331,
  SEND_PRESETS.dense.frameBytes,
];
