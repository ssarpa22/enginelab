import { memo, useEffect, useMemo, useRef, useState } from "react";
import "./engine-audio.css";

type EngineMode = "off" | "cranking" | "running";
type Props = { rpm: number; running: boolean; load?: number; cycleAngle: number; engineMode: EngineMode };
type Recording = { id: string; path: string };
type Engine = { manufacturer: string; model: string; recordings: Record<string, Recording[]> };
type Manifest = { available: boolean; engines: Engine[]; error?: string };
type Track = { rpm: number; source: AudioBufferSourceNode; gain: GainNode };
type AudioRig = { context: AudioContext; master: GainNode; tracks: Track[] };

const RPM_LEVELS = [1000, 1500, 2000] as const;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const audioUrl = (recording: Recording) => `/__audio_lab__/audio?path=${encodeURIComponent(recording.path)}`;

function EngineAudio({ rpm, running, load = .45, engineMode }: Props) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [selectedEngine, setSelectedEngine] = useState("");
  const [selectedTake, setSelectedTake] = useState("");
  const [volume, setVolume] = useState(.72);
  const [enabled, setEnabled] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [audioError, setAudioError] = useState("");
  const rig = useRef<AudioRig | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/__audio_lab__/manifest")
      .then(response => {
        if (!response.ok) throw new Error("No se pudo consultar el catálogo de motores.");
        return response.json() as Promise<Manifest>;
      })
      .then(data => {
        if (!active) return;
        setManifest(data);
        const first = data.engines[0];
        if (first) {
          setSelectedEngine(`${first.manufacturer}/${first.model}`);
          const firstTake = RPM_LEVELS.flatMap(level => first.recordings[String(level)] ?? [])[0];
          if (firstTake) setSelectedTake(firstTake.id);
        }
      })
      .catch(error => {
        if (active) setManifest({ available: false, engines: [], error: error instanceof Error ? error.message : "Error desconocido." });
      });
    return () => { active = false; };
  }, []);

  const engines = manifest?.engines ?? [];
  const engine = engines.find(item => `${item.manufacturer}/${item.model}` === selectedEngine) ?? null;
  const availableTakes = useMemo(() => {
    if (!engine) return [];
    return [...new Set(RPM_LEVELS.flatMap(level => (engine.recordings[String(level)] ?? []).map(item => item.id)))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [engine]);

  useEffect(() => {
    if (availableTakes.length && !availableTakes.includes(selectedTake)) setSelectedTake(availableTakes[0]!);
  }, [availableTakes, selectedTake]);

  const recordings = useMemo(() => RPM_LEVELS.map(level => ({
    rpm: level,
    recording: (engine?.recordings[String(level)] ?? []).find(item => item.id === selectedTake) ?? null
  })).filter(item => item.recording !== null), [engine, selectedTake]);

  const ensureRig = () => {
    if (!rig.current) {
      const context = new AudioContext();
      const master = context.createGain();
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      compressor.attack.value = .008;
      compressor.release.value = .2;
      master.gain.value = 0;
      master.connect(compressor);
      compressor.connect(context.destination);
      rig.current = { context, master, tracks: [] };
    }
    return rig.current;
  };

  const toggleAudio = () => {
    if (enabled) {
      setEnabled(false);
      return;
    }
    const active = ensureRig();
    void active.context.resume();
    setAudioError("");
    setEnabled(true);
  };

  useEffect(() => {
    const active = rig.current;
    if (!active || !enabled) {
      setAudioReady(false);
      return;
    }
    let cancelled = false;
    setAudioReady(false);
    setAudioError("");
    active.master.gain.setTargetAtTime(0, active.context.currentTime, .025);
    for (const track of active.tracks) {
      try { track.source.stop(); } catch { /* already stopped */ }
      track.source.disconnect();
      track.gain.disconnect();
    }
    active.tracks = [];

    const loadTracks = async () => {
      try {
        const decoded = await Promise.all(recordings.map(async item => {
          const response = await fetch(audioUrl(item.recording!));
          if (!response.ok) throw new Error(`No se pudo cargar la grabación de ${item.rpm} RPM.`);
          return { rpm: item.rpm, buffer: await active.context.decodeAudioData(await response.arrayBuffer()) };
        }));
        if (cancelled) return;
        active.tracks = decoded.map(item => {
          const source = active.context.createBufferSource();
          const gain = active.context.createGain();
          source.buffer = item.buffer;
          source.loop = true;
          source.connect(gain);
          gain.connect(active.master);
          source.start();
          return { rpm: item.rpm, source, gain };
        });
        setAudioReady(true);
      } catch (error) {
        if (!cancelled) {
          setAudioError(error instanceof Error ? error.message : "No se pudieron cargar las grabaciones.");
          setEnabled(false);
        }
      }
    };
    if (recordings.length) void loadTracks();
    else {
      setAudioError("Esta toma no tiene grabaciones compatibles.");
      setEnabled(false);
    }
    return () => {
      cancelled = true;
      for (const track of active.tracks) {
        try { track.source.stop(); } catch { /* already stopped */ }
        track.source.disconnect();
        track.gain.disconnect();
      }
      active.tracks = [];
    };
  }, [enabled, selectedEngine, selectedTake, recordings]);

  useEffect(() => {
    const active = rig.current;
    if (!active) return;
    const safeRpm = Math.max(0, Number.isFinite(rpm) ? rpm : 0);
    const tracks = active.tracks;
    if (!tracks.length) {
      active.master.gain.setTargetAtTime(0, active.context.currentTime, .06);
      return;
    }

    // Blend adjacent steady-state recordings; each layer is pitch/rate-shifted
    // from its recorded RPM to the current simulated crankshaft speed.
    const sorted = [...tracks].sort((a, b) => a.rpm - b.rpm);
    const lower = [...sorted].reverse().find(track => track.rpm <= safeRpm) ?? sorted[0]!;
    const upper = sorted.find(track => track.rpm >= safeRpm) ?? sorted[sorted.length - 1]!;
    const span = upper.rpm - lower.rpm;
    const blend = lower === upper || span === 0 ? 0 : clamp((safeRpm - lower.rpm) / span, 0, 1);
    for (const track of sorted) {
      const weight = track === lower ? 1 - blend : track === upper ? blend : 0;
      track.gain.gain.setTargetAtTime(weight, active.context.currentTime, .12);
      track.source.playbackRate.setTargetAtTime(clamp(safeRpm / track.rpm, .5, 3.5), active.context.currentTime, .12);
    }
    const engineOn = enabled && audioReady && running && engineMode === "running" && safeRpm > 0;
    const loadFactor = .82 + clamp(load, 0, 1) * .18;
    active.master.gain.setTargetAtTime(engineOn ? volume * .72 * loadFactor : 0, active.context.currentTime, .09);
  }, [rpm, running, load, engineMode, enabled, audioReady, volume]);

  useEffect(() => () => {
    const active = rig.current;
    if (!active) return;
    for (const track of active.tracks) {
      try { track.source.stop(); } catch { /* already stopped */ }
    }
    void active.context.close();
  }, []);

  const unavailable = manifest !== null && !manifest.available;

  return <div className="engine-audio-control">
    <div className="engine-audio-selectors">
      <label title="Elegir el motor grabado">
        <span>MOTOR REAL</span>
        <select value={selectedEngine} onChange={event => setSelectedEngine(event.target.value)} disabled={!manifest?.available}>
          {engines.map(item => <option key={item.manufacturer + item.model} value={`${item.manufacturer}/${item.model}`}>{item.manufacturer} · {item.model}</option>)}
        </select>
      </label>
      <label title="Elegir una toma del mismo vehículo">
        <span>TOMA</span>
        <select value={selectedTake} onChange={event => setSelectedTake(event.target.value)} disabled={!availableTakes.length}>
          {availableTakes.map(take => <option key={take} value={take}>{take}</option>)}
        </select>
      </label>
    </div>
    <div className="engine-audio-actions">
      <button className={`sound-button ${enabled ? "sound-enabled" : ""}`} type="button" onClick={toggleAudio} disabled={!manifest?.available || unavailable || !selectedTake} aria-pressed={enabled}>
        {enabled ? "♫ AUDIO ACTIVADO" : "♫ ACTIVAR AUDIO"}
      </button>
      <label className="engine-audio-volume" title="Volumen del motor">
        <span>VOL.</span>
        <input aria-label="Volumen del audio" type="range" min="0" max="1" step=".01" value={volume} onChange={event => setVolume(Number(event.target.value))} />
      </label>
    </div>
    {audioError && <span className="engine-audio-error">{audioError}</span>}
    {unavailable && <span className="engine-audio-error">Dataset local no disponible. Revisá la extracción de HL-CEAD.</span>}
    {enabled && <span className="engine-audio-status">{audioReady ? `${Math.round(rpm)} RPM · GRABACIONES REALES` : "CARGANDO GRABACIONES…"}</span>}
  </div>;
}

export default memo(EngineAudio);
