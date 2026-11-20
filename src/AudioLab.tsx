import { useEffect, useMemo, useState } from "react";
import "./audio-lab.css";

type Recording = { id: string; path: string };
type Engine = {
  manufacturer: string;
  model: string;
  recordings: Record<string, Recording[]>;
};
type Manifest = { available: boolean; engines: Engine[]; error?: string };

const RPM_LEVELS = ["1000", "1500", "2000"] as const;

function AudioLab() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [selectedEngine, setSelectedEngine] = useState("");
  const [selectedTake, setSelectedTake] = useState("0001");
  const [volume, setVolume] = useState(0.8);
  const [loop, setLoop] = useState(true);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/__audio_lab__/manifest")
      .then(response => {
        if (!response.ok) throw new Error("No se pudo consultar el dataset.");
        return response.json() as Promise<Manifest>;
      })
      .then(data => {
        if (!active) return;
        setManifest(data);
        const first = data.engines[0];
        if (first) {
          setSelectedEngine(`${first.manufacturer}/${first.model}`);
          const firstTake = RPM_LEVELS.flatMap(rpm => first.recordings[rpm] ?? [])[0];
          if (firstTake) setSelectedTake(firstTake.id);
        }
      })
      .catch(error => {
        if (active) setManifest({ available: false, engines: [], error: error instanceof Error ? error.message : "Error desconocido." });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const engines = manifest?.engines ?? [];
  const engine = engines.find(item => `${item.manufacturer}/${item.model}` === selectedEngine) ?? null;
  const filteredEngines = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    return engines.filter(item => !query || `${item.manufacturer} ${item.model}`.toLocaleLowerCase().includes(query));
  }, [engines, filter]);
  const availableTakes = useMemo(() => {
    if (!engine) return [];
    return [...new Set(RPM_LEVELS.flatMap(rpm => (engine.recordings[rpm] ?? []).map(item => item.id)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [engine]);

  useEffect(() => {
    if (availableTakes.length && !availableTakes.includes(selectedTake)) setSelectedTake(availableTakes[0]!);
  }, [availableTakes, selectedTake]);

  const audioUrl = (recording: Recording) => `/__audio_lab__/audio?path=${encodeURIComponent(recording.path)}`;
  const setAllVolumes = (value: number) => {
    document.querySelectorAll<HTMLAudioElement>(".audio-lab-player").forEach(audio => { audio.volume = value; });
    setVolume(value);
  };

  return <main className="audio-lab-shell">
    <header className="audio-lab-topbar">
      <a className="audio-lab-brand" href="/"><span className="audio-lab-mark">EL</span> ENGINE<span>LAB</span></a>
      <span className="audio-lab-status"><i /> HERRAMIENTA LOCAL · DATASET HL-CEAD</span>
      <a className="audio-lab-back" href="/">VOLVER AL SIMULADOR ↗</a>
    </header>

    <section className="audio-lab-intro">
      <div className="audio-lab-eyebrow">AUDIO WORKBENCH / 01</div>
      <h1>Escuchá <em>motores reales.</em></h1>
      <p>Compará grabaciones originales a distintos regímenes. Elegí un vehículo, una toma y escuchá cómo cambia el sonido entre 1000, 1500 y 2000 RPM.</p>
    </section>

    {loading ? <div className="audio-lab-message">LEYENDO GRABACIONES LOCALES…</div> : !manifest?.available ? <div className="audio-lab-message audio-lab-error">
      <strong>No encontramos el dataset.</strong>
      <p>{manifest?.error ?? "La carpeta de audios no está disponible para el servidor local."}</p>
      <code>data/hl-cead/extracted/MLVRG-Car-Engine-Audio</code>
      <p>Comprobá que el ZIP se haya extraído en esa ubicación y reiniciá Vite.</p>
    </div> : <>
      <section className="audio-lab-toolbar">
        <label className="audio-lab-search">BUSCAR VEHÍCULO<input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Marca o modelo…" /></label>
        <label className="audio-lab-engine-select">VEHÍCULO<select value={selectedEngine} onChange={event => setSelectedEngine(event.target.value)}>
          {filteredEngines.map(item => <option key={item.manufacturer + item.model} value={`${item.manufacturer}/${item.model}`}>{item.manufacturer} · {item.model}</option>)}
        </select></label>
        <label className="audio-lab-take-select">NÚMERO DE TOMA<select value={selectedTake} onChange={event => setSelectedTake(event.target.value)}>
          {availableTakes.map(take => <option key={take} value={take}>Toma {take}</option>)}
        </select></label>
      </section>

      {engine ? <>
        <div className="audio-lab-selected"><div><span>VEHÍCULO SELECCIONADO</span><strong>{engine.manufacturer} <em>{engine.model}</em></strong></div><div><span>TOMAS DISPONIBLES</span><strong>{availableTakes.length}</strong></div><div><span>REGÍMENES DEL DATASET</span><strong>{RPM_LEVELS.filter(rpm => (engine.recordings[rpm] ?? []).length).join(" · ") || "—"} RPM</strong></div></div>
        <section className="audio-lab-recordings">
          {RPM_LEVELS.map(rpm => {
            const recording = (engine.recordings[rpm] ?? []).find(item => item.id === selectedTake);
            return <article className={recording ? "audio-lab-card" : "audio-lab-card is-missing"} key={rpm}>
              <div className="audio-lab-card-head"><div><span>RÉGIMEN CONSTANTE</span><h2>{Number(rpm).toLocaleString("es-AR")} <small>RPM</small></h2></div><span className={recording ? "audio-lab-available" : "audio-lab-unavailable"}>{recording ? "GRABACIÓN DISPONIBLE" : "SIN ESTA TOMA"}</span></div>
              {recording ? <audio className="audio-lab-player" controls preload="none" loop={loop} src={audioUrl(recording)} onVolumeChange={event => setVolume(event.currentTarget.volume)} /> : <p className="audio-lab-no-take">Este vehículo no tiene una grabación con el número de toma seleccionado para este régimen.</p>}
              {recording && <div className="audio-lab-file">{recording.path.split("/").slice(-3).join(" / ")}</div>}
            </article>;
          })}
        </section>
        <section className="audio-lab-global-controls">
          <label className="audio-lab-volume">VOLUMEN GENERAL <strong>{Math.round(volume * 100)}%</strong><input type="range" min="0" max="1" step="0.01" value={volume} onChange={event => setAllVolumes(Number(event.target.value))} /></label>
          <label className="audio-lab-loop"><input type="checkbox" checked={loop} onChange={event => setLoop(event.target.checked)} /> REPETIR GRABACIONES EN BUCLE</label>
          <button type="button" onClick={() => document.querySelectorAll<HTMLAudioElement>(".audio-lab-player").forEach(audio => { audio.pause(); audio.currentTime = 0; })}>DETENER TODO</button>
        </section>
      </> : <div className="audio-lab-message">No hay vehículos que coincidan con la búsqueda.</div>}
    </>}
    <footer className="audio-lab-footer">HL-CEAD · MUESTRAS ORIGINALES · REPRODUCCIÓN LOCAL · NO SE COPIAN AUDIOS AL BUILD DE PRODUCCIÓN</footer>
  </main>;
}

export default AudioLab;
