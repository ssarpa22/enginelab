import type { EngineGeometry } from "../geometry/engine-geometry";
import { calculateSliderCrankState } from "./slider-crank";
import { calculateValveState, DEFAULT_VALVE_TIMING } from "./valve-timing";
import type { CoupledCylinderConfig, CoupledCylinderState } from "./coupled-cylinder";
import { DEFAULT_COUPLED_CYLINDER, validateCoupledCylinderConfig } from "./coupled-cylinder";

export type IncrementalCylinderState = CoupledCylinderState & {
  /** Unwrapped crank-cycle angle; unlike cycleAngleDeg this never wraps. */
  integratedAngleDeg: number;
};

type CylinderGeometry = Pick<EngineGeometry, "boreM" | "crankRadiusM" | "connectingRodLengthM" | "strokeM" | "sweptVolumePerCylinderM3" | "clearanceVolumePerCylinderM3">;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const wrap = (angle: number, period: number) => ((angle % period) + period) % period;
/** Adaptive angular resolution trades some thermodynamic detail for bounded CPU cost at high RPM. */
export function calculateCylinderIntegrationAngleStepDeg(rpm: number): number {
  if (!Number.isFinite(rpm) || rpm < 0) throw new RangeError("RPM must be finite and non-negative.");
  if (rpm < 1_800) return 0.5;
  if (rpm < 3_500) return 0.75;
  if (rpm < 5_000) return 1;
  return 1.5;
}

/**
 * Starts the persistent 0-D cylinder integrator at intake-valve closing.
 * Subsequent calls advance only the crank-angle interval that has elapsed;
 * they do not replay the entire 720-degree cycle on every UI render.
 */
export function createIncrementalCylinderState(
  geometry: CylinderGeometry,
  config: CoupledCylinderConfig = DEFAULT_COUPLED_CYLINDER
): IncrementalCylinderState {
  validateCoupledCylinderConfig(config);
  const angle = 180 + DEFAULT_VALVE_TIMING.intakeClosesAbdc;
  const volume = volumeAt(geometry, angle);
  const mass = config.intakePressurePa * volume / (config.gasConstantJPerKgK * config.intakeTemperatureK);
  return {
    integratedAngleDeg: angle,
    cycleAngleDeg: wrap(angle, 720),
    phase: "compression",
    volumeM3: volume,
    pressurePa: config.intakePressurePa,
    temperatureK: config.intakeTemperatureK,
    massKg: mass,
    intakeMassFlowKgPerS: 0,
    exhaustMassFlowKgPerS: 0,
    netMassFlowKgPerS: 0,
    heatReleaseRateW: 0,
    burnedFraction: 0,
    indicatedTorqueNm: 0,
    indicatedPowerW: 0,
    intakeValveLiftMm: 0,
    exhaustValveLiftMm: 0
  };
}

/**
 * Advances the open-system first-law balance from the previous state to a
 * new crank angle. The RPM-dependent maximum substep ranges from 0.5 to 1.5
 * crank degrees; fractional angles are preserved by the 240 Hz physics clock.
 */
export function advanceIncrementalCylinderState(
  previous: IncrementalCylinderState,
  geometry: CylinderGeometry,
  targetCycleAngleDeg: number,
  rpm: number,
  config: CoupledCylinderConfig = DEFAULT_COUPLED_CYLINDER
): IncrementalCylinderState {
  if (!Number.isFinite(targetCycleAngleDeg) || !Number.isFinite(rpm) || rpm < 0) {
    throw new RangeError("Cycle angle must be finite and RPM must be finite and non-negative.");
  }
  validateCoupledCylinderConfig(config);
  const targetWrapped = wrap(targetCycleAngleDeg, 720);
  const previousWrapped = wrap(previous.integratedAngleDeg, 720);
  const delta = wrap(targetWrapped - previousWrapped, 720);
  if (delta < 1e-9) return { ...previous, cycleAngleDeg: targetWrapped };

  const targetUnwrapped = previous.integratedAngleDeg + delta;
  const cv = config.cvJPerKgK;
  const cp = config.gamma * cv;
  const pistonArea = Math.PI * geometry.boreM ** 2 / 4;
  const wallArea = Math.PI * geometry.boreM * geometry.strokeM + 2 * Math.PI * geometry.boreM ** 2 / 4;
  const omega = rpm * Math.PI / 30;
  const spark = 360 - config.combustionStartBtdc;
  const burnAt = (unwrappedDeg: number) => {
    const cycleAngle = wrap(unwrappedDeg, 720);
    const local = cycleAngle;
    const x = (local - spark) / config.combustionDurationDeg;
    if (x <= 0) return 0;
    return x >= 1 ? 1 : 1 - Math.exp(-config.wiebeA * x ** (config.wiebeM + 1));
  };

  let angle = previous.integratedAngleDeg;
  let volume = previous.volumeM3;
  let mass = previous.massKg;
  let temperature = previous.temperatureK;
  let pressure = previous.pressurePa;
  let intakeFlow = previous.intakeMassFlowKgPerS;
  let exhaustFlow = previous.exhaustMassFlowKgPerS;
  let heatRate = 0;
  let burned = previous.burnedFraction;
  let torque = previous.indicatedTorqueNm;
  const steps = Math.ceil(delta / calculateCylinderIntegrationAngleStepDeg(rpm));
  const angleStep = delta / steps;

  for (let i = 0; i < steps; i += 1) {
    const nextAngle = angle + angleStep;
    const midpoint = angle + angleStep / 2;
    const nextVolume = volumeAt(geometry, nextAngle);
    const dt = rpm > 0 ? angleStep / (6 * rpm) : 0;
    const valve = calculateValveState(wrap(midpoint, 720));
    const intakeArea = Math.PI * geometry.boreM * config.intakeValveDiameterRatio * valve.intakeLiftMm / 1000;
    const exhaustArea = Math.PI * geometry.boreM * config.exhaustValveDiameterRatio * valve.exhaustLiftMm / 1000;
    const intake = valve.intakeOpen
      ? compressibleFlow(config.intakePressurePa, config.intakeTemperatureK, pressure, temperature, intakeArea, config)
      : { massFlow: 0, direction: 0 };
    const exhaust = valve.exhaustOpen
      ? compressibleFlow(pressure, temperature, config.exhaustPressurePa, config.exhaustTemperatureK, exhaustArea, config)
      : { massFlow: 0, direction: 0 };
    const signedIntake = intake.massFlow * intake.direction;
    const signedExhaust = exhaust.massFlow * exhaust.direction;
    const deltaBurn = Math.max(0, burnAt(nextAngle) - burnAt(angle));
    const heatAdded = config.heatReleasePerCycleJ * deltaBurn;
    const wallHeat = config.wallHeatTransferWPerM2K * wallArea * (temperature - config.wallTemperatureK) * dt;
    const intakeEnthalpy = signedIntake * cp * (signedIntake >= 0 ? config.intakeTemperatureK : temperature) * dt;
    const exhaustEnthalpy = -signedExhaust * cp * (signedExhaust >= 0 ? temperature : config.exhaustTemperatureK) * dt;
    const nextMass = Math.max(mass * 0.08, mass + (signedIntake - signedExhaust) * dt);
    const internalEnergy = mass * cv * temperature;
    const nextEnergy = Math.max(1, internalEnergy - pressure * (nextVolume - volume) +
      intakeEnthalpy + exhaustEnthalpy + heatAdded - wallHeat);

    mass = nextMass;
    temperature = clamp(nextEnergy / (mass * cv), 120, 5000);
    volume = nextVolume;
    pressure = mass * config.gasConstantJPerKgK * temperature / volume;
    intakeFlow = signedIntake;
    exhaustFlow = signedExhaust;
    heatRate = dt > 0 ? heatAdded / dt : 0;
    burned = burnAt(nextAngle);

    const theta = wrap(midpoint, 360) * Math.PI / 180;
    const slider = calculateSliderCrankState(geometry, theta, rpm);
    const dxDTheta = omega > 0
      ? slider.pistonVelocityMPerS / omega
      : volumeDerivative(geometry, theta);
    torque = (pressure - config.exhaustPressurePa) * pistonArea * dxDTheta;
    angle = nextAngle;
  }

  const cycleAngle = targetWrapped;
  const phase = cycleAngle < 180 + DEFAULT_VALVE_TIMING.intakeClosesAbdc || cycleAngle >= 720 - DEFAULT_VALVE_TIMING.intakeOpensBtdc
    ? "intake"
    : cycleAngle < 360 ? "compression"
      : cycleAngle < 540 - DEFAULT_VALVE_TIMING.exhaustOpensBbdc ? "power" : "exhaust";
  const valves = calculateValveState(cycleAngle);
  return {
    integratedAngleDeg: targetUnwrapped,
    cycleAngleDeg: cycleAngle,
    phase,
    volumeM3: volume,
    pressurePa: pressure,
    temperatureK: temperature,
    massKg: mass,
    intakeMassFlowKgPerS: intakeFlow,
    exhaustMassFlowKgPerS: exhaustFlow,
    netMassFlowKgPerS: intakeFlow - exhaustFlow,
    heatReleaseRateW: heatRate,
    burnedFraction: burned,
    indicatedTorqueNm: torque,
    indicatedPowerW: torque * omega,
    intakeValveLiftMm: valves.intakeLiftMm,
    exhaustValveLiftMm: valves.exhaustLiftMm
  };
}

function volumeAt(geometry: CylinderGeometry, cycleAngleDeg: number): number {
  const theta = wrap(cycleAngleDeg, 360) * Math.PI / 180;
  const displacement = calculateSliderCrankState(geometry, theta, 0).pistonDisplacementM;
  return geometry.clearanceVolumePerCylinderM3 +
    geometry.sweptVolumePerCylinderM3 * displacement / geometry.strokeM;
}

function volumeDerivative(geometry: CylinderGeometry, theta: number): number {
  const epsilon = 1e-5;
  return (volumeAt(geometry, (theta + epsilon) * 180 / Math.PI) -
    volumeAt(geometry, (theta - epsilon) * 180 / Math.PI)) / (2 * epsilon);
}

function compressibleFlow(
  upstreamPressure: number, upstreamTemperature: number,
  downstreamPressure: number, downstreamTemperature: number,
  area: number, config: CoupledCylinderConfig
): { massFlow: number; direction: number } {
  if (area <= 0 || Math.abs(upstreamPressure - downstreamPressure) < 1) return { massFlow: 0, direction: 0 };
  const direction = upstreamPressure > downstreamPressure ? 1 : -1;
  const p0 = Math.max(upstreamPressure, downstreamPressure);
  const backPressure = Math.min(upstreamPressure, downstreamPressure);
  const t0 = direction > 0 ? upstreamTemperature : Math.max(120, downstreamTemperature);
  const ratio = backPressure / p0;
  const critical = (2 / (config.gamma + 1)) ** (config.gamma / (config.gamma - 1));
  const flux = ratio <= critical
    ? p0 * Math.sqrt(config.gamma / (config.gasConstantJPerKgK * t0)) *
      (2 / (config.gamma + 1)) ** ((config.gamma + 1) / (2 * (config.gamma - 1)))
    : p0 * Math.sqrt(Math.max(0, 2 * config.gamma /
      (config.gasConstantJPerKgK * t0 * (config.gamma - 1)) *
      (ratio ** (2 / config.gamma) - ratio ** ((config.gamma + 1) / config.gamma))));
  return { massFlow: config.dischargeCoefficient * area * flux, direction };
}


