import type { EngineGeometry } from "../geometry/engine-geometry";
import { rpmToRadiansPerSecond } from "../units/index";

export interface SliderCrankState {
  /** Crank angle measured from top dead centre, in radians. */
  crankAngleRad: number;
  /** Piston displacement from top dead centre, positive toward bottom dead centre. */
  pistonDisplacementM: number;
  /** Piston velocity; positive toward bottom dead centre. */
  pistonVelocityMPerS: number;
}

/**
 * Evaluates ideal slider-crank position and velocity at constant crank speed.
 * This is a rigid, zero-clearance, inline kinematic relationship; it does not
 * calculate forces, combustion, or crankshaft dynamics.
 */
export function calculateSliderCrankState(
  geometry: Pick<EngineGeometry, "crankRadiusM" | "connectingRodLengthM">,
  crankAngleRad: number,
  rpm: number
): SliderCrankState {
  assertFinite(crankAngleRad, "crankAngleRad");
  assertFinite(rpm, "rpm");
  if (rpm < 0) {
    throw new RangeError("rpm must be zero or greater.");
  }

  const radius = geometry.crankRadiusM;
  const rod = geometry.connectingRodLengthM;
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new RangeError("crankRadiusM must be finite and greater than zero.");
  }
  if (!Number.isFinite(rod) || rod <= radius) {
    throw new RangeError("connectingRodLengthM must be finite and greater than crankRadiusM.");
  }

  const sinTheta = Math.sin(crankAngleRad);
  const cosTheta = Math.cos(crankAngleRad);
  const rodProjection = Math.sqrt(rod ** 2 - (radius * sinTheta) ** 2);
  const pistonDisplacementM =
    radius + rod - radius * cosTheta - rodProjection;

  const displacementDerivative =
    radius * sinTheta +
    ((radius ** 2 * sinTheta * cosTheta) / rodProjection);

  const angularVelocity = rpmToRadiansPerSecond(rpm);
  const pistonVelocityMPerS = displacementDerivative * angularVelocity;

  return { crankAngleRad, pistonDisplacementM, pistonVelocityMPerS };
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number.`);
  }
}
