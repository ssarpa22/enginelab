/** SI constants and explicit conversions used at application boundaries. */
export const SI = {
  standardGravity: 9.80665,
  standardAtmosphere: 101_325,
  universalGasConstant: 8.31446261815324,
  airMolarMass: 0.0289652
} as const;

export function millimetresToMetres(value: number): number {
  assertFinite(value, "value");
  return value / 1_000;
}

export function metresToMillimetres(value: number): number {
  assertFinite(value, "value");
  return value * 1_000;
}

export function litresToCubicMetres(value: number): number {
  assertFinite(value, "value");
  return value / 1_000;
}

export function cubicMetresToLitres(value: number): number {
  assertFinite(value, "value");
  return value * 1_000;
}

export function rpmToRadiansPerSecond(rpm: number): number {
  assertFinite(rpm, "rpm");
  return (rpm * 2 * Math.PI) / 60;
}

export function radiansPerSecondToRpm(angularVelocity: number): number {
  assertFinite(angularVelocity, "angularVelocity");
  return (angularVelocity * 60) / (2 * Math.PI);
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number.`);
  }
}
