// Runs every layer: turns it on/off, fetches on a timer, backs off on errors,
// pauses while the app is in the background, and reports status to the UI.
//
// A layer never crashes the app: every call into a layer is wrapped in try/catch.

import { NET, TICK_MS, TICK_MS_FOLLOWING, KEYS } from '../config.js';
import { settings, apiKeys } from './settings.js';
import { fmt } from './units.js';
import * as net from './net.js';
import * as globe from '../globe.js';

const Cesium = window.Cesium;

const withTimeout = (p, ms, msg = 'Timed out') => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new net.FeedError(msg, { kind: 'timeout' })), ms)),
]);

export class LayerManager {
  constructor(viewer, layers) {
    this.viewer = viewer;
    this.layers = layers;
    this.state = {};      // per-layer status
    this.ctx = {};        // per-layer context
    this.timers = {};
    this.listeners = new Set();
    this.paused = false;

    for (const layer of layers) {
      this.state[layer.id] = { enabled: false, status: 'off', message: '', note: '', count: null, updatedAt: 0, failures: 0, busy: false, via: '' };
    }

    document.addEventListener('visibilitychange', () => this.setPaused(document.hidden));
    this.startTicker();
  }

  onStatus(fn) { this.listeners.add(fn); }
  emit(id) { this.listeners.forEach((fn) => { try { fn(id, this.state[id]); } catch (e) { console.error(e); } }); }
  get(id) { return this.layers.find((l) => l.id === id); }

  // Helpers every layer gets for network access. get() picks direct or relay
  // and remembers which one was used (shown in the panel and in selfTest).
  netFor(rec) {
    return {
      ...net,
      get: async (url, opts) => {
        const r = await net.get(url, opts);
        rec.via = rec.via === 'relay' ? 'relay' : r.via;
        return r.data;
      },
    };
  }

  // Everything a layer is allowed to use.
  makeCtx(layer) {
    const viewer = this.viewer;
    const primitives = viewer.scene.primitives.add(new Cesium.PrimitiveCollection());
    let entitySource = null;
    const self = this;
    const rec = { via: '' };
    return {
      Cesium, viewer, scene: viewer.scene, settings, fmt, globe,
      net: this.netFor(rec),
      rec,
      primitives,
      get entities() {
        if (!entitySource) {
          entitySource = new Cesium.CustomDataSource(layer.id);
          viewer.dataSources.add(entitySource);
        }
        return entitySource.entities;
      },
      hasEntities: () => entitySource,
      key: (name) => apiKeys.get(name),
      view: () => globe.getView(),
      requestRender: () => viewer.scene.requestRender(),
      setNote(text) { self.state[layer.id].note = text || ''; self.emit(layer.id); },
      refresh: () => self.refresh(layer.id),
      test: false,
    };
  }

  enable(id, on) {
    const layer = this.get(id);
    const st = this.state[id];
    if (!layer || st.enabled === on) return;
    st.enabled = on;
    settings.setIn('enabled', id, on);
    if (on) {
      if (!this.ctx[id]) {
        this.ctx[id] = this.makeCtx(layer);
        this.safe(layer, 'init', () => layer.init && layer.init(this.ctx[id]));
      }
      this.setVisible(layer, true);
      st.status = 'loading';
      this.emit(id);
      this.refresh(id);
    } else {
      clearTimeout(this.timers[id]);
      this.setVisible(layer, false);
      st.status = 'off';
      this.emit(id);
    }
    this.viewer.scene.requestRender();
  }

  setVisible(layer, on) {
    const ctx = this.ctx[layer.id];
    if (!ctx) return;
    if (layer.show) this.safe(layer, 'show', () => layer.show(ctx, on));
    ctx.primitives.show = on;
    const es = ctx.hasEntities();
    if (es) es.show = on;
  }

  async refresh(id) {
    const layer = this.get(id);
    const st = this.state[id];
    if (!layer || !st.enabled || st.busy) return;
    clearTimeout(this.timers[id]);
    if (this.paused) return;
    if (layer.needsKey && !apiKeys.get(layer.needsKey)) {
      st.status = 'needs-key';
      st.message = `Needs a free key: ${KEYS[layer.needsKey]?.name || layer.needsKey} (Settings > API keys)`;
      this.emit(id);
      return;
    }
    st.busy = true;
    this.emit(id);
    const ctx = this.ctx[id];
    let nextSec = settings.interval(id) || 0;
    try {
      ctx.rec.via = '';
      const data = await layer.fetch(ctx);
      if (!st.enabled) return;
      const count = layer.render(ctx, data);
      st.count = (typeof count === 'number') ? count : st.count;
      st.status = 'ok';
      st.message = '';
      st.failures = 0;
      st.via = ctx.rec.via || (layer.computed ? 'computed' : '');
      st.updatedAt = Date.now();
    } catch (e) {
      st.failures += 1;
      const kind = e && e.kind;
      st.status = kind === 'ratelimit' ? 'limited' : 'error';
      st.message = (e && e.message) || 'Failed';
      if (!(e instanceof net.FeedError)) console.error(`[${id}]`, e);
      // Back off: double the wait after each failure, up to the cap.
      const base = Math.max(30, nextSec || 60);
      nextSec = Math.min(NET.maxBackoffSec, base * 2 ** Math.min(st.failures - 1, 4));
      if (e && e.retryAfter) nextSec = Math.max(nextSec, e.retryAfter);
      if (e && e.stop) nextSec = 0; // the layer asked us not to retry automatically
    } finally {
      st.busy = false;
      this.emit(id);
      this.viewer.scene.requestRender();
      // A little randomness so many layers do not all refresh at the same moment.
      if (st.enabled && nextSec > 0) this.timers[id] = setTimeout(() => this.refresh(id), nextSec * 1000 * (0.92 + Math.random() * 0.16));
    }
  }

  // Called when the camera stops moving: layers that depend on the view can reload.
  viewChanged() {
    const view = globe.getView();
    let delay = 0;
    for (const layer of this.layers) {
      const st = this.state[layer.id];
      if (!st.enabled || !layer.onViewChange) continue;
      let want = false;
      this.safe(layer, 'onViewChange', () => { want = layer.onViewChange(this.ctx[layer.id], view); });
      if (want) { setTimeout(() => this.refresh(layer.id), delay); delay += 250; } // staggered
    }
  }

  settingChanged(key) {
    for (const layer of this.layers) {
      const st = this.state[layer.id];
      if (!st.enabled) continue;
      let want = key === 'dataRelay' && (st.status === 'error' || st.status === 'needs-key');
      if (key.startsWith('key:') && (layer.needsKey === key.slice(4) || (layer.usesKeys || []).includes(key.slice(4)))) want = true;
      if (layer.onSettingChange) this.safe(layer, 'onSettingChange', () => { want = layer.onSettingChange(this.ctx[layer.id], key) || want; });
      if (want) { st.failures = 0; this.refresh(layer.id); }
    }
  }

  setPaused(p) {
    this.paused = p;
    if (!p) {
      // Coming back: refresh anything that is now overdue (staggered).
      let delay = 0;
      for (const layer of this.layers) {
        const st = this.state[layer.id];
        const iv = settings.interval(layer.id);
        const due = iv > 0 && (Date.now() - st.updatedAt) / 1000 >= iv;
        if (st.enabled && (due || st.status === 'error')) { setTimeout(() => this.refresh(layer.id), delay); delay += 300; }
      }
    }
  }

  // Moving things (satellites, aircraft) get a regular "tick".
  startTicker() {
    const run = () => {
      if (!this.paused) {
        const now = new Date();
        let changed = false;
        for (const layer of this.layers) {
          if (!this.state[layer.id].enabled || !layer.tick) continue;
          this.safe(layer, 'tick', () => { if (layer.tick(this.ctx[layer.id], now) !== false) changed = true; });
        }
        if (changed || globe.isFollowing()) this.viewer.scene.requestRender();
        this.listeners.forEach((fn) => { try { fn('tick'); } catch { /* ignore */ } });
      }
      setTimeout(run, globe.isFollowing() ? TICK_MS_FOLLOWING : TICK_MS);
    };
    setTimeout(run, TICK_MS);
  }

  describe(id, key) {
    const layer = this.get(id);
    let d = null;
    this.safe(layer, 'describe', () => { d = layer.describe(this.ctx[id], key); });
    return d;
  }

  // Optional extra details loaded on demand when a card opens (e.g. tide readings).
  async details(id, key) {
    const layer = this.get(id);
    if (!layer || !layer.details) return null;
    return layer.details(this.ctx[id], key);
  }

  position(id, key) {
    const layer = this.get(id);
    let p;
    try { p = layer.position && layer.position(this.ctx[id], key); } catch { p = undefined; }
    return p;
  }

  // Loaded items of enabled layers (for the "What's here" briefing).
  items(id) {
    const layer = this.get(id);
    if (!layer || !this.state[id].enabled || !layer.items) return [];
    try { return layer.items(this.ctx[id]) || []; } catch { return []; }
  }

  select(id, key) {
    for (const layer of this.layers) {
      if (!layer.onSelect || !this.ctx[layer.id]) continue;
      this.safe(layer, 'onSelect', () => layer.onSelect(this.ctx[layer.id], layer.id === id ? key : null));
    }
    this.viewer.scene.requestRender();
  }

  safe(layer, what, fn) {
    try { fn(); } catch (e) {
      console.error(`[${layer.id}.${what}]`, e);
      const st = this.state[layer.id];
      st.status = 'error';
      st.message = `Layer error (${what})`;
      this.emit(layer.id);
    }
  }

  // ---------------------------------------------------------------- self-test
  // One real fetch per layer for a fixed view (Macon, Georgia, ~300 km),
  // whether or not the layer is on. Draws nothing and changes no settings.
  // Always resolves within 60 s to [{ id, name, ok, count, ms, via, error }].
  selfTest({ lat = 32.84, lon = -83.63, radiusKm = 300 } = {}) {
    const view = { lat, lon, radiusKm, heightKm: radiusKm / 0.9 };
    const results = this.layers.map((l) => ({ id: l.id, name: l.name, ok: false, count: null, ms: null, via: null, error: 'did not finish' }));
    const runOne = async (layer, out) => {
      const t0 = performance.now();
      if (layer.needsKey && !apiKeys.get(layer.needsKey)) {
        Object.assign(out, { via: 'needs-key', error: `needs a free key (${layer.needsKey})`, ms: 0 });
        return;
      }
      const rec = { via: '' };
      const ctx = {
        Cesium, viewer: this.viewer, scene: this.viewer.scene, settings, fmt, globe,
        net: this.netFor(rec), rec, key: (n) => apiKeys.get(n),
        view: () => view, setNote() {}, requestRender() {}, refresh() {}, test: true,
      };
      try {
        const data = await withTimeout(Promise.resolve().then(() => layer.fetch(ctx)), 15000, 'Timed out (15 s)');
        let count = null;
        if (layer.count) count = layer.count(ctx, data);
        else if (Array.isArray(data)) count = data.length;
        Object.assign(out, { ok: true, count, via: rec.via || (layer.computed ? 'computed' : 'direct'), error: null });
      } catch (e) {
        Object.assign(out, { ok: false, via: rec.via || null, error: (e && e.message) || String(e) });
      }
      out.ms = Math.round(performance.now() - t0);
    };
    const all = Promise.all(this.layers.map((l, i) => runOne(l, results[i]).catch(() => {})));
    return Promise.race([all, new Promise((r) => setTimeout(r, 58000))])
      .then(() => JSON.parse(JSON.stringify(results)));
  }
}
