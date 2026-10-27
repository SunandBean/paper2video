#!/usr/bin/env node
// Regression tests for scripts/serve.mjs and the mux frame check (no browser, no ffmpeg run).
//   node tests/test_server.mjs        (or: ./p2v test)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p2vsrv-'));
const jobs = path.join(tmp, 'jobs'), secret = path.join(tmp, 'jobs-secret');
fs.mkdirSync(path.join(jobs, 'j1'), { recursive: true });
fs.mkdirSync(secret);
fs.writeFileSync(path.join(secret, 's.txt'), 'SECRET');
fs.writeFileSync(path.join(jobs, 'j1', 'script.json'), '{}');
fs.symlinkSync(secret, path.join(jobs, 'j1', 'link'));
process.env.P2V_JOBS = jobs;
process.env.FFMPEG = process.env.FFMPEG || 'ffmpeg';   // startServer only needs a name here

const { startServer } = await import('../scripts/serve.mjs');
const { mux } = await import('../scripts/lib.mjs');
let port; const ready = new Promise(r => { port = r; });
const srv = startServer(0, { onListen: port });
const base = `http://127.0.0.1:${await ready}`;
const code = async (p, opt) => (await fetch(base + p, opt)).status;
const post = body => ({ method: 'POST', body });

let failed = 0;
async function t(name, fn) {
  try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '-', e.message); }
}

await t('serves player and job files', async () => {
  assert.equal(await code('/engine/index.html'), 200);
  assert.equal(await code('/jobs/j1/script.json'), 200);
});
await t('blocks traversal and sibling-prefix escape', async () => {
  for (const p of ['/jobs/..%2fjobs-secret/s.txt', '/jobs/%2e%2e/jobs-secret/s.txt', '/%2e%2e/%2e%2e/etc/passwd'])
    assert.notEqual(await code(p), 200, p);
});
await t('blocks dotfiles and symlinks out of the folder', async () => {
  assert.equal(await code('/.git/config'), 403);
  assert.equal(await code('/jobs/j1/link/s.txt'), 403);
});
await t('validates POST job ids and frame numbers', async () => {
  assert.equal(await code('/frame/..%2f..%2ftmp/1', post('x')), 400);
  assert.equal(await code('/frame/nojob/1', post('x')), 404);
  assert.equal(await code('/frame/j1/-1', post('x')), 400);
  assert.equal(await code('/frame/j1/abc', post('x')), 400);
  assert.equal(await code('/frame/j1/0', post('jpeg')), 200);
  assert.ok(fs.existsSync(path.join(jobs, 'j1', 'build', 'frames', '00000.jpg')));
});
await t('rejects oversized bodies', async () => {
  const r = await fetch(base + '/frame/j1/1', post(Buffer.alloc(33 * 1024 * 1024))).then(r => r.status, () => 'reset');
  assert.notEqual(r, 200);
  assert.ok(!fs.existsSync(path.join(jobs, 'j1', 'build', 'frames', '00001.jpg')));
});
await t('records on-screen text', async () => {
  assert.equal(await code('/text/j1', post(JSON.stringify({ mode: 'scan', items: [{ text: 'Ours 60.9', scene: 'a' }] }))), 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(jobs, 'j1', 'build', 'onscreen.json'))).items[0].text, 'Ours 60.9');
});
await t('mux refuses a frame gap', async () => {
  fs.writeFileSync(path.join(jobs, 'j1', 'build', 'frames', '00002.jpg'), 'x');   // 0 and 2, no 1
  assert.throws(() => mux(path.resolve('.'), 'j1', 'ffmpeg', 3), /frames incomplete/);
});
await t('mux refuses narration longer than the video', async () => {
  const b = path.join(jobs, 'j1', 'build');
  fs.writeFileSync(path.join(b, 'frames', '00001.jpg'), 'x');                // frames 0..2 = 0.1 s
  const pcm = Buffer.alloc(24000 * 2), h = Buffer.alloc(44);                  // 1 s, 24 kHz mono 16-bit
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(path.join(b, 'narration.wav'), Buffer.concat([h, pcm]));
  assert.throws(() => mux(path.resolve('.'), 'j1', 'ffmpeg', 3), /longer than the video/);
});
await t('random escape attempts never leak (2000 paths)', async () => {
  const pieces = ['..', '%2e%2e', '%2E%2E', '.%2e', '%2f', '%5c', '\\', '/', '//', '%252e%252e', '%00', 'jobs', 'j1', 'jobs-secret',
    's.txt', 'engine', '.git', 'link', '%c0%ae', '%', '~', '.'];
  for (let i = 0; i < 2000; i++) {
    const p = (i % 2 ? '/jobs/' : '/') + Array.from({ length: 1 + (i % 6) }, () => pieces[Math.floor(Math.random() * pieces.length)]).join(i % 3 ? '/' : '');
    const r = await fetch(base + p).catch(() => null);
    if (!r) continue;
    assert.ok(r.status !== 500, `500 for ${p}`);
    assert.ok(!(await r.text()).includes('SECRET'), `leak for ${p}`);
  }
});
await t('listens on loopback only', async () => assert.equal(srv.address().address, '127.0.0.1'));

srv.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `${failed} FAILED` : 'server tests: ALL PASS');
process.exit(failed ? 1 : 0);
