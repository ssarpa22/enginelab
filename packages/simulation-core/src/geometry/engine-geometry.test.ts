import { describe, expect, it } from "vitest";
import { createEngineGeometry } from "./engine-geometry";

const referenceV8 = {
  cylinderCount: 8,
  boreM: 0.092,
  strokeM: 0.094,
  connectingRodLengthM: 0.15,
  compressionRatio: 10.5,
  bankAngleRad: Math.PI / 2
};

describe("createEngineGeometry", () => {
  it("calculates the reference V8 displacement", () => {
    const geometry = createEngineGeometry(referenceV8);
    expect(geometry.totalDisplacementM3 * 1_000).toBeCloseTo(5.00075, 3);
    expect(geometry.sweptVolumePerCylinderM3).toBeCloseTo(
      geometry.totalDisplacementM3 / 8,
      12
    );
  });

  it("derives clearance volume from geometric compression ratio", () => {
    const geometry = createEngineGeometry(referenceV8);
    const calculatedRatio =
      (geometry.sweptVolumePerCylinderM3 + geometry.clearanceVolumePerCylinderM3) /
      geometry.clearanceVolumePerCylinderM3;
    expect(calculatedRatio).toBeCloseTo(10.5, 12);
  });

  it.each([
    ["zero cylinders", { cylinderCount: 0 }],
    ["fractional cylinders", { cylinderCount: 4.5 }],
    ["zero bore", { boreM: 0 }],
    ["compression ratio of one", { compressionRatio: 1 }],
    ["rod shorter than crank radius", { connectingRodLengthM: 0.01 }]
  ])("rejects invalid geometry: %s", (_label, override) => {
    expect(() =>
      createEngineGeometry({ ...referenceV8, ...override })
    ).toThrow(RangeError);
  });
});
