#!/usr/bin/env python3
"""Narration + timing for a job.

    python3 scripts/tts.py <job> [--engine kokoro|silent] [--voice af_heart] [--speed 1.0]

Reads jobs/<job>/script.json and writes
    jobs/<job>/build/audio/*.wav, build/narration.wav, build/timing.json

timing.json drives the video: one entry per scene with sentence start/dur, so scene
animations can key off sentence boundaries (S.P(k) in scenes.js).

Engines
  kokoro  local, open-source (Apache-2.0) English voices. Models auto-download to models/.
  silent  no audio; durations estimated from word count. For layout previews only.
Korean narration is not supported by Kokoro; plug a commercial TTS into synth() if needed and
check its license for public or commercial use.
"""
import argparse, json, os, sys, wave, urllib.request
try:
    import numpy as np
except ModuleNotFoundError:
    sys.exit('numpy missing: run ./setup.sh (needs Python 3.10-3.13) and use ./.venv/bin/python scripts/tts.py')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JOBS = os.path.abspath(os.path.expanduser(os.environ.get('P2V_JOBS') or os.path.join(ROOT, 'jobs')))
MODELS = os.path.join(ROOT, 'models')
SR = 24000
KOKORO_FILES = {
    'kokoro-v1.0.onnx': 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx',
    'voices-v1.0.bin': 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin',
}

def ensure_models():
    os.makedirs(MODELS, exist_ok=True)
    for name, url in KOKORO_FILES.items():
        p = os.path.join(MODELS, name)
        if not os.path.exists(p) or os.path.getsize(p) < 1_000_000:
            print(f'downloading {name} ...', flush=True)
            urllib.request.urlretrieve(url, p + '.part'); os.replace(p + '.part', p)

def load_kokoro():
    # phonemizer copies libespeak-ng into a temp dir before dlopen; on hardened/sandboxed macOS
    # the copy can fail library validation. Symlink to the original instead.
    import shutil
    import phonemizer.backend.espeak.api as _api
    _api.shutil.copy = lambda src, dst, follow_symlinks=False: os.symlink(os.path.abspath(src), dst)
    from kokoro_onnx import Kokoro
    ensure_models()
    return Kokoro(os.path.join(MODELS, 'kokoro-v1.0.onnx'), os.path.join(MODELS, 'voices-v1.0.bin'))

def trim(x, thr=10 ** (-45 / 20)):
    idx = np.where(np.abs(x) > thr)[0]
    return x[idx[0]: idx[-1] + 1] if len(idx) else x

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('job')
    ap.add_argument('--engine'); ap.add_argument('--voice'); ap.add_argument('--speed', type=float)
    a = ap.parse_args()
    J = os.path.join(JOBS, a.job)
    script = json.load(open(os.path.join(J, 'script.json')))
    cfg = script.get('tts', {})
    engine = a.engine or cfg.get('engine', 'kokoro')
    voice = a.voice or cfg.get('voice', 'af_heart')
    speed = a.speed or cfg.get('speed', 1.0)
    lang = 'en-gb' if voice.startswith('b') else 'en-us'
    B = os.path.join(J, 'build'); A = os.path.join(B, 'audio'); os.makedirs(A, exist_ok=True)
    for f in ('timing.json', 'narration.wav'):
        if os.path.exists(os.path.join(B, f)): os.remove(os.path.join(B, f))
    k = load_kokoro() if engine == 'kokoro' else None

    def synth(text):
        if engine == 'kokoro':
            s, sr = k.create(text, voice=voice, speed=speed, lang=lang)
            assert sr == SR, sr
            return trim(np.asarray(s, dtype=np.float32))
        if engine == 'silent':
            return np.zeros(int(SR * max(1.2, len(text.split()) / 2.6 / speed)), dtype=np.float32)
        sys.exit(f'unknown engine {engine}')

    pcm = []; T = 0.0; timeline = []
    def add(x):
        nonlocal T; pcm.append(x); T += len(x) / SR
    def silence(sec): add(np.zeros(int(round(sec * SR)), dtype=np.float32))
    scenes = script['scenes']
    for si, sc in enumerate(scenes):
        lead = 1.4 if si == 0 else 0.6
        tail = 1.6 if si == 0 else (3.5 if si == len(scenes) - 1 else 0.9)
        start = T; silence(lead); sents = []
        for kk, (sub, tts) in enumerate(sc['s']):
            x = synth(tts)
            s0 = T - start; add(x)
            sents.append({'start': round(s0, 3), 'dur': round(T - start - s0, 3), 'sub': sub})
            if kk < len(sc['s']) - 1: silence(0.45)
            print(f'  {sc["id"]}.{kk}  {len(x) / SR:5.2f}s', flush=True)
        silence(tail)
        timeline.append({'id': sc['id'], 'start': round(start, 3), 'dur': round(T - start, 3), 'sents': sents})
    audio = np.clip(np.concatenate(pcm), -1, 1)
    with wave.open(os.path.join(B, 'narration.wav'), 'wb') as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(SR)
        wf.writeframes((audio * 32767).astype('<i2').tobytes())
    json.dump(timeline, open(os.path.join(B, 'timing.json'), 'w'), ensure_ascii=False, indent=1)
    print(f'total {T:.1f}s  engine={engine} voice={voice}  -> {B}/timing.json')

if __name__ == '__main__':
    main()
