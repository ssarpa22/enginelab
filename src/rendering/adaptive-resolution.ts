export const MIN_RENDER_SCALE = 0.55;
export const INTERACTION_RENDER_SCALE = 0.78;
export const MAX_RENDER_SCALE = 1;
const ADJUSTMENT_COOLDOWN_MS = 650;

/**
 * Adaptive render scale controller.
 * Frame-time hysteresis avoids oscillating the drawing-buffer resolution.
 */
export interface AdaptiveResolutionState {
  scale: number;
  smoothedFrameMs: number;
  lastAdjustmentMs: number;
}

export function createAdaptiveResolutionState(): AdaptiveResolutionState {
  return { scale: MAX_RENDER_SCALE, smoothedFrameMs: 16.7, lastAdjustmentMs: 0 };
}

export function updateAdaptiveResolution(
  state: AdaptiveResolutionState,
  frameMs: number,
  nowMs: number,
  interacting: boolean
): AdaptiveResolutionState {
  if (!Number.isFinite(frameMs) || frameMs <= 0 || !Number.isFinite(nowMs)) return state;

  const smoothedFrameMs = state.smoothedFrameMs * 0.82 + Math.min(frameMs, 100) * 0.18;
  let scale = state.scale;
  let lastAdjustmentMs = state.lastAdjustmentMs;

  if (interacting && scale > INTERACTION_RENDER_SCALE) {
    scale = INTERACTION_RENDER_SCALE;
    lastAdjustmentMs = nowMs;
  } else if (nowMs - lastAdjustmentMs >= ADJUSTMENT_COOLDOWN_MS) {
    if (smoothedFrameMs > 25) scale = Math.max(MIN_RENDER_SCALE, scale - 0.12);
    else if (smoothedFrameMs > 19) scale = Math.max(MIN_RENDER_SCALE, scale - 0.06);
    else if (!interacting && smoothedFrameMs < 14) scale = Math.min(MAX_RENDER_SCALE, scale + 0.035);

    if (scale !== state.scale) lastAdjustmentMs = nowMs;
  }

  return { scale, smoothedFrameMs, lastAdjustmentMs };
}
