import { describe,expect,it } from "vitest";
import { exhaustPulseGain,inlineFourFiringFrequencyHz,normalizeEngineLoad } from "./engine-audio-model";

describe("inline-four exhaust audio model",()=>{
 it("produces one firing event every 180 crank degrees",()=>{
  expect(inlineFourFiringFrequencyHz(900)).toBe(30);
  expect(inlineFourFiringFrequencyHz(3000)).toBe(100);
  expect(inlineFourFiringFrequencyHz(0)).toBe(0);
 });
 it("clamps load to a safe acoustic range",()=>{
  expect(normalizeEngineLoad(-1)).toBe(.12);
  expect(normalizeEngineLoad(4)).toBe(.95);
  expect(normalizeEngineLoad(.6)).toBe(.6);
 });
 it("scales pressure-pulse energy with RPM and load and stays silent at zero RPM",()=>{
  expect(exhaustPulseGain(0,.8)).toBe(0);
  expect(exhaustPulseGain(3000,.8)).toBeGreaterThan(exhaustPulseGain(3000,.2));
  expect(exhaustPulseGain(6000,.8)).toBeGreaterThan(exhaustPulseGain(3000,.8));
 });
});
