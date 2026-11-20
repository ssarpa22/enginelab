import { memo, useEffect, useRef, useState } from "react";
import { exhaustPulseGain, normalizeEngineLoad } from "./audio/engine-audio-model";

type EngineMode = "off" | "cranking" | "running";
type Props = { rpm: number; running: boolean; load?: number; cycleAngle: number; engineMode: EngineMode };
type AudioRig = {
  context: AudioContext;
  master: GainNode;
  pulseBuffer: AudioBuffer;
  pulseFilters: BiquadFilterNode[];
  pulseBandGains: GainNode[];
  noise: AudioBufferSourceNode;
  noiseGain: GainNode;
  noiseFilter: BiquadFilterNode;
  starter: OscillatorNode;
  starterGain: GainNode;
};

/** Exhaust impulses are fired at the inline-four's 180-degree firing intervals. */
function EngineAudio({ rpm, running, load = .45, cycleAngle, engineMode }: Props) {
  const rig = useRef<AudioRig | null>(null);
  const lastAngle = useRef<number | null>(null);
  const lastAudioTime = useRef<number | null>(null);
  const [enabled, setEnabled] = useState(false);

  const start = () => {
    if (!rig.current) {
      const context = new AudioContext();
      const master = context.createGain();
      const compressor = context.createDynamicsCompressor();
      master.gain.value = 0;
      compressor.threshold.value = -20;
      compressor.knee.value = 18;
      compressor.ratio.value = 3.2;
      compressor.attack.value = .003;
      compressor.release.value = .19;
      master.connect(compressor);
      compressor.connect(context.destination);

      // A short, broadband pressure front with a decaying gas-flow tail.
      // Resonant filters model the exhaust tract; there are no pitched engine oscillators.
      const pulseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * .34), context.sampleRate);
      const pulseData = pulseBuffer.getChannelData(0);
      let seed = 0x51f15e;
      for (let i = 0; i < pulseData.length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const noise = (seed / 0xffffffff) * 2 - 1;
        const t = i / context.sampleRate;
        const sharpFront = Math.exp(-t * 115);
        const gasTail = Math.exp(-t * 10.5);
        pulseData[i] = noise * (sharpFront * .76 + gasTail * .24);
      }
      const pulseFilters: BiquadFilterNode[] = [];
      const pulseBandGains: GainNode[] = [];
      const bands = [
        { type: "lowpass" as BiquadFilterType, frequency: 175, q: .72, gain: .9 },
        { type: "bandpass" as BiquadFilterType, frequency: 105, q: 1.05, gain: .48 },
        { type: "bandpass" as BiquadFilterType, frequency: 255, q: 1.25, gain: .24 },
        { type: "highpass" as BiquadFilterType, frequency: 680, q: .7, gain: .09 }
      ];
      for (const band of bands) {
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        filter.type = band.type;
        filter.frequency.value = band.frequency;
        filter.Q.value = band.q;
        gain.gain.value = band.gain;
        filter.connect(gain);
        gain.connect(master);
        pulseFilters.push(filter);
        pulseBandGains.push(gain);
      }

      // Quiet induction/airflow bed; exhaust transients carry the engine character.
      const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        noiseData[i] = ((seed / 0xffffffff) * 2 - 1) * .5;
      }
      const noise = context.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;
      const noiseFilter = context.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.value = 760;
      noiseFilter.Q.value = .62;
      const noiseGain = context.createGain();
      noiseGain.gain.value = 0;
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(master);
      noise.start();

      const starter = context.createOscillator();
      const starterFilter = context.createBiquadFilter();
      const starterGain = context.createGain();
      starter.type = "sawtooth";
      starter.frequency.value = 110;
      starterFilter.type = "bandpass";
      starterFilter.frequency.value = 430;
      starterFilter.Q.value = .85;
      starterGain.gain.value = 0;
      starter.connect(starterFilter);
      starterFilter.connect(starterGain);
      starterGain.connect(master);
      starter.start();

      rig.current = { context, master, pulseBuffer, pulseFilters, pulseBandGains, noise, noiseGain, noiseFilter, starter, starterGain };
    }
    void rig.current.context.resume();
    lastAngle.current = cycleAngle;
    lastAudioTime.current = performance.now();
    setEnabled(true);
  };

  const stop = () => {
    const active = rig.current;
    if (active) active.master.gain.setTargetAtTime(0, active.context.currentTime, .045);
    setEnabled(false);
  };

  useEffect(() => {
    const active = rig.current;
    if (!active) return;
    const { context, master, noiseGain, noiseFilter, starter, starterGain } = active;
    const now = context.currentTime;
    const safeRpm = Math.max(0, Number.isFinite(rpm) ? rpm : 0);
    const normalizedLoad = normalizeEngineLoad(load);
    const engineOn = enabled && running && engineMode === "running" && safeRpm > 0;
    const cranking = enabled && running && engineMode === "cranking";
    noiseFilter.frequency.setTargetAtTime(520 + normalizedLoad * 900 + safeRpm * .025, now, .1);
    noiseGain.gain.setTargetAtTime(engineOn ? .003 + normalizedLoad * .009 : 0, now, .08);
    starter.frequency.setTargetAtTime(105 + safeRpm * .16, now, .04);
    starterGain.gain.setTargetAtTime(cranking ? .075 : 0, now, .035);
    master.gain.setTargetAtTime(engineOn ? .9 : cranking ? .42 : 0, now, .08);
  }, [rpm, running, load, enabled, engineMode]);

  useEffect(() => {
    const active = rig.current;
    const previous = lastAngle.current;
    const previousTime = lastAudioTime.current;
    const nowMs = performance.now();
    lastAngle.current = cycleAngle;
    lastAudioTime.current = nowMs;
    if (!active || !enabled || !running || engineMode !== "running" || rpm <= 0 || previous === null || previousTime === null) return;

    // Use measured shaft travel between UI samples, not a fixed timer. This catches
    // multiple firing events if a frame spans more than one 180-degree interval.
    const elapsed = Math.max(0, (nowMs - previousTime) / 1000);
    const advanceDeg = Math.max(0, rpm * 6 * elapsed);
    const crossings = Math.floor((previous + advanceDeg) / 180) - Math.floor(previous / 180);
    if (crossings <= 0) return;

    const { context, pulseBuffer, pulseFilters } = active;
    const pulseLevel = exhaustPulseGain(rpm, load);
    const intervalSeconds = 30 / Math.max(1, rpm);
    const firstCrossingDeg = 180 - (previous % 180);
    const firstDelay = Math.max(0, firstCrossingDeg / (rpm * 6) - elapsed);
    for (let i = 0; i < Math.min(crossings, 16); i++) {
      const source = context.createBufferSource();
      source.buffer = pulseBuffer;
      // Each firing excites the exhaust resonances with the same pressure impulse.
      const eventGain = context.createGain();
      eventGain.gain.value = pulseLevel;
      source.connect(eventGain);
      pulseFilters.forEach(filter => eventGain.connect(filter));
      const at = context.currentTime + firstDelay + i * intervalSeconds;
      source.start(at);
      source.onended = () => { source.disconnect(); eventGain.disconnect(); };
    }
  }, [cycleAngle, enabled, running, engineMode, rpm, load]);

  useEffect(() => () => { void rig.current?.context.close(); }, []);

  return (
    <button className={`sound-button ${enabled ? "sound-enabled" : ""}`} type="button" onClick={enabled ? stop : start} aria-pressed={enabled}>
      {enabled ? "♫ AUDIO ACTIVADO" : "♫ ACTIVAR AUDIO"}
    </button>
  );
}

export default memo(EngineAudio);
