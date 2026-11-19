import { describe, expect, it } from "vitest";
import { calculateStarterTorque, starterCanDisengage, STARTER_CUTOUT_RPM } from "./starter-system";

describe("starter motor", () => {
  it("delivers maximum torque at stall and loses torque as speed rises", () => {
    expect(calculateStarterTorque(0, true)).toBe(48);
    expect(calculateStarterTorque(210, true)).toBeLessThan(48);
    expect(calculateStarterTorque(STARTER_CUTOUT_RPM, true)).toBeGreaterThan(0);
    expect(calculateStarterTorque(420, true)).toBe(0);
  });
  it("disengages only after the engine reaches self-sustaining cranking speed", () => {
    expect(starterCanDisengage(179)).toBe(false);
    expect(starterCanDisengage(180)).toBe(true);
  });
  it("produces no torque when the starter is not engaged and rejects invalid speed", () => {
    expect(calculateStarterTorque(100, false)).toBe(0);
    expect(() => calculateStarterTorque(-1, true)).toThrow(RangeError);
  });
});
