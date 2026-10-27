#!/usr/bin/env python3
"""Where paper2video keeps things (standard library only; scripts/lib.mjs mirrors this).

  ROOT   the skill folder (code). For a plugin install this is a cache copy that is replaced on update.
  TOOLS  .venv, models/, node_modules/ (about 1 GB, slow to rebuild)
           plugin install  ~/.claude/plugins/data/<plugin>-<marketplace>/   (survives updates, removed on uninstall)
           otherwise       ROOT/.tools/                                     (git-ignored, survives git pull)
  WORK   jobs/ and videos/
           ROOT inside ~/.claude/ (plugin, or a clone in ~/.claude/skills)  ~/paper2video/
           otherwise (a development clone)                                  ROOT
  Overrides: P2V_TOOLS, P2V_HOME (work dir), P2V_JOBS, P2V_OUT (videos)

  python3 scripts/p2v_paths.py           # human-readable
  python3 scripts/p2v_paths.py --shell   # export lines (used by ./p2v)
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_HOME = os.path.expanduser('~')

def _under(path, base):
    path, base = os.path.realpath(path), os.path.realpath(base)
    return path == base or path.startswith(base + os.sep)

def _plugin_id():
    """'<plugin>-<marketplace>' when ROOT is ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>."""
    cache = os.path.realpath(os.path.join(_HOME, '.claude', 'plugins', 'cache'))
    real = os.path.realpath(ROOT)
    if not real.startswith(cache + os.sep):
        return None
    parts = real[len(cache) + 1:].split(os.sep)
    if len(parts) < 2:
        return None
    return re.sub(r'[^A-Za-z0-9_-]', '-', '%s@%s' % (parts[1], parts[0]))

def _env(name, default):
    v = os.environ.get(name)
    return os.path.abspath(os.path.expanduser(v)) if v else default

PLUGIN_ID = _plugin_id()
TOOLS = _env('P2V_TOOLS', os.path.join(_HOME, '.claude', 'plugins', 'data', PLUGIN_ID) if PLUGIN_ID
             else os.path.join(ROOT, '.tools'))
WORK = _env('P2V_HOME', os.path.join(_HOME, 'paper2video') if _under(ROOT, os.path.join(_HOME, '.claude')) else ROOT)
JOBS = _env('P2V_JOBS', os.path.join(WORK, 'jobs'))
VIDEOS = _env('P2V_OUT', os.path.join(WORK, 'videos'))
MODELS = os.path.join(TOOLS, 'models')

if __name__ == '__main__':
    vals = [('P2V_ROOT', ROOT), ('P2V_TOOLS', TOOLS), ('P2V_HOME', WORK), ('P2V_JOBS', JOBS), ('P2V_OUT', VIDEOS)]
    for k, v in vals:
        if '--shell' in sys.argv:
            print("export %s='%s'" % (k, v.replace("'", "'\\''")))
        else:
            print('%-10s %s' % (k, v))
