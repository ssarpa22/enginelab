import { describe,expect,it } from "vitest";
import { inlineFourBodyFrequencies,inlineFourFiringFrequencyHz,normalizeEngineLoad } from "./engine-audio-model";

describe("inline-four audio model",()=>{
 it("produces one firing event every 180 crank degrees",()=>{
  expect(inlineFourFiringFrequencyHz(900)).toBe(30);
  expect(inlineFourFiringFrequencyHz(3000)).toBe(100);
  expect(inlineFourFiringFrequencyHz(0)).toBe(0);
 });
 it("keeps mechanical harmonics ordered and silent at zero rpm",()=>{
  expect(inlineFourBodyFrequencies(0)).toEqual([0,0,0]);
  const [fundamental,second,third]=inlineFourBodyFrequencies(2400);
  expect(second).toBeGreaterThan(fundamental);
  expect(third).toBeGreaterThan(second);
 });
 it("clamps load to a safe acoustic range",()=>{
  expect(normalizeEngineLoad(-1)).toBe(.12);
  expect(normalizeEngineLoad(4)).toBe(.95);
  expect(normalizeEngineLoad(.6)).toBe(.6);
 });
});
