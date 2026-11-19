import { describe, expect, it } from "vitest";
import { createEngineGeometry } from "../geometry/engine-geometry";
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
      expect(Math.hypot(x,y-r*Math.cos(s.crankAngleRad))).toBeLessThan(L+1e-9);
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

  it("raises oil pressure and pump flow with engine speed, within relief limits",()=>{
    const stopped=advanceEngineSystems(INITIAL_ENGINE_SYSTEMS,{rpm:0,load:0,exhaustGasTemperatureC:25},.1);
    const running=advanceEngineSystems(INITIAL_ENGINE_SYSTEMS,{rpm:3500,load:.65,exhaustGasTemperatureC:650},.1);
    expect(stopped.oilPressureBar).toBe(0);
    expect(running.oilPressureBar).toBeGreaterThan(1);
    expect(running.oilPressureBar).toBeLessThanOrEqual(5.2);
    expect(running.oilFlowLPerMin).toBeGreaterThan(0);
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
