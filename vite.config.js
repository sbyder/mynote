import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build, defineConfig } from 'vite';

const indexFilename = 'note-index.json';
const noteDirectory = resolve(import.meta.dirname, 'public/notes');

function collectNotes(directory, prefix = '') {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  return entries.flatMap((entry) => {
    if (entry.name.startsWith('.')) return [];
    const path = prefix + entry.name;
    if (entry.isDirectory()) return collectNotes(resolve(directory, entry.name), path + '/');
    return entry.isFile() && /\.md$/i.test(entry.name) ? [path] : [];
  }).sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
}

function noteIndex() {
  const manifest = () => JSON.stringify(collectNotes(noteDirectory));

  return {
    name: 'mynote-index',
    configureServer(server) {
      server.middlewares.use('/' + indexFilename, (_request, response) => {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.end(manifest());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: indexFilename, source: manifest() });
    },
  };
}

function dilRuntime() {
  const moduleId = '\0virtual:dil-runtime';
  const entry = resolve(import.meta.dirname, 'src/dil-runtime.js');
  return {
    name: 'mynote-dil-runtime',
    resolveId(id) {
      if (id === 'virtual:dil-runtime') return moduleId;
    },
    async load(id) {
      if (id !== moduleId) return;
      this.addWatchFile(entry);
      this.addWatchFile(resolve(import.meta.dirname, 'src/note-chart.js'));
      const bundle = await build({
        configFile: false,
        logLevel: 'error',
        build: { lib: { entry, name: 'MyNoteDIL', formats: ['iife'] }, write: false },
      });
      const script = bundle[0].output.find((item) => item.type === 'chunk').code;
      return 'export default ' + JSON.stringify(script) + ';';
    },
  };
}

export default defineConfig({ base: './', plugins: [noteIndex(), dilRuntime()] });
