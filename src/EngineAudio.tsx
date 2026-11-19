import { memo, useEffect, useRef, useState } from "react";
import { inlineFourBodyFrequencies, normalizeEngineLoad } from "./audio/engine-audio-model";

type EngineMode = "off" | "cranking" | "running";
type Props = { rpm: number; running: boolean; load?: number; cycleAngle: number; engineMode: EngineMode };
type AudioRig = {
  context: AudioContext;
  master: GainNode;
  body: OscillatorNode[];
  bodyGains: GainNode[];
  pulseBuffer: AudioBuffer;
  pulseFilter: BiquadFilterNode;
  noise: AudioBufferSourceNode;
  noiseGain: GainNode;
  noiseFilter: BiquadFilterNode;
  starter: OscillatorNode;
  starterGain: GainNode;
};

/** Exhaust events are one-shot pressure pulses triggered by the simulated 180-degree firing intervals. */
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
      compressor.threshold.value = -22;
      compressor.knee.value = 16;
      compressor.ratio.value = 3.8;
      compressor.attack.value = .004;
      compressor.release.value = .16;
      master.connect(compressor);
      compressor.connect(context.destination);

      const body: OscillatorNode[] = [];
      const bodyGains: GainNode[] = [];
      const makeBody = (type: OscillatorType, frequency: number, gainValue: number) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.value = frequency;
        gain.gain.value = gainValue;
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start();
        body.push(oscillator);
        bodyGains.push(gain);
      };
      makeBody("sine", 42, .035);
      makeBody("triangle", 84, .012);
      makeBody("sawtooth", 126, .003);

      // A single exhaust pulse has a sharp pressure front, a low-frequency body
      // resonance and a decaying broadband tail rather than a continuous square wave.
      const pulseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * .24), context.sampleRate);
      const pulseData = pulseBuffer.getChannelData(0);
      for (let i = 0; i < pulseData.length; i++) {
        const t = i / context.sampleRate;
        const envelope = Math.exp(-t * 24);
        const noise = (Math.random() * 2 - 1) * .46;
        const low = Math.sin(2 * Math.PI * 72 * t) * .72 + Math.sin(2 * Math.PI * 138 * t) * .24;
        const crack = Math.sin(2 * Math.PI * (520 - 900 * t) * t) * Math.exp(-t * 72) * .18;
        pulseData[i] = (noise * .34 + low + crack) * envelope;
      }
      const pulseFilter = context.createBiquadFilter();
      pulseFilter.type = "lowpass";
      pulseFilter.frequency.value = 780;
      pulseFilter.Q.value = .72;
      pulseFilter.connect(master);

      const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) noiseData[i] = (Math.random() * 2 - 1) * .5;
      const noise = context.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;
      const noiseFilter = context.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.value = 920;
      noiseFilter.Q.value = .7;
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

      rig.current = { context, master, body, bodyGains, pulseBuffer, pulseFilter, noise, noiseGain, noiseFilter, starter, starterGain };
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
    const { context, master, body, bodyGains, noiseGain, noiseFilter, starter, starterGain } = active;
    const now = context.currentTime;
    const safeRpm = Math.max(0, Number.isFinite(rpm) ? rpm : 0);
    const normalizedLoad = normalizeEngineLoad(load);
    const engineOn = enabled && running && engineMode === "running" && safeRpm > 0;
    const cranking = enabled && running && engineMode === "cranking";
    const frequencies = inlineFourBodyFrequencies(safeRpm);
    body.forEach((oscillator, index) => oscillator.frequency.setTargetAtTime(frequencies[index] ?? 0, now, .055));
    bodyGains.forEach((gain, index) => gain.gain.setTargetAtTime(engineOn ? [.045, .018, .006][index]! * (.65 + normalizedLoad) : 0, now, .06));
    noiseFilter.frequency.setTargetAtTime(650 + normalizedLoad * 1250 + safeRpm * .045, now, .08);
    noiseGain.gain.setTargetAtTime(engineOn ? .018 + normalizedLoad * .035 : 0, now, .07);
    starter.frequency.setTargetAtTime(105 + safeRpm * .16, now, .04);
    starterGain.gain.setTargetAtTime(cranking ? .075 : 0, now, .035);
    master.gain.setTargetAtTime(engineOn ? .76 : cranking ? .42 : 0, now, .08);
  }, [rpm, running, load, enabled, engineMode]);

  useEffect(() => {
    const active = rig.current;
    const previous = lastAngle.current;
    const previousTime = lastAudioTime.current;
    const nowMs = performance.now();
    lastAngle.current = cycleAngle;
    lastAudioTime.current = nowMs;
    if (!active || !enabled || !running || engineMode !== "running" || rpm < 120 || previous === null || previousTime === null) return;

    // Estimate angular travel over the UI sampling interval from the live shaft
    // speed. This preserves every firing pulse even when a frame spans 360°+
    // or the 720° cycle wraps between React updates.
    const elapsed = Math.max(0, (nowMs - previousTime) / 1000);
    const advanceDeg = Math.max(0, rpm * 6 * elapsed);
    const crossings = Math.floor((previous + advanceDeg) / 180) - Math.floor(previous / 180);
    if (crossings <= 0) return;

    const { context, pulseBuffer, pulseFilter } = active;
    const pulseLevel = .16 + normalizeEngineLoad(load) * .26;
    const intervalSeconds = 30 / Math.max(120, rpm);
    const firstCrossingDeg = 180 - (previous % 180);
    const firstDelay = Math.max(0, firstCrossingDeg / (rpm * 6) - elapsed);
    for (let i = 0; i < Math.min(crossings, 12); i++) {
      const source = context.createBufferSource();
      const gain = context.createGain();
      const at = context.currentTime + firstDelay + i * intervalSeconds;
      source.buffer = pulseBuffer;
      gain.gain.setValueAtTime(pulseLevel, at);
      source.connect(gain);
      gain.connect(pulseFilter);
      source.start(at);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
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
