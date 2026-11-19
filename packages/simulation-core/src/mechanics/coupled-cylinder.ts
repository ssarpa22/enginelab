import type { EngineGeometry } from "../geometry/engine-geometry";
import { calculateSliderCrankState } from "./slider-crank";
import { calculateValveState, DEFAULT_VALVE_TIMING } from "./valve-timing";

export type CoupledCylinderConfig = {
  intakePressurePa: number;
  intakeTemperatureK: number;
  exhaustPressurePa: number;
  exhaustTemperatureK: number;
  wallTemperatureK: number;
  gasConstantJPerKgK: number;
  cvJPerKgK: number;
  gamma: number;
  dischargeCoefficient: number;
  intakeValveDiameterRatio: number;
  exhaustValveDiameterRatio: number;
  heatReleasePerCycleJ: number;
  combustionStartBtdc: number;
  combustionDurationDeg: number;
  wiebeA: number;
  wiebeM: number;
  wallHeatTransferWPerM2K: number;
};

export const DEFAULT_COUPLED_CYLINDER: CoupledCylinderConfig = {
  intakePressurePa: 101325,
  intakeTemperatureK: 300,
  exhaustPressurePa: 101325,
  exhaustTemperatureK: 720,
  wallTemperatureK: 450,
  gasConstantJPerKgK: 287.05,
  cvJPerKgK: 718,
  gamma: 1.4,
  dischargeCoefficient: 0.72,
  intakeValveDiameterRatio: 0.34,
  exhaustValveDiameterRatio: 0.31,
  heatReleasePerCycleJ: 450,
  combustionStartBtdc: 15,
  combustionDurationDeg: 48,
  wiebeA: 5,
  wiebeM: 2,
  wallHeatTransferWPerM2K: 120
};

export type CoupledCylinderState = {
  cycleAngleDeg: number;
  phase: "intake" | "compression" | "power" | "exhaust";
  volumeM3: number;
  pressurePa: number;
  temperatureK: number;
  massKg: number;
  intakeMassFlowKgPerS: number;
  exhaustMassFlowKgPerS: number;
  netMassFlowKgPerS: number;
  heatReleaseRateW: number;
  burnedFraction: number;
  indicatedTorqueNm: number;
  indicatedPowerW: number;
  intakeValveLiftMm: number;
  exhaustValveLiftMm: number;
};

type FlowResult = { kgPerS: number; direction: number };

/**
 * Integrates a single-zone open-system cylinder model around one 720° cycle.
 * Mass crosses the intake/exhaust valve curtains using compressible isentropic
 * nozzle flow (including choking). Internal energy is advanced with p*dV work,
 * inlet/outlet enthalpy, a finite-duration Wiebe heat-release law and wall heat
 * loss. This is a transparent educational 0-D model, not CFD or calibrated data.
 */
export function calculateCoupledCylinderState(
  geometry: Pick<EngineGeometry, "boreM" | "crankRadiusM" | "connectingRodLengthM" | "strokeM" | "sweptVolumePerCylinderM3" | "clearanceVolumePerCylinderM3">,
  cycleAngleDeg: number,
  rpm: number,
  config: CoupledCylinderConfig = DEFAULT_COUPLED_CYLINDER
): CoupledCylinderState {
  if (!Number.isFinite(cycleAngleDeg) || !Number.isFinite(rpm) || rpm < 0) {
    throw new RangeError("Cycle angle must be finite and RPM must be finite and non-negative.");
  }
  validateConfig(config);
  const angle = ((cycleAngleDeg % 720) + 720) % 720;
  const ivc = 180 + DEFAULT_VALVE_TIMING.intakeClosesAbdc;
  const target = angle < ivc ? angle + 720 : angle;
  const volumeAt = (deg: number) => {
    const rad = ((deg % 360) + 360) % 360 * Math.PI / 180;
    const displacement = calculateSliderCrankState(geometry, rad, 0).pistonDisplacementM;
    return geometry.clearanceVolumePerCylinderM3 +
      geometry.sweptVolumePerCylinderM3 * displacement / geometry.strokeM;
  };

  let volume = volumeAt(ivc);
  let mass = config.intakePressurePa * volume / (config.gasConstantJPerKgK * config.intakeTemperatureK);
  let temperature = config.intakeTemperatureK;
  let pressure = config.intakePressurePa;
  let intakeFlow = 0;
  let exhaustFlow = 0;
  let heatRate = 0;
  let burned = 0;
  let torque = 0;
  const cv = config.cvJPerKgK;
  const cp = config.gamma * cv;
  const wallArea = Math.PI * geometry.boreM * geometry.strokeM + 2 * Math.PI * geometry.boreM ** 2 / 4;
  const dt = rpm > 0 ? 1 / (6 * rpm) : 0;
  const spark = 360 - config.combustionStartBtdc;
  const burnAt = (deg: number) => {
    const x = Math.max(0, (deg - spark) / config.combustionDurationDeg);
    if (x <= 0) return 0;
    return x >= 1 ? 1 : 1 - Math.exp(-config.wiebeA * x ** (config.wiebeM + 1));
  };
  const startStep = Math.floor(ivc);
  const endStep = Math.floor(target);

  for (let deg = startStep; deg < endStep; deg += 1) {
    const nextVolume = volumeAt(deg + 1);
    const valve = calculateValveState(deg);
    const intakeArea = Math.PI * geometry.boreM * config.intakeValveDiameterRatio *
      (valve.intakeLiftMm / 1000);
    const exhaustArea = Math.PI * geometry.boreM * config.exhaustValveDiameterRatio *
      (valve.exhaustLiftMm / 1000);
    const intakeFlowState = valve.intakeOpen
      ? compressibleOrificeFlow(config.intakePressurePa, config.intakeTemperatureK, pressure, temperature, intakeArea, config)
      : { kgPerS: 0, direction: 0 };
    const exhaustFlowState = valve.exhaustOpen
      ? compressibleOrificeFlow(pressure, temperature, config.exhaustPressurePa, config.exhaustTemperatureK, exhaustArea, config)
      : { kgPerS: 0, direction: 0 };
    const intakeSigned = intakeFlowState.kgPerS * intakeFlowState.direction;
    const exhaustSigned = exhaustFlowState.kgPerS * exhaustFlowState.direction;
    const deltaBurn = Math.max(0, burnAt(deg + 1) - burnAt(deg));
    const heatAdded = config.heatReleasePerCycleJ * deltaBurn;
    const wallHeat = config.wallHeatTransferWPerM2K * wallArea *
      (temperature - config.wallTemperatureK) * dt;
    const intakeEnthalpy = intakeSigned >= 0
      ? intakeSigned * cp * config.intakeTemperatureK * dt
      : intakeSigned * cp * temperature * dt;
    const exhaustEnthalpy = exhaustSigned >= 0
      ? -exhaustSigned * cp * temperature * dt
      : -exhaustSigned * cp * config.exhaustTemperatureK * dt;
    const deltaMass = (intakeSigned - exhaustSigned) * dt;
    const nextMass = Math.max(mass * 0.08, mass + deltaMass);
    const currentInternalEnergy = mass * cv * temperature;
    const nextInternalEnergy = Math.max(1, currentInternalEnergy -
      pressure * (nextVolume - volume) + intakeEnthalpy + exhaustEnthalpy + heatAdded - wallHeat);
    mass = nextMass;
    temperature = Math.max(120, nextInternalEnergy / (mass * cv));
    volume = nextVolume;
    pressure = mass * config.gasConstantJPerKgK * temperature / volume;
    intakeFlow = intakeSigned;
    exhaustFlow = exhaustSigned;
    heatRate = dt > 0 ? heatAdded / dt : 0;
    burned = burnAt(deg + 1);

    const theta = ((deg + 0.5) % 360) * Math.PI / 180;
    const piston = calculateSliderCrankState(geometry, theta, rpm);
    const dxDTheta = rpm > 0 ? piston.pistonVelocityMPerS / (rpm * Math.PI / 30) : 0;
    const pistonArea = Math.PI * geometry.boreM ** 2 / 4;
    torque = (pressure - config.exhaustPressurePa) * pistonArea * dxDTheta;
  }

  const normalizedAngle = ((target % 360) + 360) % 360;
  const phase = angle < ivc || angle >= 720 - DEFAULT_VALVE_TIMING.intakeOpensBtdc
    ? "intake"
    : angle < 360 ? "compression"
      : angle < 540 - DEFAULT_VALVE_TIMING.exhaustOpensBbdc ? "power" : "exhaust";
  const finalValve = calculateValveState(angle);
  const power = torque * rpm * Math.PI / 30;
  return {
    cycleAngleDeg: angle,
    phase,
    volumeM3: volumeAt(target),
    pressurePa: pressure,
    temperatureK: temperature,
    massKg: mass,
    intakeMassFlowKgPerS: intakeFlow,
    exhaustMassFlowKgPerS: exhaustFlow,
    netMassFlowKgPerS: intakeFlow - exhaustFlow,
    heatReleaseRateW: heatRate,
    burnedFraction: burned,
    indicatedTorqueNm: torque,
    indicatedPowerW: power,
    intakeValveLiftMm: finalValve.intakeLiftMm,
    exhaustValveLiftMm: finalValve.exhaustLiftMm
  };
}

function compressibleOrificeFlow(
  upstreamPressure: number,
  upstreamTemperature: number,
  downstreamPressure: number,
  downstreamTemperature: number,
  area: number,
  config: CoupledCylinderConfig
): FlowResult {
  if (area <= 0 || Math.abs(upstreamPressure - downstreamPressure) < 1) {
    return { kgPerS: 0, direction: 0 };
  }
  const direction = upstreamPressure > downstreamPressure ? 1 : -1;
  const p0 = Math.max(upstreamPressure, downstreamPressure);
  const pBack = Math.min(upstreamPressure, downstreamPressure);
  const t0 = direction > 0 ? upstreamTemperature : Math.max(120, downstreamTemperature);
  const ratio = pBack / p0;
  const critical = (2 / (config.gamma + 1)) ** (config.gamma / (config.gamma - 1));
  let massFlux: number;
  if (ratio <= critical) {
    massFlux = p0 * Math.sqrt(config.gamma / (config.gasConstantJPerKgK * t0)) *
      (2 / (config.gamma + 1)) ** ((config.gamma + 1) / (2 * (config.gamma - 1)));
  } else {
    const term = Math.max(0, 2 * config.gamma / (config.gasConstantJPerKgK * t0 *
      (config.gamma - 1)) * (ratio ** (2 / config.gamma) - ratio ** ((config.gamma + 1) / config.gamma)));
    massFlux = p0 * Math.sqrt(term);
  }
  return { kgPerS: config.dischargeCoefficient * area * massFlux, direction };
}

function validateConfig(config: CoupledCylinderConfig): void {
  for (const [key, value] of Object.entries(config)) {
    if (!Number.isFinite(value)) throw new RangeError(`${key} must be finite.`);
  }
  if (config.intakePressurePa <= 0 || config.intakeTemperatureK <= 0 ||
      config.exhaustPressurePa <= 0 || config.wallTemperatureK <= 0 ||
      config.gasConstantJPerKgK <= 0 || config.cvJPerKgK <= 0 ||
      config.gamma <= 1 || config.dischargeCoefficient <= 0 || config.dischargeCoefficient > 1 ||
      config.heatReleasePerCycleJ < 0 || config.combustionDurationDeg <= 0 ||
      config.wiebeA <= 0 || config.wiebeM <= 0 || config.wallHeatTransferWPerM2K < 0 ||
      config.intakeValveDiameterRatio <= 0 || config.exhaustValveDiameterRatio <= 0) {
    throw new RangeError("Thermodynamic configuration contains an out-of-range physical parameter.");
  }
}
