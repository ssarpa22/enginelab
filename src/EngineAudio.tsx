import { memo, useEffect, useRef, useState } from "react";
import { engineAudioProfile, normalizeEngineLoad } from "./audio/engine-audio-model";

type EngineMode = "off" | "cranking" | "running";
type Props = { rpm: number; running: boolean; load?: number; cycleAngle: number; engineMode: EngineMode };
type AudioRig = {
  context: AudioContext;
  master: GainNode;
  pulseBuffer: AudioBuffer;
  pulseFilters: BiquadFilterNode[];
  pulseBandGains: GainNode[];
  intake: AudioBufferSourceNode;
  intakeFilter: BiquadFilterNode;
  intakeGain: GainNode;
  mechanical: AudioBufferSourceNode;
  mechanicalFilter: BiquadFilterNode;
  mechanicalGain: GainNode;
  starter: OscillatorNode;
  starterGain: GainNode;
};

function makeNoiseBuffer(context: AudioContext, seconds: number, seedStart: number): AudioBuffer {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = seedStart >>> 0;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = ((seed / 0xffffffff) * 2 - 1) * 0.5;
  }
  return buffer;
}

/** Granular, transient-based engine audio. No continuous pitched engine oscillator bed. */
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
      compressor.threshold.value = -18;
      compressor.knee.value = 16;
      compressor.ratio.value = 3.5;
      compressor.attack.value = .002;
      compressor.release.value = .16;
      master.connect(compressor);
      compressor.connect(context.destination);

      // A multi-part exhaust sample: sharp pressure crack, low body and noisy gas tail.
      // Its spectral balance is then shifted continuously with RPM and cylinder load.
      const pulseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * .28), context.sampleRate);
      const pulse = pulseBuffer.getChannelData(0);
      let seed = 0x51f15e;
      let lowState = 0;
      for (let i = 0; i < pulse.length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const noise = (seed / 0xffffffff) * 2 - 1;
        const t = i / context.sampleRate;
        lowState += (noise - lowState) * 0.035;
        const crack = Math.exp(-t * 145) * noise * 0.72;
        const pressureBody = Math.sin(2 * Math.PI * 86 * t) * Math.exp(-t * 15) * 0.28;
        const gasTail = noise * Math.exp(-t * 9.5) * 0.2;
        pulse[i] = crack + pressureBody + gasTail + lowState * Math.exp(-t * 18) * 0.2;
      }

      const bands = [
        { type: "lowpass" as BiquadFilterType, frequency: 118, q: .8, gain: .78 },
        { type: "bandpass" as BiquadFilterType, frequency: 175, q: 1.15, gain: .52 },
        { type: "bandpass" as BiquadFilterType, frequency: 520, q: 1.05, gain: .22 },
        { type: "highpass" as BiquadFilterType, frequency: 900, q: .72, gain: .08 },
      ];
      const pulseFilters: BiquadFilterNode[] = [];
      const pulseBandGains: GainNode[] = [];
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

      // Induction: broad airflow noise whose spectrum opens with throttle/load and RPM.
      const intake = context.createBufferSource();
      intake.buffer = makeNoiseBuffer(context, 2, 0x1a2b3c);
      intake.loop = true;
      const intakeFilter = context.createBiquadFilter();
      intakeFilter.type = "bandpass";
      intakeFilter.frequency.value = 700;
      intakeFilter.Q.value = .55;
      const intakeGain = context.createGain();
      intakeGain.gain.value = 0;
      intake.connect(intakeFilter);
      intakeFilter.connect(intakeGain);
      intakeGain.connect(master);
      intake.start();

      // Valvetrain/mechanical texture is deliberately separate and high-passed.
      const mechanical = context.createBufferSource();
      mechanical.buffer = makeNoiseBuffer(context, 2, 0x77cafe);
      mechanical.loop = true;
      const mechanicalFilter = context.createBiquadFilter();
      mechanicalFilter.type = "highpass";
      mechanicalFilter.frequency.value = 1_400;
      mechanicalFilter.Q.value = .65;
      const mechanicalGain = context.createGain();
      mechanicalGain.gain.value = 0;
      mechanical.connect(mechanicalFilter);
      mechanicalFilter.connect(mechanicalGain);
      mechanicalGain.connect(master);
      mechanical.start();

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

      rig.current = { context, master, pulseBuffer, pulseFilters, pulseBandGains, intake, intakeFilter, intakeGain, mechanical, mechanicalFilter, mechanicalGain, starter, starterGain };
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
    const { context, master, intakeGain, intakeFilter, mechanicalGain, mechanicalFilter, pulseFilters, pulseBandGains, starter, starterGain } = active;
    const now = context.currentTime;
    const safeRpm = Math.max(0, Number.isFinite(rpm) ? rpm : 0);
    const profile = engineAudioProfile(safeRpm, normalizeEngineLoad(load));
    const engineOn = enabled && running && engineMode === "running" && safeRpm > 0;
    const cranking = enabled && running && engineMode === "cranking";

    pulseFilters[0]!.frequency.setTargetAtTime(profile.exhaustLowFrequencyHz * 1.48, now, .08);
    pulseFilters[1]!.frequency.setTargetAtTime(profile.exhaustMidFrequencyHz, now, .08);
    pulseFilters[2]!.frequency.setTargetAtTime(profile.exhaustHighFrequencyHz, now, .08);
    pulseFilters[3]!.frequency.setTargetAtTime(1_000 + profile.normalizedRpm * 2_500, now, .08);
    pulseBandGains[0]!.gain.setTargetAtTime(.65 + profile.torqueFactor * .24, now, .08);
    pulseBandGains[1]!.gain.setTargetAtTime(.3 + profile.exhaustBrightness * .42, now, .08);
    pulseBandGains[2]!.gain.setTargetAtTime(.08 + profile.exhaustBrightness * .3, now, .08);
    pulseBandGains[3]!.gain.setTargetAtTime(.025 + profile.exhaustBrightness * .12, now, .08);

    intakeFilter.frequency.setTargetAtTime(profile.intakeFrequencyHz, now, .12);
    intakeGain.gain.setTargetAtTime(engineOn ? profile.intakeGain : 0, now, .1);
    mechanicalFilter.frequency.setTargetAtTime(profile.mechanicalFrequencyHz, now, .12);
    mechanicalGain.gain.setTargetAtTime(engineOn ? profile.mechanicalGain : 0, now, .1);
    starter.frequency.setTargetAtTime(105 + safeRpm * .16, now, .04);
    starterGain.gain.setTargetAtTime(cranking ? .065 : 0, now, .035);
    master.gain.setTargetAtTime(engineOn ? .88 : cranking ? .38 : 0, now, .08);
  }, [rpm, running, load, enabled, engineMode]);

  useEffect(() => {
    const active = rig.current;
    const previous = lastAngle.current;
    const previousTime = lastAudioTime.current;
    const nowMs = performance.now();
    lastAngle.current = cycleAngle;
    lastAudioTime.current = nowMs;
    if (!active || !enabled || !running || engineMode !== "running" || rpm <= 0 || previous === null || previousTime === null) return;

    // cycleAngle is the complete 720-degree four-stroke crank cycle. Detect each
    // 180-degree firing crossing from actual shaft travel, including UI frame gaps.
    // The simulation angle wraps at 720 degrees; unwrap one UI interval before
    // counting boundaries so a firing event at the cycle seam is never lost.
    const advanceDeg = cycleAngle >= previous
      ? cycleAngle - previous
      : 720 - previous + cycleAngle;
    const elapsed = Math.max(0, (nowMs - previousTime) / 1000);
    const crossings = Math.floor((previous + advanceDeg) / 180) - Math.floor(previous / 180);
    if (crossings <= 0 || advanceDeg <= 0 || elapsed <= 0) return;

    const { context, pulseBuffer, pulseFilters } = active;
    const profile = engineAudioProfile(rpm, load);
    const intervalSeconds = 30 / Math.max(1, rpm);
    const firstCrossingDeg = 180 - (previous % 180);
    const firstDelay = Math.max(0, firstCrossingDeg / advanceDeg * elapsed);
    for (let i = 0; i < Math.min(crossings, 12); i++) {
      const source = context.createBufferSource();
      source.buffer = pulseBuffer;
      const eventGain = context.createGain();
      eventGain.gain.value = profile.exhaustGain * (0.72 + profile.exhaustBrightness * 0.4);
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
