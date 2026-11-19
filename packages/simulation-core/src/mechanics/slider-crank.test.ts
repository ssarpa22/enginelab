import { describe, expect, it } from "vitest";
import { createEngineGeometry } from "../geometry/engine-geometry";
import { calculateSliderCrankState } from "./slider-crank";

const geometry = createEngineGeometry({
  cylinderCount: 8,
  boreM: 0.092,
  strokeM: 0.094,
  connectingRodLengthM: 0.15,
  compressionRatio: 10.5,
  bankAngleRad: Math.PI / 2
});

describe("calculateSliderCrankState", () => {
  it("places the piston at top dead centre at zero crank angle", () => {
    const state = calculateSliderCrankState(geometry, 0, 3_000);
    expect(state.pistonDisplacementM).toBeCloseTo(0, 14);
    expect(state.pistonVelocityMPerS).toBeCloseTo(0, 12);
  });

  it("places the piston at bottom dead centre at pi radians", () => {
    const state = calculateSliderCrankState(geometry, Math.PI, 3_000);
    expect(state.pistonDisplacementM).toBeCloseTo(0.094, 12);
    expect(state.pistonVelocityMPerS).toBeCloseTo(0, 10);
  });

  it("has zero piston velocity when crank speed is zero", () => {
    const state = calculateSliderCrankState(geometry, Math.PI / 2, 0);
    expect(state.pistonVelocityMPerS).toBe(0);
  });

  it("moves the piston toward BDC during the first half revolution", () => {
    const state = calculateSliderCrankState(geometry, Math.PI / 2, 1_000);
    expect(state.pistonDisplacementM).toBeGreaterThan(0);
    expect(state.pistonVelocityMPerS).toBeGreaterThan(0);
  });

  it("rejects negative RPM and non-finite angles", () => {
    expect(() => calculateSliderCrankState(geometry, 0, -1)).toThrow(RangeError);
    expect(() => calculateSliderCrankState(geometry, Number.NaN, 1_000)).toThrow(RangeError);
  });
});
