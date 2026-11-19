import type { EngineGeometry } from "../geometry/engine-geometry";
import { calculateSliderCrankState } from "./slider-crank";
import { calculateValveState, DEFAULT_VALVE_TIMING, type ValveTiming } from "./valve-timing";
import { getInlineFourCylinderPhase } from "./inline-four";

export type CylinderMechanicalState = {
  cylinder: number;
  crankAngleRad: number;
  cycleAngleDeg: number;
  pistonDisplacementM: number;
  pistonPositionFromDeckM: number;
  pistonVelocityMPerS: number;
  rodAngleRad: number;
  rodLengthM: number;
  pistonSideClearanceM: number;
  intakeLiftCommandMm: number;
  exhaustLiftCommandMm: number;
  intakeLiftActualMm: number;
  exhaustLiftActualMm: number;
  minimumValveClearanceMm: number;
  valveCollision: boolean;
  skirtClearanceMm: number;
  rodToBlockClearanceMm: number;
  mechanicalWarning: string | null;
  valveFloatSeverity: number;
};

export type EngineSystemsState = {
  oilTemperatureC: number;
  oilPressureBar: number;
  oilFlowLPerMin: number;
  oilLevelL: number;
  coolantTemperatureC: number;
  coolantPressureBar: number;
  coolantFlowLPerMin: number;
  coolantLevelL: number;
  headTemperatureC: number;
  exhaustTemperatureC: number;
  thermostatOpening: number;
  radiatorHeatRejectionW: number;
  bearingFilmRatio: number;
  lubricationWarning: boolean;
  overheating: boolean;
};

export type EngineSystemsInput = {
  rpm: number;
  load: number;
  exhaustGasTemperatureC: number;
  ambientTemperatureC?: number;
  oilLeakLPerMin?: number;
  coolantLeakLPerMin?: number;
  oilPickupAvailability?: number;
  coolantPumpEfficiency?: number;
};

export const INITIAL_ENGINE_SYSTEMS: EngineSystemsState = {
  oilTemperatureC: 25,
  oilPressureBar: 0,
  oilFlowLPerMin: 0,
  oilLevelL: 4.2,
  coolantTemperatureC: 25,
  coolantPressureBar: 0,
  coolantFlowLPerMin: 0,
  coolantLevelL: 6.2,
  headTemperatureC: 25,
  exhaustTemperatureC: 25,
  thermostatOpening: 0,
  radiatorHeatRejectionW: 0,
  bearingFilmRatio: 0,
  lubricationWarning: true,
  overheating: false
};

const clamp = (v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));

/**
 * A constrained slider-crank and valve-train state with explicit clearance
 * checks. This is rigid-body kinematics plus conservative interference guards,
 * not a deformable multibody/contact solver.
 */
export function calculateCylinderMechanics(
  geometry: Pick<EngineGeometry,"boreM"|"strokeM"|"crankRadiusM"|"connectingRodLengthM"|"clearanceVolumePerCylinderM3">,
  globalCrankAngleDeg: number,
  globalCycleAngleDeg: number,
  cylinderIndex: number,
  rpm: number,
  timing: ValveTiming = DEFAULT_VALVE_TIMING,
  valveFloatSeverity = 0,
  thermalExpansionMm = 0
): CylinderMechanicalState {
  if (!Number.isFinite(rpm) || rpm < 0) throw new RangeError("RPM must be finite and non-negative.");
  const phase = getInlineFourCylinderPhase(globalCrankAngleDeg,globalCycleAngleDeg,cylinderIndex);
  const theta=phase.crankAngleDeg*Math.PI/180;
  const k=calculateSliderCrankState(geometry,theta,rpm);
  const rodAngle=Math.asin(clamp(geometry.crankRadiusM*Math.sin(theta)/geometry.connectingRodLengthM,-1,1));
  const deckClearanceM=geometry.clearanceVolumePerCylinderM3/(Math.PI*geometry.boreM**2/4);
  const valve=calculateValveState(phase.cycleAngleDeg,timing);
  const pocketDepthMm=2.2;
  const minimumSafeClearanceMm=1.0;
  const clearanceBeforeValveMm=deckClearanceM*1000+k.pistonDisplacementM*1000+pocketDepthMm;
  const maxSafeLiftMm=Math.max(0,clearanceBeforeValveMm-minimumSafeClearanceMm);
  const effectiveLiftFactor=1-clamp(valveFloatSeverity,0,1)*.65;
  const intakeActual=Math.min(valve.intakeLiftMm*effectiveLiftFactor,maxSafeLiftMm);
  const exhaustActual=Math.min(valve.exhaustLiftMm*effectiveLiftFactor,maxSafeLiftMm);
  const minimumValveClearanceMm=clearanceBeforeValveMm-Math.max(intakeActual,exhaustActual);
  const valveCollision=valve.intakeLiftMm>maxSafeLiftMm+1e-6||valve.exhaustLiftMm>maxSafeLiftMm+1e-6;
  const skirtClearanceMm=geometry.boreM*1000*.0012-Math.max(0,thermalExpansionMm);
  const rodBigEndRadiusMm=geometry.boreM*1000*.10;
  const crankcaseInnerHalfWidthMm=Math.max(geometry.boreM*1000*.775,
    geometry.crankRadiusM*1000+rodBigEndRadiusMm+6);
  const rodToBlockClearanceMm=crankcaseInnerHalfWidthMm-
    geometry.crankRadiusM*1000-rodBigEndRadiusMm;
  const warning=valveCollision?"Interferencia pistón-válvula evitada por el limitador cinemático":
    skirtClearanceMm<=0?"Interferencia térmica pistón-cilindro: riesgo de gripado":
    valveFloatSeverity>.35?"Flotación de válvulas: alzada efectiva reducida":
    rodToBlockClearanceMm<2?"Holgura reducida entre biela y bloque":null;
  return {
    cylinder:cylinderIndex+1,crankAngleRad:theta,cycleAngleDeg:phase.cycleAngleDeg,
    pistonDisplacementM:k.pistonDisplacementM,
    pistonPositionFromDeckM:deckClearanceM+k.pistonDisplacementM,
    pistonVelocityMPerS:k.pistonVelocityMPerS,rodAngleRad:rodAngle,
    rodLengthM:geometry.connectingRodLengthM,
    pistonSideClearanceM:skirtClearanceMm/1000,
    intakeLiftCommandMm:valve.intakeLiftMm,exhaustLiftCommandMm:valve.exhaustLiftMm,
    intakeLiftActualMm:intakeActual,exhaustLiftActualMm:exhaustActual,
    minimumValveClearanceMm, valveCollision,skirtClearanceMm,rodToBlockClearanceMm,
    mechanicalWarning:warning,valveFloatSeverity:clamp(valveFloatSeverity,0,1)
  };
}

/** Advances oil, coolant and metal temperatures using lumped thermal masses. */
export function advanceEngineSystems(
  previous: EngineSystemsState,
  input: EngineSystemsInput,
  dtSeconds: number
): EngineSystemsState {
  const optional=[input.oilLeakLPerMin,input.coolantLeakLPerMin,input.oilPickupAvailability,input.coolantPumpEfficiency];
  if (![input.rpm,input.load,input.exhaustGasTemperatureC,dtSeconds].every(Number.isFinite) ||
      optional.some(value=>value!==undefined&&!Number.isFinite(value)) ||
      input.rpm<0 || dtSeconds<0 || dtSeconds>1) {
    throw new RangeError("Invalid engine-system input or integration step.");
  }
  const ambient=input.ambientTemperatureC??25;
  const rpmFraction=clamp(input.rpm/6500,0,1.3);
  const load=clamp(input.load,0,1);
  const oilLeak=clamp(input.oilLeakLPerMin??0,0,10);
  const coolantLeak=clamp(input.coolantLeakLPerMin??0,0,10);
  const oilLevelL=clamp(previous.oilLevelL-oilLeak*dtSeconds/60,0,6);
  const coolantLevelL=clamp(previous.coolantLevelL-coolantLeak*dtSeconds/60,0,10);
  const oilPickup=clamp(input.oilPickupAvailability??1,0,1)*clamp(oilLevelL/.65,0,1);
  const coolantPump=clamp(input.coolantPumpEfficiency??1,0,1)*clamp(coolantLevelL/1.2,0,1);
  const oilViscosityFactor=clamp(1.25-(previous.oilTemperatureC-20)*.008,.42,1.35);
  const pumpPressure= input.rpm===0 ? 0 : Math.min(5.2, .00095*input.rpm*oilViscosityFactor)*oilPickup;
  const relief=5.2;
  const oilPressureBar=Math.min(relief,pumpPressure);
  const oilFlowLPerMin=input.rpm===0?0:Math.min(32,input.rpm*.0038*oilViscosityFactor)*oilPickup;
  const bearingFilmRatio=clamp(oilPressureBar/2.2,0,1.6)*clamp(1.2-(previous.oilTemperatureC-90)*.006,.45,1.2);
  const lubricationWarning=input.rpm>650&&(oilPressureBar<1.0||bearingFilmRatio<.55);

  const thermostatOpening=clamp((previous.coolantTemperatureC-82)/12,0,1);
  const coolantFlowLPerMin=input.rpm===0?0:Math.min(95,input.rpm*.012)*coolantPump;
  const coolantPressureBar=input.rpm===0?0:Math.min(1.45,.25+rpmFraction*.85)*coolantPump;
  const coolantHeatInput=input.rpm===0?0:1800+load*input.rpm*2.1;
  const radiatorHeatRejectionW=thermostatOpening*clamp(coolantFlowLPerMin/45,0,1.5)*
    Math.max(0,previous.coolantTemperatureC-ambient)*95+
    Math.max(0,previous.coolantTemperatureC-ambient)*1.8;
  const coolantThermalMass=25000*clamp(coolantLevelL/6.2,.12,1);
  const coolantDelta=(coolantHeatInput-radiatorHeatRejectionW)*dtSeconds/coolantThermalMass;
  const coolantTemperatureC=clamp(previous.coolantTemperatureC+coolantDelta,ambient,125);
  const headTemperatureC=clamp(previous.headTemperatureC+
    ((coolantTemperatureC+load*115)-previous.headTemperatureC)*dtSeconds/18,ambient,260);
  const oilHeatInput=input.rpm===0?0:350+load*input.rpm*.42;
  const oilCooling=(previous.oilTemperatureC-ambient)*(input.rpm===0?.35:2.5+oilFlowLPerMin*.32);
  const oilThermalMass=12500*clamp(oilLevelL/4.2,.15,1);
  const oilTemperatureC=clamp(previous.oilTemperatureC+
    (oilHeatInput-oilCooling)*dtSeconds/oilThermalMass,ambient,190);
  const exhaustTemperatureC=clamp(input.exhaustGasTemperatureC,ambient,1050);
  return {
    oilTemperatureC,oilPressureBar,oilFlowLPerMin,oilLevelL,
    coolantTemperatureC,coolantPressureBar,coolantFlowLPerMin,coolantLevelL,headTemperatureC,
    exhaustTemperatureC,thermostatOpening,radiatorHeatRejectionW,bearingFilmRatio,
    lubricationWarning,overheating:coolantTemperatureC>=112||headTemperatureC>=220
  };
}
