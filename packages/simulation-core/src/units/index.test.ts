import { describe, expect, it } from "vitest";
import {
  cubicMetresToLitres,
  litresToCubicMetres,
  millimetresToMetres,
  metresToMillimetres,
  radiansPerSecondToRpm,
  rpmToRadiansPerSecond
} from "./index";

describe("SI unit conversions", () => {
  it("converts millimetres and metres", () => {
    expect(millimetresToMetres(92)).toBeCloseTo(0.092, 12);
    expect(metresToMillimetres(0.15)).toBeCloseTo(150, 12);
  });

  it("converts litres and cubic metres", () => {
    expect(litresToCubicMetres(5)).toBeCloseTo(0.005, 12);
    expect(cubicMetresToLitres(0.005)).toBeCloseTo(5, 12);
  });

  it("converts RPM and angular velocity", () => {
    expect(rpmToRadiansPerSecond(3_000)).toBeCloseTo(314.159265, 5);
    expect(radiansPerSecondToRpm(rpmToRadiansPerSecond(3_000))).toBeCloseTo(3_000, 10);
  });

  it("rejects non-finite values", () => {
    expect(() => millimetresToMetres(Number.NaN)).toThrow(RangeError);
  });
});
