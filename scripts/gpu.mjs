// Which GPU headless Chromium renders WebGL with.
//   P2V_GPU (or render --gpu):  auto (default) | cpu | metal | vulkan | egl
//   P2V_GPU_DEVICE (or --gpu-device), Linux only: a number from `p2v gpus`, a render node (/dev/dri/renderD129),
//     a PCI address (0000:01:00.0) or vendor:device in hex (10de:2684)
// auto = Metal on macOS; on Linux, Vulkan when a GPU is present. If the browser still ends up on a software
// renderer (SwiftShader, llvmpipe) or without WebGL, render.mjs relaunches with cpu (SwiftShader), the old default.
import fs from 'node:fs';
import path from 'node:path';

const CPU_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const VENDORS = { '0x10de': 'NVIDIA', '0x1002': 'AMD', '0x8086': 'Intel', '0x13b5': 'Arm', '0x5143': 'Qualcomm', '0x1af4': 'virtio' };

// Linux: one entry per DRM render node, from sysfs (no extra tools needed).
export function listGpus() {
  if (process.platform !== 'linux') return [];
  const D = '/sys/class/drm';
  let names = [];
  try { names = fs.readdirSync(D).filter(n => /^renderD\d+$/.test(n)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })); } catch { return []; }
  return names.map((n, index) => {
    const dev = path.join(D, n, 'device');
    const read = f => { try { return fs.readFileSync(path.join(dev, f), 'utf8').trim(); } catch { return ''; } };
    let driver = '', pci = '';
    try { driver = path.basename(fs.readlinkSync(path.join(dev, 'driver'))); } catch {}
    try { pci = path.basename(fs.realpathSync(dev)); } catch {}
    const vendor = read('vendor'), device = read('device');
    return { index, node: `/dev/dri/${n}`, vendor, device, driver, pci, name: VENDORS[vendor] || vendor || '?' };
  });
}

function pickDevice(sel) {
  const all = listGpus();
  if (!all.length) throw new Error('no GPU render nodes found under /sys/class/drm (is /dev/dri visible here?)');
  const s = String(sel).trim().toLowerCase();
  const hex = v => v.replace(/^0x/, '');
  const hit = /^\d+$/.test(s) ? all.find(g => g.index === +s)
    : s.startsWith('/dev/dri/') ? all.find(g => g.node === s)
    : /^[0-9a-f]{4}:[0-9a-f]{4}$/.test(s) ? all.find(g => `${hex(g.vendor)}:${hex(g.device)}` === s)
    : all.find(g => g.pci === s || g.pci.endsWith(s));
  if (!hit) throw new Error(`GPU "${sel}" not found. Available:\n${formatGpus(all)}`);
  return hit;
}

export function formatGpus(all = listGpus()) {
  if (!all.length) return process.platform === 'darwin' ? '  (macOS: the built-in GPU is used through Metal)' : '  (no GPU render nodes found)';
  return all.map(g => `  ${g.index}  ${g.node}  ${g.name} ${g.vendor.replace(/^0x/, '')}:${g.device.replace(/^0x/, '')}  driver=${g.driver || '?'}  pci=${g.pci || '?'}`).join('\n');
}

// Environment that steers each GPU stack toward one device. Chromium's GPU process inherits it.
function deviceEnv(g) {
  const vid = g.vendor.replace(/^0x/, ''), did = g.device.replace(/^0x/, '');
  const env = {
    MESA_VK_DEVICE_SELECT: `${vid}:${did}!`,          // Mesa Vulkan: this device only
    MESA_VK_DEVICE_SELECT_FORCE_DEFAULT_DEVICE: '1',
    DRI_PRIME: g.pci ? `pci-${g.pci.replace(/[:.]/g, '_')}` : `${vid}:${did}`,   // Mesa GL/EGL
  };
  if (g.driver === 'nvidia') {
    Object.assign(env, { __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __VK_LAYER_NV_optimus: 'NVIDIA_only' });
    const egl = ['/usr/share/glvnd/egl_vendor.d/10_nvidia.json', '/etc/glvnd/egl_vendor.d/10_nvidia.json'].find(f => fs.existsSync(f));
    if (egl) env.__EGL_VENDOR_LIBRARY_FILENAMES = egl;
  }
  return env;
}

// -> { mode, args, env, device } for chromium.launch({ args, env })
export function gpuLaunch(mode = process.env.P2V_GPU || 'auto', device = process.env.P2V_GPU_DEVICE || '') {
  mode = String(mode).toLowerCase();
  if (!['auto', 'cpu', 'metal', 'vulkan', 'egl'].includes(mode)) throw new Error(`unknown GPU mode "${mode}" (auto, cpu, metal, vulkan, egl)`);
  if (mode === 'cpu') return { mode, args: CPU_ARGS, env: {} };
  if (mode === 'metal' && process.platform !== 'darwin') throw new Error('GPU mode "metal" is macOS only; on Linux use auto, vulkan, egl or cpu');
  if (process.platform === 'darwin') {
    if (mode !== 'auto' && mode !== 'metal') throw new Error(`GPU mode "${mode}" is for Linux; on macOS use auto, metal or cpu`);
    return { mode: 'metal', args: ['--use-angle=metal', '--ignore-gpu-blocklist'], env: {} };
  }
  if (process.platform !== 'linux') return { mode: 'cpu', args: CPU_ARGS, env: {} };
  const dev = device ? pickDevice(device) : null;
  if (mode === 'auto' && !dev && !listGpus().length) return { mode: 'cpu', args: CPU_ARGS, env: {} };
  const m = mode === 'auto' ? 'vulkan' : mode;
  const args = m === 'vulkan'
    ? ['--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist']
    : ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist'];
  if (dev) args.push(`--render-node-override=${dev.node}`);
  return { mode: m, args, env: dev ? deviceEnv(dev) : {}, device: dev };
}

export const CPU_LAUNCH = { mode: 'cpu', args: CPU_ARGS, env: {} };
export const isSoftware = renderer => !renderer || /swiftshader|llvmpipe|softpipe|software/i.test(renderer);
