// Animal scan for Drive mode: the phone's rear camera and an on-device detector
// (Google MediaPipe, EfficientDet model trained on the COCO picture set) watch
// the road for large animals. COCO has no "deer" class: a deer is reported as
// whichever large animal it looks most like (dog, horse, sheep, cow...), so
// GodView says "animal". At night the picture is brightened for the detector
// and it also looks for eyeshine (see eyeshine.js). Nothing leaves the phone.
//
// It is a second pair of eyes, not a safety system: it misses things, more so
// at night, in rain and at a distance.

import { ENDPOINTS } from '../config.js';
import { findEyePairs, EyeTracker } from './eyeshine.js';

// COCO classes that matter on a road. Small animals (cat, bird) are left out on
// purpose: swerving for them causes worse crashes than hitting them.
export const LARGE_ANIMALS = new Set(['dog', 'horse', 'sheep', 'cow', 'bear', 'elephant', 'zebra', 'giraffe']);
const MIN_SCORE = 0.42;
const INFER_EVERY_MS = 125;      // about 8 checks a second (keeps the phone cooler)
const ALARM_GAP_MS = 6000;       // one alarm per animal, not a siren
const EYES_GAP_MS = 9000;

const state = { on: false, phase: 'off', message: '', backend: '', fps: 0, night: false, boxes: [], eyes: null, error: '' };
let video = null; let stream = null; let overlay = null; let ovx = null; let work = null; let wctx = null; let tiny = null; let tctx = null;
let detector = null; let detectorKind = ''; let loading = null; let timer = null; let onEvent = () => {};
let hits = []; let lastAlarm = 0; let lastEyes = 0; let frames = 0; let fpsT = 0; let lumT = 0; let eyeTurn = 0;
const tracker = new EyeTracker(3, 4);

export const scanState = () => ({ ...state, boxes: state.boxes.slice() });
const set = (patch) => { Object.assign(state, patch); onEvent({ type: 'state', state: scanState() }); };

// ---------------------------------------------------------------- detector
// Files are kept in the browser's cache storage after the first download, so
// the scan still starts with no signal on a back road.
async function cachedResponse(url) {
  let cache = null;
  try { cache = await caches.open('godview-animalscan-v1'); } catch { cache = null; }
  if (cache) { const hit = await cache.match(url); if (hit) return hit; }
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`download failed (HTTP ${res.status})`);
  if (cache) { try { await cache.put(url, res.clone()); } catch { /* storage full: still works this time */ } }
  return res;
}
const blobUrl = async (url, type) => URL.createObjectURL(new Blob([await (await cachedResponse(url)).arrayBuffer()], { type }));

async function loadDetector() {
  if (window.GV_TEST_DETECTOR) { detectorKind = 'test'; return window.GV_TEST_DETECTOR; }
  const base = ENDPOINTS.mediapipeVision;
  const lib = await import(await blobUrl(`${base}/vision_bundle.mjs`, 'text/javascript'));
  const fileset = {
    wasmLoaderPath: await blobUrl(`${base}/wasm/vision_wasm_internal.js`, 'text/javascript'),
    wasmBinaryPath: await blobUrl(`${base}/wasm/vision_wasm_internal.wasm`, 'application/wasm'),
  };
  const opts = (model, delegate) => ({
    baseOptions: { modelAssetBuffer: model, delegate },
    runningMode: 'VIDEO', scoreThreshold: 0.3, maxResults: 8,
    ...(delegate === 'GPU' ? { canvas: document.createElement('canvas') } : {}),
  });
  // Better range first (EfficientDet-Lite2 on the graphics chip); if the phone can't, the smaller model on the CPU.
  try {
    const model = new Uint8Array(await (await cachedResponse(ENDPOINTS.animalModel)).arrayBuffer());
    const d = await lib.ObjectDetector.createFromOptions(fileset, opts(model, 'GPU'));
    detectorKind = 'EfficientDet-Lite2 (GPU)';
    return d;
  } catch (e) {
    console.warn('animal scan: GPU detector failed, using the CPU one', e);
    const model = new Uint8Array(await (await cachedResponse(ENDPOINTS.animalModelFast)).arrayBuffer());
    const d = await lib.ObjectDetector.createFromOptions(fileset, opts(model, 'CPU'));
    detectorKind = 'EfficientDet-Lite0 (CPU)';
    return d;
  }
}

// Check the detector on a still picture (for testing on a real phone or in a browser):
// import('./js/lookout/animalscan.js').then((m) => m.detectPicture(img))
export async function detectPicture(source) {
  if (!detector) { loading = loading || loadDetector(); detector = await loading; }
  const sw = source.naturalWidth || source.videoWidth || source.width; const sh = source.naturalHeight || source.videoHeight || source.height;
  const c = document.createElement('canvas'); c.width = 640; c.height = Math.round((640 * sh) / sw);
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  const r = detector.detectForVideo(c, performance.now() + Math.random());
  const all = (r.detections || []).map((d) => ({ label: d.categories?.[0]?.categoryName || '', score: Math.round((d.categories?.[0]?.score || 0) * 100) / 100, h: Math.round(((d.boundingBox?.height || 0) / c.height) * 100) / 100 }));
  return { model: detectorKind, all, alarm: all.some((d) => LARGE_ANIMALS.has(d.label) && d.score >= MIN_SCORE) };
}

// ---------------------------------------------------------------- picture tools
// Night boost: lift the shadows so the detector sees what the headlights light up.
const LUT = new Uint8Array(256);
for (let i = 0; i < 256; i++) LUT[i] = Math.min(255, Math.round(255 * Math.pow(i / 255, 0.55) * 1.08));
function brighten(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h); const d = img.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = LUT[d[i]]; d[i + 1] = LUT[d[i + 1]]; d[i + 2] = LUT[d[i + 2]]; }
  ctx.putImageData(img, 0, 0);
}
function meanLuma(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data; let s = 0;
  for (let i = 0; i < d.length; i += 4) s += (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
  return s / (d.length / 4);
}

// ---------------------------------------------------------------- start / stop
export async function startScan(box, handler) {
  onEvent = handler || (() => {});
  if (state.on) return true;
  set({ on: true, phase: 'camera', message: 'Starting the camera…', error: '', boxes: [], eyes: null });
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('This browser has no camera access.'), { name: 'NotSupportedError' });
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
    });
  } catch (e) {
    const why = e.name === 'NotAllowedError'
      ? 'Camera permission is off. In the GodView iPhone app, update the app from your Mac (Documents › GodView › Install GodView on iPhone), then allow the camera when asked. In Safari, allow the camera for this site.'
      : e.name === 'NotFoundError' || e.name === 'OverconstrainedError' ? 'No rear camera was found.' : `The camera did not start (${e.message || e.name}).`;
    set({ on: false, phase: 'error', message: why, error: e.name || 'camera' });
    return false;
  }
  if (!state.on) { for (const t of stream.getTracks()) t.stop(); stream = null; return false; }   // stopped while asking
  for (const t of stream.getVideoTracks()) {
    t.onended = () => { if (state.on) { stopScan(true); set({ phase: 'error', message: 'The camera stopped (another app may be using it). Tap Animal scan to start again.' }); } };
  }
  box.innerHTML = '<video playsinline muted autoplay></video><canvas class="dv-ov"></canvas>';
  video = box.querySelector('video'); overlay = box.querySelector('canvas'); ovx = overlay.getContext('2d');
  video.srcObject = stream;
  try { await video.play(); } catch { /* autoplay with muted+playsinline normally works */ }
  if (!state.on) return false;
  set({ phase: 'model', message: detector ? 'Starting the detector…' : 'Getting the animal detector ready (first time: about 25 MB, then it works offline)…' });
  try {
    if (!detector) { loading = loading || loadDetector(); detector = await loading; }
  } catch (e) {
    loading = null;
    set({ phase: 'error', message: `The animal detector could not load (${e.message || e}). Try again on Wi-Fi; after one good download it works without signal.`, error: 'model' });
    stopScan(true);
    return false;
  }
  if (!state.on) return false;
  work = document.createElement('canvas'); wctx = work.getContext('2d', { willReadFrequently: true });
  tiny = document.createElement('canvas'); tiny.width = 320; tiny.height = 180; tctx = tiny.getContext('2d', { willReadFrequently: true });
  hits = []; tracker.reset(); frames = 0; fpsT = performance.now(); lumT = 0;
  set({ phase: 'scanning', backend: detectorKind, message: 'Scanning the road' });
  clearInterval(timer);
  timer = setInterval(step, INFER_EVERY_MS);
  return true;
}

export function stopScan(keepMessage = false) {
  clearInterval(timer); timer = null;
  if (stream) { for (const t of stream.getTracks()) t.stop(); }
  stream = null;
  if (video) { try { video.srcObject = null; } catch { /* */ } }
  video = null; overlay = null; ovx = null;
  state.on = false;
  if (!keepMessage) set({ phase: 'off', message: '', boxes: [], eyes: null, fps: 0 });
  else onEvent({ type: 'state', state: scanState() });
}

// ---------------------------------------------------------------- the loop
function step() {
  if (!state.on || !video || video.readyState < 2 || !detector) return;
  const vw = video.videoWidth; const vh = video.videoHeight;
  if (!vw || !vh) return;
  const W = 640; const H = Math.round((640 * vh) / vw);
  if (work.width !== W || work.height !== H) { work.width = W; work.height = H; }
  wctx.drawImage(video, 0, 0, W, H);
  const now = performance.now();
  // Is it dark? (checked about once a second, with a gap so it doesn't flicker)
  if (now - lumT > 1000) {
    lumT = now;
    tctx.drawImage(work, 0, 0, 320, 180);
    const m = meanLuma(tctx, 320, 180);
    const night = state.night ? m < 75 : m < 55;
    if (night !== state.night) state.night = night;
  }
  // Eyeshine (night only, every other check), on the raw picture
  let eyes = null;
  if (state.night && (eyeTurn = (eyeTurn + 1) % 2) === 0) {
    tctx.drawImage(work, 0, 0, 320, 180);
    const pairs = findEyePairs(tctx.getImageData(0, 0, 320, 180).data, 320, 180);
    eyes = tracker.update(pairs);
  } else if (!state.night) tracker.reset();
  if (state.night) brighten(wctx, W, H);
  let found = [];
  try {
    const r = detector.detectForVideo(work, now);
    found = (r.detections || []).map((d) => {
      const c = (d.categories || [])[0] || {};
      const b = d.boundingBox || {};
      return { label: c.categoryName || c.displayName || '', score: c.score || 0, x: b.originX / W, y: b.originY / H, w: b.width / W, h: b.height / H };
    }).filter((d) => LARGE_ANIMALS.has(d.label) && d.score >= MIN_SCORE && d.y + d.h / 2 > 0.15 && d.h > 0.03);
  } catch (e) {
    console.warn('animal scan: detect failed', e);
  }
  hits.push(found.length > 0); if (hits.length > 3) hits.shift();
  state.boxes = found;
  state.eyes = eyes;
  draw(found, eyes);
  frames++;
  if (now - fpsT >= 2000) { state.fps = Math.round((frames * 1000) / (now - fpsT)); frames = 0; fpsT = now; onEvent({ type: 'state', state: scanState() }); }
  // Alarm when an animal shows in 2 of the last 3 checks
  if (found.length && hits.filter(Boolean).length >= 2 && Date.now() - lastAlarm > ALARM_GAP_MS) {
    lastAlarm = Date.now();
    const top = found.sort((a, b) => b.h - a.h)[0];
    const side = top.x + top.w / 2 < 0.38 ? 'left' : top.x + top.w / 2 > 0.62 ? 'right' : 'ahead';
    onEvent({ type: 'animal', label: top.label, score: top.score, side, night: state.night });
  } else if (eyes && Date.now() - lastEyes > EYES_GAP_MS && Date.now() - lastAlarm > 3000) {
    lastEyes = Date.now();
    const side = eyes.x < 0.38 ? 'left' : eyes.x > 0.62 ? 'right' : 'ahead';
    onEvent({ type: 'eyes', side });
  }
}

function draw(found, eyes) {
  if (!overlay || !video) return;
  const rect = overlay.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = Math.round(rect.width * dpr); const ch = Math.round(rect.height * dpr);
  if (overlay.width !== cw || overlay.height !== ch) { overlay.width = cw; overlay.height = ch; }
  ovx.clearRect(0, 0, cw, ch);
  // The video is shown "cover"-style: work out where the picture actually sits.
  const vw = video.videoWidth; const vh = video.videoHeight;
  const s = Math.max(cw / vw, ch / vh); const dw = vw * s; const dh = vh * s; const ox = (cw - dw) / 2; const oy = (ch - dh) / 2;
  ovx.lineWidth = 3 * dpr; ovx.font = `${700} ${13 * dpr}px -apple-system, system-ui, sans-serif`;
  for (const d of found) {
    const x = ox + d.x * dw; const y = oy + d.y * dh; const w = d.w * dw; const h = d.h * dh;
    ovx.strokeStyle = '#ff5470'; ovx.strokeRect(x, y, w, h);
    const t = `Animal ${Math.round(d.score * 100)}%`;
    ovx.fillStyle = '#ff5470'; ovx.fillRect(x, y - 18 * dpr, ovx.measureText(t).width + 10 * dpr, 18 * dpr);
    ovx.fillStyle = '#fff'; ovx.fillText(t, x + 5 * dpr, y - 5 * dpr);
  }
  if (eyes) {
    const x = ox + eyes.x * dw; const y = oy + eyes.y * dh; const r = Math.max(14 * dpr, eyes.dx * dw);
    ovx.strokeStyle = '#ffb547'; ovx.beginPath(); ovx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); ovx.stroke();
  }
}
