import { describe, expect, it } from "vitest";
import { createEngineGeometry, type EngineGeometryInput } from "./engine-geometry";

const referenceV8: EngineGeometryInput = {
  cylinderCount: 8,
  boreM: 0.092,
  strokeM: 0.094,
  connectingRodLengthM: 0.15,
  compressionRatio: 10.5,
  bankAngleRad: Math.PI / 2
};

function expectInvalidGeometry(overrides: Partial<EngineGeometryInput>): void {
  expect(() => createEngineGeometry({ ...referenceV8, ...overrides })).toThrow(RangeError);
}

describe("createEngineGeometry", () => {
  it("calculates the reference V8 displacement", () => {
    const geometry = createEngineGeometry(referenceV8);
    expect(geometry.totalDisplacementM3 * 1_000).toBeCloseTo(4.999, 3);
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

  it("rejects zero cylinders", () => expectInvalidGeometry({ cylinderCount: 0 }));
  it("rejects fractional cylinders", () => expectInvalidGeometry({ cylinderCount: 4.5 }));
  it("rejects zero bore", () => expectInvalidGeometry({ boreM: 0 }));
  it("rejects compression ratio of one", () => expectInvalidGeometry({ compressionRatio: 1 }));
  it("rejects a rod shorter than crank radius", () =>
    expectInvalidGeometry({ connectingRodLengthM: 0.01 }));
});
