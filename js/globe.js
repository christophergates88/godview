// The 3D globe: CesiumJS set up WITHOUT a Cesium ion token.
// Handles base maps, view styles, camera moves, tapping, and "follow".

import { BASEMAPS } from './config.js';

const Cesium = window.Cesium;

let viewer = null;
let baseLayer = null;
let styleStage = null;
let followProxy = null;
let markerEntities = {};

export function getViewer() { return viewer; }

export function createGlobe(containerId, creditContainerId) {
  // No ion: make sure nothing tries to use the default ion token.
  Cesium.Ion.defaultAccessToken = '';

  viewer = new Cesium.Viewer(containerId, {
    baseLayer: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    baseLayerPicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    creditContainer: document.getElementById(creditContainerId),
    requestRenderMode: true,          // only redraw when something changes: saves phone battery
    maximumRenderTimeChange: Infinity,
    msaaSamples: 1,
    useBrowserRecommendedResolution: false,
  });
  adaptiveResolution();

  const scene = viewer.scene;
  scene.globe.baseColor = Cesium.Color.fromCssColorString('#0b1a26');
  scene.globe.enableLighting = false;
  scene.globe.showGroundAtmosphere = true;
  scene.globe.maximumScreenSpaceError = isTouch() ? 2.5 : 2;
  scene.fog.enabled = true;
  scene.highDynamicRange = false;
  scene.postProcessStages.fxaa.enabled = false;
  scene.screenSpaceCameraController.minimumZoomDistance = 150;
  scene.screenSpaceCameraController.maximumZoomDistance = 60_000_000;
  // Stop the default double-click "zoom to entity" behaviour.
  viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  return viewer;
}

// Sharp when still, lighter while moving: render at up to 2x pixels when the
// camera is idle and about 1x while it moves, so dragging stays smooth.
function adaptiveResolution() {
  const dpr = window.devicePixelRatio || 1;
  const idle = Math.min(dpr, 2) / dpr;
  const moving = Math.min(dpr, isTouch() ? 1 : 1.25) / dpr;
  let t = null;
  viewer.resolutionScale = idle;
  viewer.camera.moveStart.addEventListener(() => { clearTimeout(t); if (viewer.resolutionScale !== moving) viewer.resolutionScale = moving; });
  viewer.camera.moveEnd.addEventListener(() => {
    clearTimeout(t);
    t = setTimeout(() => { viewer.resolutionScale = idle; viewer.scene.requestRender(); }, 250);
  });
}

export function isTouch() {
  return (typeof window !== 'undefined') && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
}

// ---------- Base maps ----------
export function setBasemap(id) {
  const def = BASEMAPS[id] || BASEMAPS.satellite;
  const provider = new Cesium.UrlTemplateImageryProvider({
    url: def.url,
    subdomains: def.subdomains,
    maximumLevel: def.maxZoom,
    credit: new Cesium.Credit(def.credit, true),
  });
  const layer = new Cesium.ImageryLayer(provider);
  if (baseLayer) viewer.imageryLayers.remove(baseLayer, true);
  viewer.imageryLayers.add(layer, 0);
  baseLayer = layer;
  viewer.scene.requestRender();
}

// ---------- View styles (GPU post-processing) ----------
const SHADERS = {
  night: `
    uniform sampler2D colorTexture;
    in vec2 v_textureCoordinates;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
    void main() {
      vec2 uv = v_textureCoordinates;
      vec3 c = texture(colorTexture, uv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      l = pow(clamp(l * 1.6, 0.0, 1.0), 0.8);
      float n = (rand(uv * 900.0) - 0.5) * 0.08;
      float v = smoothstep(0.95, 0.35, distance(uv, vec2(0.5)));
      out_FragColor = vec4(vec3(0.15, 1.0, 0.35) * (l + n) * v, 1.0);
    }`,
  thermal: `
    uniform sampler2D colorTexture;
    in vec2 v_textureCoordinates;
    vec3 ramp(float t) {
      // black -> purple -> red -> orange -> yellow -> white
      vec3 c0 = vec3(0.0, 0.0, 0.05);
      vec3 c1 = vec3(0.35, 0.0, 0.55);
      vec3 c2 = vec3(0.9, 0.1, 0.2);
      vec3 c3 = vec3(1.0, 0.55, 0.0);
      vec3 c4 = vec3(1.0, 0.95, 0.3);
      vec3 c5 = vec3(1.0);
      if (t < 0.2) return mix(c0, c1, t / 0.2);
      if (t < 0.4) return mix(c1, c2, (t - 0.2) / 0.2);
      if (t < 0.6) return mix(c2, c3, (t - 0.4) / 0.2);
      if (t < 0.8) return mix(c3, c4, (t - 0.6) / 0.2);
      return mix(c4, c5, (t - 0.8) / 0.2);
    }
    void main() {
      vec3 c = texture(colorTexture, v_textureCoordinates).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      out_FragColor = vec4(ramp(clamp(l * 1.3, 0.0, 1.0)), 1.0);
    }`,
  crt: `
    uniform sampler2D colorTexture;
    in vec2 v_textureCoordinates;
    void main() {
      vec2 uv = v_textureCoordinates;
      vec2 cc = uv - 0.5;
      uv = 0.5 + cc * (1.0 + 0.06 * dot(cc, cc));      // slight barrel bend
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { out_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
      float off = 0.0016;
      vec3 c;
      c.r = texture(colorTexture, uv + vec2(off, 0.0)).r;
      c.g = texture(colorTexture, uv).g;
      c.b = texture(colorTexture, uv - vec2(off, 0.0)).b;
      float scan = 0.82 + 0.18 * sin(gl_FragCoord.y * 3.14159);
      float vig = smoothstep(1.0, 0.3, length(cc) * 1.25);
      c = c * scan * vig;
      c = mix(c, c * vec3(0.85, 1.05, 0.9), 0.5);
      out_FragColor = vec4(c * 1.15, 1.0);
    }`,
};

export const VIEW_STYLES = [
  { id: 'normal', name: 'Normal' },
  { id: 'night', name: 'Night vision' },
  { id: 'thermal', name: 'Thermal' },
  { id: 'crt', name: 'CRT' },
];

export function setViewStyle(id) {
  const stages = viewer.scene.postProcessStages;
  if (styleStage) { stages.remove(styleStage); styleStage = null; }
  if (SHADERS[id]) {
    styleStage = new Cesium.PostProcessStage({ fragmentShader: SHADERS[id], name: 'gv_style_' + id });
    stages.add(styleStage);
  }
  document.body.dataset.viewstyle = id;
  viewer.scene.requestRender();
}

// ---------- Camera ----------
export function flyTo(lat, lon, heightKm = 60, duration = 1.8) {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, heightKm * 1000),
    duration,
  });
}

export function jumpTo(lat, lon, heightKm) {
  viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(lon, lat, heightKm * 1000) });
}

// What the camera is looking at: centre point, height and a rough visible radius.
export function getView() {
  const cam = viewer.camera;
  const canvas = viewer.scene.canvas;
  const carto = cam.positionCartographic;
  const heightKm = carto.height / 1000;
  let lat = Cesium.Math.toDegrees(carto.latitude);
  let lon = Cesium.Math.toDegrees(carto.longitude);
  const centre = cam.pickEllipsoid(new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2));
  if (centre) {
    const c = Cesium.Cartographic.fromCartesian(centre);
    lat = Cesium.Math.toDegrees(c.latitude);
    lon = Cesium.Math.toDegrees(c.longitude);
  }
  const radiusKm = Math.min(5000, Math.max(20, heightKm * 0.9));
  return { lat, lon, heightKm, radiusKm };
}

// ---------- Tapping ----------
// handler receives { layer, key } for an object or { lat, lon } for bare globe.
export function onTap(handler) {
  const h = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  h.setInputAction((e) => {
    const size = isTouch() ? 28 : 12;   // generous hit box for fingers
    let picked;
    try { picked = viewer.scene.pick(e.position, size, size); } catch { picked = null; }
    const ref = picked && (picked.id?.gv || picked.id || picked.primitive?.gv);
    if (ref && ref.layer) { handler({ layer: ref.layer, key: ref.key }); return; }
    const pos = viewer.camera.pickEllipsoid(e.position);
    if (pos) {
      const c = Cesium.Cartographic.fromCartesian(pos);
      handler({ lat: Cesium.Math.toDegrees(c.latitude), lon: Cesium.Math.toDegrees(c.longitude) });
    } else handler(null);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

export function onCameraIdle(fn) {
  viewer.camera.moveEnd.addEventListener(fn);
}

// ---------- Follow a moving object ----------
// getPosition() must return a Cartesian3 (or undefined). rangeM = viewing distance.
export function follow(getPosition, rangeM = 50000) {
  unfollow();
  followProxy = viewer.entities.add({
    position: new Cesium.CallbackPositionProperty
      ? new Cesium.CallbackPositionProperty(() => getPosition(), false)
      : new Cesium.CallbackProperty(() => getPosition(), false),
    point: { pixelSize: 1, color: Cesium.Color.TRANSPARENT },
    viewFrom: new Cesium.Cartesian3(0, -rangeM, rangeM * 0.8),
  });
  viewer.trackedEntity = followProxy;
  viewer.scene.requestRender();
}

export function unfollow() {
  if (followProxy) {
    viewer.trackedEntity = undefined;
    viewer.entities.remove(followProxy);
    followProxy = null;
  }
}
export function isFollowing() { return !!followProxy; }

// ---------- Simple markers (my location, tapped point) ----------
export function setMarker(name, lat, lon, color = '#3ee6c4') {
  clearMarker(name);
  markerEntities[name] = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
    point: {
      pixelSize: 12,
      color: Cesium.Color.fromCssColorString(color),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
  viewer.scene.requestRender();
}
export function clearMarker(name) {
  if (markerEntities[name]) { viewer.entities.remove(markerEntities[name]); delete markerEntities[name]; viewer.scene.requestRender(); }
}

// ---------- Icons drawn on a canvas (no image files needed) ----------
const iconCache = new Map();
export function makeIcon(shape, color, size = 32, label = '') {
  const k = `${shape}|${color}|${size}|${label}`;
  if (iconCache.has(k)) return iconCache.get(k);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const s = size;
  g.lineJoin = 'round';
  if (shape === 'plane') {
    g.translate(s / 2, s / 2);
    g.scale(s / 32, s / 32);
    g.beginPath();
    // simple top-down aircraft pointing up
    g.moveTo(0, -14); g.lineTo(2.2, -9); g.lineTo(2.2, -3); g.lineTo(13, 3); g.lineTo(13, 6);
    g.lineTo(2.2, 3); g.lineTo(2.2, 9); g.lineTo(6, 12); g.lineTo(6, 14); g.lineTo(0, 12.5);
    g.lineTo(-6, 14); g.lineTo(-6, 12); g.lineTo(-2.2, 9); g.lineTo(-2.2, 3); g.lineTo(-13, 6);
    g.lineTo(-13, 3); g.lineTo(-2.2, -3); g.lineTo(-2.2, -9); g.closePath();
    g.fillStyle = color; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 2;
    g.stroke(); g.fill();
  } else {
    // round badge with a letter
    g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2);
    g.fillStyle = color; g.fill();
    g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.stroke();
    if (label) {
      g.fillStyle = '#0b0d10';
      g.font = `800 ${Math.round(s * 0.5)}px -apple-system, Segoe UI, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, s / 2, s / 2 + 1);
    }
  }
  iconCache.set(k, c);
  return c;
}
