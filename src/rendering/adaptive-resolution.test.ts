import { describe, expect, it } from "vitest";
import {
  createAdaptiveResolutionState,
  INTERACTION_RENDER_SCALE,
  MIN_RENDER_SCALE,
  updateAdaptiveResolution
} from "./adaptive-resolution";

describe("adaptive render resolution", () => {
  it("reduces pixel density immediately while the camera is being manipulated", () => {
    const next = updateAdaptiveResolution(createAdaptiveResolutionState(), 16, 1000, true);
    expect(next.scale).toBe(INTERACTION_RENDER_SCALE);
  });

  it("reduces resolution under sustained slow frames without dropping below its floor", () => {
    let state = createAdaptiveResolutionState();
    for (let i = 0; i < 30; i++) {
      state = updateAdaptiveResolution(state, 40, 1000 + i * 700, false);
    }
    expect(state.scale).toBe(MIN_RENDER_SCALE);
  });

  it("recovers resolution gradually after performance stabilizes", () => {
    const low = { scale: 0.7, smoothedFrameMs: 10, lastAdjustmentMs: 0 };
    const next = updateAdaptiveResolution(low, 10, 1000, false);
    expect(next.scale).toBeGreaterThan(low.scale);
    expect(next.scale).toBeLessThanOrEqual(0.82);
  });

  it("ignores invalid frame measurements", () => {
    const state = createAdaptiveResolutionState();
    expect(updateAdaptiveResolution(state, Number.NaN, 1000, false)).toBe(state);
  });
});
