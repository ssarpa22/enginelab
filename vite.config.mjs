import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const datasetRoot = path.resolve(projectRoot, "data/hl-cead/extracted/MLVRG-Car-Engine-Audio");
const allowedRpm = new Set(["1000", "1500", "2000"]);

async function scanAudioDirectory(directory) {
  const engines = [];
  async function visit(current, parts = []) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (allowedRpm.has(entry.name)) {
          const recordings = (await readdir(absolute, { withFileTypes: true }))
            .filter(item => item.isFile() && /\.wav$/i.test(item.name))
            .map(item => ({
              id: path.basename(item.name, path.extname(item.name)),
              path: [...parts, entry.name, item.name].join("/")
            }))
            .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
          if (recordings.length) {
            const [manufacturer, model] = parts;
            let engine = engines.find(item => item.manufacturer === manufacturer && item.model === model);
            if (!engine) {
              engine = { manufacturer, model, recordings: {} };
              engines.push(engine);
            }
            engine.recordings[entry.name] = recordings;
          }
        } else {
          await visit(absolute, [...parts, entry.name]);
        }
      }
    }
  }
  await visit(directory);
  return engines
    .map(engine => ({ ...engine, recordings: engine.recordings }))
    .sort((a, b) => `${a.manufacturer} ${a.model}`.localeCompare(`${b.manufacturer} ${b.model}`));
}

function localAudioLab() {
  return {
    name: "enginelab-local-audio-lab",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = new URL(req.url ?? "/", "http://localhost");
        if (requestUrl.pathname === "/__audio_lab__/manifest") {
          try {
            const engines = await scanAudioDirectory(datasetRoot);
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
            res.end(JSON.stringify({ available: engines.length > 0, engines }));
          } catch (error) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ available: false, engines: [], error: error instanceof Error ? error.message : "No se pudo leer el dataset." }));
          }
          return;
        }
        if (requestUrl.pathname === "/__audio_lab__/audio") {
          const relative = requestUrl.searchParams.get("path");
          if (!relative || relative.includes("\\") || relative.split("/").some(part => part === "." || part === "..")) {
            res.statusCode = 400;
            res.end("Ruta de audio inválida.");
            return;
          }
          const absolute = path.resolve(datasetRoot, relative);
          if (!absolute.startsWith(datasetRoot + path.sep) || !/\.wav$/i.test(absolute)) {
            res.statusCode = 400;
            res.end("Ruta de audio inválida.");
            return;
          }
          try {
            const info = await stat(absolute);
            if (!info.isFile()) throw new Error("No es un archivo.");
            res.statusCode = 200;
            res.setHeader("Content-Type", "audio/wav");
            res.setHeader("Content-Length", info.size);
            res.setHeader("Accept-Ranges", "bytes");
            createReadStream(absolute).pipe(res);
          } catch {
            res.statusCode = 404;
            res.end("Audio no encontrado. Comprobá que el dataset esté extraído.");
          }
          return;
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), localAudioLab()],
  server: { host: "127.0.0.1" }
});
