import { describe, expect, it } from "vitest";
import {
  getInlineFourCylinderPhase,
  getInlineFourFiringEvents,
  INLINE_FOUR_CRANK_PHASES_DEG,
  INLINE_FOUR_FIRING_ORDER
} from "./inline-four";

describe("inline-four crank phasing", () => {
  it("pairs cylinders 1/4 and 2/3 at top and bottom dead centre", () => {
    expect(INLINE_FOUR_CRANK_PHASES_DEG).toEqual([0, 180, 180, 0]);
    expect(getInlineFourCylinderPhase(0, 0, 0).crankAngleDeg).toBe(0);
    expect(getInlineFourCylinderPhase(0, 0, 1).crankAngleDeg).toBe(180);
    expect(getInlineFourCylinderPhase(0, 0, 2).crankAngleDeg).toBe(180);
    expect(getInlineFourCylinderPhase(0, 0, 3).crankAngleDeg).toBe(0);
  });

  it("fires in the conventional 1-3-4-2 order at 180 degree intervals", () => {
    expect(INLINE_FOUR_FIRING_ORDER).toEqual([1, 3, 4, 2]);
    const events = getInlineFourFiringEvents(15);
    expect(events.map(event => event.cylinderNumber)).toEqual([1, 3, 4, 2]);
    expect(events.map(event => event.crankAngleDeg)).toEqual([345, 525, 705, 165]);
  });

  it("wraps crank and four-stroke cycle angles independently", () => {
    expect(getInlineFourCylinderPhase(370, 730, 1)).toEqual({
      cylinderNumber: 2, crankAngleDeg: 190, cycleAngleDeg: 190
    });
  });

  it("rejects invalid cylinder indices and non-finite angles", () => {
    expect(() => getInlineFourCylinderPhase(0, 0, 4)).toThrow(RangeError);
    expect(() => getInlineFourCylinderPhase(Number.NaN, 0, 0)).toThrow(RangeError);
  });
});
