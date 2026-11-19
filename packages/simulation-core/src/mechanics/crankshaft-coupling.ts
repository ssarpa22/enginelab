import type { EngineGeometry } from "../geometry/engine-geometry";
import { calculateSliderCrankState } from "./slider-crank";
import { INLINE_FOUR_CRANK_PHASES_DEG, INLINE_FOUR_CYCLE_OFFSETS_DEG } from "./inline-four";

export interface CylinderCrankCoupling {
  cylinderNumber: 1 | 2 | 3 | 4;
  crankAngleDeg: number;
  cycleAngleDeg: number;
  pistonDisplacementM: number;
  pistonVelocityMPerS: number;
  connectingRodAngleRad: number;
  gasForceN: number;
  gasTorqueNm: number;
}

export interface InlineFourCrankCoupling {
  crankAngleDeg: number;
  camshaftAngleDeg: number;
  cylinders: CylinderCrankCoupling[];
  indicatedGasTorqueNm: number;
}

export interface CrankshaftDynamicState {
  /** Crank angle in the complete four-stroke 720-degree cycle. */
  cycleAngleDeg: number;
  /** Positive crankshaft speed in revolutions per minute. */
  rpm: number;
}

export interface CrankshaftStepOptions {
  targetRpm: number;
  dtSeconds: number;
  loadTorqueNm?: number;
  frictionTorqueNm?: number;
  inertiaKgM2?: number;
  governorGainNmPerRpm?: number;
  maximumGasTorqueNm?: number;
}

const wrap = (angle: number, period: number) => ((angle % period) + period) % period;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Couples cylinder gas pressure to the shared crankshaft through the exact
 * slider-crank Jacobian. Pressure produces piston force; piston force times
 * dx/dθ produces crank torque. The same crank angle determines every piston,
 * connecting-rod angle, crank throw and half-speed camshaft phase.
 *
 * This is a one-dimensional rigid-body model, not a deformable multibody or
 * bearing-contact solver.
 */
export function calculateInlineFourCrankCoupling(
  geometry: Pick<EngineGeometry, "crankRadiusM" | "connectingRodLengthM" | "boreM">,
  crankAngleDeg: number,
  rpm: number,
  cylinderPressuresPa: readonly number[],
  ambientPressurePa = 101_325,
  globalCycleAngleDeg = crankAngleDeg
): InlineFourCrankCoupling {
  if (!Number.isFinite(crankAngleDeg) || !Number.isFinite(rpm) || rpm < 0) {
    throw new RangeError("Crank angle must be finite and rpm must be finite and non-negative.");
  }
  if (cylinderPressuresPa.length !== 4 || cylinderPressuresPa.some(value => !Number.isFinite(value) || value < 0)) {
    throw new RangeError("Exactly four finite, non-negative cylinder pressures are required.");
  }
  if (!Number.isFinite(globalCycleAngleDeg)) {
    throw new RangeError("Global cycle angle must be finite.");
  }
  if (!Number.isFinite(ambientPressurePa) || ambientPressurePa < 0) {
    throw new RangeError("Ambient pressure must be finite and non-negative.");
  }
  if (!Number.isFinite(geometry.boreM) || geometry.boreM <= 0) {
    throw new RangeError("Bore must be finite and greater than zero.");
  }

  const areaM2 = Math.PI * geometry.boreM ** 2 / 4;
  const crankAngle = wrap(crankAngleDeg, 360);
  const globalCycleAngle = wrap(globalCycleAngleDeg, 720);
  const cylinders = cylinderPressuresPa.map((pressurePa, index) => {
    const localAngleDeg = wrap(crankAngle + INLINE_FOUR_CRANK_PHASES_DEG[index]!, 360);
    const theta = localAngleDeg * Math.PI / 180;
    const slider = calculateSliderCrankState(geometry, theta, rpm);
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    const radius = geometry.crankRadiusM;
    const rod = geometry.connectingRodLengthM;
    const rodProjection = Math.sqrt(rod ** 2 - (radius * sinTheta) ** 2);
    const dxDTheta = radius * sinTheta + radius ** 2 * sinTheta * cosTheta / rodProjection;
    const gasForceN = (pressurePa - ambientPressurePa) * areaM2;
    const gasTorqueNm = gasForceN * dxDTheta;

    return {
      cylinderNumber: (index + 1) as 1 | 2 | 3 | 4,
      crankAngleDeg: localAngleDeg,
      cycleAngleDeg: wrap(globalCycleAngle + INLINE_FOUR_CYCLE_OFFSETS_DEG[index]!, 720),
      pistonDisplacementM: slider.pistonDisplacementM,
      pistonVelocityMPerS: slider.pistonVelocityMPerS,
      connectingRodAngleRad: Math.asin(radius * sinTheta / rod),
      gasForceN,
      gasTorqueNm
    };
  });

  return {
    crankAngleDeg: crankAngle,
    camshaftAngleDeg: wrap(globalCycleAngle / 2, 360),
    cylinders,
    indicatedGasTorqueNm: cylinders.reduce((sum, cylinder) => sum + cylinder.gasTorqueNm, 0)
  };
}

/**
 * Integrates the shared crankshaft angular velocity from cylinder gas torque.
 * A bounded proportional governor holds the requested speed against load;
 * when targetRpm is zero the governor disengages and the engine coasts down.
 */
export function stepCrankshaft(
  state: CrankshaftDynamicState,
  indicatedGasTorqueNm: number,
  options: CrankshaftStepOptions
): CrankshaftDynamicState {
  const {
    targetRpm,
    dtSeconds,
    loadTorqueNm = 8,
    frictionTorqueNm = 2,
    inertiaKgM2 = 0.32,
    governorGainNmPerRpm = 0.12,
    maximumGasTorqueNm = 220
  } = options;

  for (const [name, value] of Object.entries({ cycleAngleDeg: state.cycleAngleDeg, rpm: state.rpm, indicatedGasTorqueNm, targetRpm, dtSeconds, loadTorqueNm, frictionTorqueNm, inertiaKgM2, governorGainNmPerRpm, maximumGasTorqueNm })) {
    if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
  }
  if (state.rpm < 0 || targetRpm < 0 || dtSeconds < 0 || dtSeconds > 0.1 || loadTorqueNm < 0 || frictionTorqueNm < 0 || inertiaKgM2 <= 0 || governorGainNmPerRpm < 0 || maximumGasTorqueNm <= 0) {
    throw new RangeError("Invalid crankshaft integration parameters.");
  }
  if (dtSeconds === 0) return { ...state, cycleAngleDeg: wrap(state.cycleAngleDeg, 720) };

  // A zero speed target represents fuel cut: the rotating assembly coasts down under load and friction.
  const gasTorque = targetRpm === 0 ? 0 : clamp(indicatedGasTorqueNm, -maximumGasTorqueNm, maximumGasTorqueNm);
  const governorTorque = targetRpm > 0
    ? clamp((targetRpm - state.rpm) * governorGainNmPerRpm, -100, 100)
    : 0;
  const friction = state.rpm > 0 ? frictionTorqueNm : 0;
  const netTorqueNm = gasTorque + governorTorque - loadTorqueNm - friction;
  const oldOmega = state.rpm * Math.PI / 30;
  const nextOmega = Math.max(0, oldOmega + (netTorqueNm / inertiaKgM2) * dtSeconds);
  const nextRpm = Math.min(9_000, nextOmega * 30 / Math.PI);
  const averageOmega = (oldOmega + nextOmega) / 2;
  const nextAngle = wrap(state.cycleAngleDeg + averageOmega * dtSeconds * 180 / Math.PI, 720);

  return { cycleAngleDeg: nextAngle, rpm: nextRpm };
}
