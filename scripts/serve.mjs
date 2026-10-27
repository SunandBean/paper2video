#!/usr/bin/env node
// Local server for the player + frame sink + muxer. Listens on 127.0.0.1 only.
//   node scripts/serve.mjs [--port 8765]
// Routes:
//   GET  /...                  static files: /jobs/* from the jobs dir, /node_modules/* from the tools dir, the rest from the skill folder
//   POST /frame/<job>/<n>      save JPEG body to <jobs>/<job>/build/frames/<n>.jpg
//   POST /text/<job>           save the on-screen strings to <jobs>/<job>/build/onscreen.json (read by check_claims.py)
//   POST /done/<job>?frames=N  mux frames + narration into <jobs>/<job>/build/<job>.mp4, write contact sheet
//   POST /fail/<job>           the page hit an error; stop a waiting render
//   GET  /status/<job>         JSON progress
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveFfmpeg, mux, jobsDir, toolsDir } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary' };
const status = {};
const JOB_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;   // same rule as p2v
const inside = (base, p) => p === base || p.startsWith(base + path.sep);
const MAX_BODY = 32 * 1024 * 1024;  // a 1080p JPEG frame is well under 1 MB
const readBody = req => new Promise((res, rej) => {
  const c = []; let n = 0;
  req.on('data', d => { n += d.length; if (n > MAX_BODY) { rej(new Error('request body too large')); req.destroy(); } else c.push(d); });
  req.on('end', () => res(Buffer.concat(c))); req.on('error', rej);
});

export function startServer(port = 8765, { onDone, onListen } = {}) {
  const ffmpeg = resolveFfmpeg(ROOT);
  const JOBS = jobsDir(ROOT), NODE = path.join(toolsDir(ROOT), 'node_modules');
  const finish = job => onDone && onDone(job, status[job]);
  const srv = http.createServer(async (req, res) => {
    try {
      const u = new URL('http://x' + (req.url.startsWith('/') ? req.url : '/' + req.url));   // "//a" is a path here, not a host
      const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (req.method === 'POST') {
        const [kind, job, n] = parts;
        if (!JOB_RE.test(job || '')) { res.writeHead(400); res.end('bad job id'); return; }
        const B = path.join(JOBS, job, 'build');
        if (!fs.existsSync(path.join(JOBS, job))) { res.writeHead(404); res.end('no such job'); return; }
        const body = await readBody(req);
        if (kind === 'frame') {
          const k = Number.parseInt(n, 10);
          if (!Number.isInteger(k) || k < 0) { res.writeHead(400); res.end('bad frame'); return; }
          fs.mkdirSync(path.join(B, 'frames'), { recursive: true });
          fs.writeFileSync(path.join(B, 'frames', String(k).padStart(5, '0') + '.jpg'), body);
          status[job] = { ...(status[job] || {}), lastFrame: k, state: 'capturing' };
        } else if (kind === 'text') {
          const d = JSON.parse(body.toString('utf8'));
          fs.mkdirSync(B, { recursive: true });
          fs.writeFileSync(path.join(B, 'onscreen.json'), JSON.stringify({ mode: d.mode, at: new Date().toISOString(), items: d.items }, null, 1));
        } else if (kind === 'fail') {
          status[job] = { ...(status[job] || {}), state: 'error', error: body.toString('utf8').slice(0, 4000) };
          console.error(`[error] ${job}: ${status[job].error}`);
          finish(job);
        } else if (kind === 'done') {
          const expected = Number.parseInt(u.searchParams.get('frames') || '0', 10);
          status[job] = { ...(status[job] || {}), state: 'muxing', frames: expected };
          res.writeHead(200); res.end('ok');
          try {
            const r = mux(ROOT, job, ffmpeg, expected);
            status[job] = { ...status[job], state: 'done', video: r.shortcut, output: r.output, contact: r.contact };
            console.log(`[done] ${job} -> ${r.shortcut}`);
          } catch (e) {
            status[job] = { ...status[job], state: 'error', error: String(e.message || e) };
            console.error(`[error] ${job}: ${e.message}`);
          }
          finish(job);
          return;
        } else { res.writeHead(404); res.end(); return; }
        res.writeHead(200); res.end('ok');
        return;
      }
      if (parts[0] === 'status') {
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(status[parts[1]] || {})); return;
      }
      const rel = decodeURIComponent(u.pathname);
      const [base, sub] = rel.startsWith('/jobs/') ? [JOBS, rel.slice(6)]
        : rel.startsWith('/node_modules/') ? [NODE, rel.slice(14)]
        : [ROOT, rel === '/' ? 'engine/index.html' : rel.slice(1)];
      if (sub.includes('\0')) { res.writeHead(400); res.end(); return; }
      const p = path.resolve(base, sub);
      // Only the player's own files: no dotfiles (.tools, .git), nothing outside its base folder.
      if (!inside(base, p) || (base === ROOT && /(^|[\\/])\./.test(path.relative(ROOT, p)))) { res.writeHead(403); res.end(); return; }
      // ...and no symlink inside it that points elsewhere.
      let realP; try { realP = fs.realpathSync(p); } catch { res.writeHead(404); res.end('not found'); return; }
      if (!inside(fs.realpathSync(base), realP)) { res.writeHead(403); res.end(); return; }
      fs.readFile(p, (e, d) => {
        if (e) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(d);
      });
    } catch (e) {
      // malformed %-encoding, NUL bytes or bad JSON are the client's fault: 400, not 500
      const bad = e instanceof URIError || e instanceof SyntaxError || e?.code === 'ERR_INVALID_ARG_VALUE' || e?.code === 'ERR_INVALID_ARG_TYPE' || e?.code === 'ERR_INVALID_URL';
      if (!res.headersSent) { res.writeHead(bad ? 400 : 500); res.end(String(e.message || e)); }
    }
  });
  srv.on('error', e => {
    console.error(e.code === 'EADDRINUSE' ? `port ${port} is busy (another render still running?). Set PORT=<free port> or stop it.` : String(e));
    process.exit(2);
  });
  srv.listen(port, '127.0.0.1', () => {
    const p = srv.address().port;
    console.log(`paper2video server on http://127.0.0.1:${p}  (ffmpeg: ${ffmpeg})`);
    onListen && onListen(p);
  });
  return srv;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf('--port');
  startServer(i > 0 ? parseInt(process.argv[i + 1], 10) : 8765);
}
