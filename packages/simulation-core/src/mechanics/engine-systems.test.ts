import { describe, expect, it } from "vitest";
import { createEngineGeometry } from "../geometry/engine-geometry";
import { DEFAULT_VALVE_TIMING } from "./valve-timing";
import {
  advanceEngineSystems,
  calculateCylinderMechanics,
  INITIAL_ENGINE_SYSTEMS
} from "./engine-systems";

const geometry=createEngineGeometry({
  cylinderCount:4,boreM:.086,strokeM:.086,connectingRodLengthM:.143,
  compressionRatio:10.5,bankAngleRad:Math.PI/2
});

describe("constrained inline-four mechanics",()=>{
  it("keeps the connecting rod at its specified rigid length through a full revolution",()=>{
    for(let angle=0;angle<360;angle+=3){
      const s=calculateCylinderMechanics(geometry,angle,angle,0,2400);
      const r=geometry.crankRadiusM,L=geometry.connectingRodLengthM;
      const x=r*Math.sin(s.crankAngleRad);
      const y=L+r-s.pistonDisplacementM-r*Math.cos(s.crankAngleRad);
      expect(Math.hypot(x,y)).toBeCloseTo(L,8);
      expect(s.pistonDisplacementM).toBeGreaterThanOrEqual(0);
      expect(s.pistonDisplacementM).toBeLessThanOrEqual(geometry.strokeM);
    }
  });

  it("limits commanded valve lift before piston interference",()=>{
    for(let angle=0;angle<720;angle+=2){
      const s=calculateCylinderMechanics(geometry,angle,angle,0,3000);
      expect(s.minimumValveClearanceMm).toBeGreaterThanOrEqual(1-1e-8);
      expect(s.intakeLiftActualMm).toBeLessThanOrEqual(s.intakeLiftCommandMm+1e-8);
      expect(s.exhaustLiftActualMm).toBeLessThanOrEqual(s.exhaustLiftCommandMm+1e-8);
    }
  });

  it("clips an aggressive cam profile before the valve head intersects the piston",()=>{
    const highCompression=createEngineGeometry({
      cylinderCount:4,boreM:.086,strokeM:.086,connectingRodLengthM:.143,
      compressionRatio:15,bankAngleRad:Math.PI/2
    });
    const unsafeTiming={...DEFAULT_VALVE_TIMING,intakeOpensBtdc:10,intakeClosesAbdc:-170,intakeMaxLiftMm:20};
    const state=calculateCylinderMechanics(highCompression,0,0,0,2500,unsafeTiming);
    expect(state.valveCollision).toBe(true);
    expect(state.intakeLiftActualMm).toBeLessThan(state.intakeLiftCommandMm);
    expect(state.minimumValveClearanceMm).toBeGreaterThanOrEqual(1-1e-8);
  });

  it("reduces effective valve lift when the valve train floats",()=>{
    const stable=calculateCylinderMechanics(geometry,90,90,0,7800,DEFAULT_VALVE_TIMING,0);
    const floating=calculateCylinderMechanics(geometry,250,250,0,7800,DEFAULT_VALVE_TIMING,.8);
    expect(floating.intakeLiftActualMm).toBeLessThan(stable.intakeLiftActualMm);
    expect(floating.valveFloatSeverity).toBeCloseTo(.8);
  });

  it("reduces piston skirt clearance as the piston expands thermally",()=>{
    const cold=calculateCylinderMechanics(geometry,180,180,0,2500);
    const hot=calculateCylinderMechanics(geometry,180,180,0,2500,DEFAULT_VALVE_TIMING,0,.12);
    expect(hot.skirtClearanceMm).toBeLessThan(cold.skirtClearanceMm);
    expect(hot.skirtClearanceMm).toBeLessThan(0);
    expect(hot.mechanicalWarning).toContain("Interferencia térmica");
  });

  it("raises oil pressure and pump flow with engine speed, within relief limits",()=>{
    const stopped=advanceEngineSystems(INITIAL_ENGINE_SYSTEMS,{rpm:0,load:0,exhaustGasTemperatureC:25},.1);
    const running=advanceEngineSystems(INITIAL_ENGINE_SYSTEMS,{rpm:3500,load:.65,exhaustGasTemperatureC:650},.1);
    expect(stopped.oilPressureBar).toBe(0);
    expect(running.oilPressureBar).toBeGreaterThan(1);
    expect(running.oilPressureBar).toBeLessThanOrEqual(5.2);
    expect(running.oilFlowLPerMin).toBeGreaterThan(0);
  });

  it("maintains a viable oil film at hot idle with a full sump",()=>{
    const hotIdle={...INITIAL_ENGINE_SYSTEMS,oilTemperatureC:95};
    const next=advanceEngineSystems(hotIdle,{rpm:800,load:.25,exhaustGasTemperatureC:420},.05);
    expect(next.oilPressureBar).toBeGreaterThan(1);
    expect(next.bearingFilmRatio).toBeGreaterThan(.48);
    expect(next.lubricationWarning).toBe(false);
  });

  it("opens the thermostat as coolant warms and rejects heat",()=>{
    const warm={...INITIAL_ENGINE_SYSTEMS,coolantTemperatureC:100,headTemperatureC:120};
    const next=advanceEngineSystems(warm,{rpm:3000,load:.7,exhaustGasTemperatureC:720},.25);
    expect(next.thermostatOpening).toBe(1);
    expect(next.radiatorHeatRejectionW).toBeGreaterThan(0);
    expect(next.coolantFlowLPerMin).toBeGreaterThan(0);
  });

  it("rejects impossible integration steps",()=>{
    expect(()=>advanceEngineSystems(INITIAL_ENGINE_SYSTEMS,{rpm:1000,load:.5,exhaustGasTemperatureC:500},2)).toThrow(RangeError);
    expect(()=>calculateCylinderMechanics(geometry,0,0,0,-1)).toThrow(RangeError);
  });
});
