#!/usr/bin/env node
// Static server for the repo + frame sink + muxer.
//   node scripts/serve.mjs [--port 8765]
// Routes:
//   GET  /...                      static files from repo root
//   POST /frame/<job>/<n>          save JPEG body to jobs/<job>/build/frames/<n>.jpg
//   POST /done/<job>?frames=N      mux frames + narration into jobs/<job>/build/<job>.mp4, write contact sheet
//   GET  /status/<job>             JSON progress
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveFfmpeg, mux, jobsDir } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary' };
const status = {};

export function startServer(port = 8765, { onDone } = {}) {
  const ffmpeg = resolveFfmpeg(ROOT);
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const parts = u.pathname.split('/').filter(Boolean);
    if (req.method === 'POST' && parts[0] === 'frame') {
      const [, job, n] = parts;
      const dir = path.join(jobsDir(ROOT), job, 'build', 'frames');
      fs.mkdirSync(dir, { recursive: true });
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        fs.writeFileSync(path.join(dir, String(parseInt(n, 10)).padStart(5, '0') + '.jpg'), Buffer.concat(chunks));
        status[job] = { ...(status[job] || {}), lastFrame: parseInt(n, 10), state: 'capturing' };
        res.writeHead(200); res.end('ok');
      });
      return;
    }
    if (req.method === 'POST' && parts[0] === 'done') {
      const job = parts[1];
      status[job] = { ...(status[job] || {}), state: 'muxing', frames: parseInt(u.searchParams.get('frames') || '0', 10) };
      res.writeHead(200); res.end('ok');
      try {
        const r = mux(ROOT, job, ffmpeg);
        status[job] = { ...status[job], state: 'done', video: r.shortcut, output: r.output, contact: r.contact };
        console.log(`[done] ${job} -> ${r.shortcut}`);
      } catch (e) {
        status[job] = { ...status[job], state: 'error', error: String(e.message || e) };
        console.error(`[error] ${job}: ${e.message}`);
      }
      onDone && onDone(job, status[job]);
      return;
    }
    if (parts[0] === 'status') {
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(status[parts[1]] || {})); return;
    }
    const rel = decodeURIComponent(u.pathname);
    const baseDir = rel.startsWith('/jobs/') ? jobsDir(ROOT) : ROOT;
    let p = path.join(baseDir, rel.startsWith('/jobs/') ? rel.slice(5) : rel);
    if (!p.startsWith(baseDir)) { res.writeHead(403); res.end(); return; }
    if (u.pathname === '/') p = path.join(ROOT, 'engine', 'index.html');
    fs.readFile(p, (e, d) => {
      if (e) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(d);
    });
  });
  srv.listen(port, () => console.log(`paper2video server on http://localhost:${port}  (ffmpeg: ${ffmpeg})`));
  return srv;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf('--port');
  startServer(i > 0 ? parseInt(process.argv[i + 1], 10) : 8765);
}
