// Runs every layer: turns it on/off, fetches on a timer, backs off on errors,
// pauses while the app is in the background, and reports status to the UI.
//
// A layer never crashes the app: every call into a layer is wrapped in try/catch.

import { NET, TICK_MS, TICK_MS_FOLLOWING } from '../config.js';
import { settings } from './settings.js';
import { fmt } from './units.js';
import * as net from './net.js';
import * as globe from '../globe.js';

const Cesium = window.Cesium;

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
      this.state[layer.id] = { enabled: false, status: 'off', message: '', note: '', count: null, updatedAt: 0, failures: 0, busy: false };
    }

    document.addEventListener('visibilitychange', () => this.setPaused(document.hidden));
    this.startTicker();
  }

  onStatus(fn) { this.listeners.add(fn); }
  emit(id) { this.listeners.forEach((fn) => { try { fn(id, this.state[id]); } catch (e) { console.error(e); } }); }
  get(id) { return this.layers.find((l) => l.id === id); }

  // Everything a layer is allowed to use.
  makeCtx(layer) {
    const viewer = this.viewer;
    const primitives = viewer.scene.primitives.add(new Cesium.PrimitiveCollection());
    let entitySource = null;
    const self = this;
    return {
      Cesium, viewer, scene: viewer.scene, settings, fmt, net, globe,
      primitives,
      get entities() {
        if (!entitySource) {
          entitySource = new Cesium.CustomDataSource(layer.id);
          viewer.dataSources.add(entitySource);
        }
        return entitySource.entities;
      },
      hasEntities: () => entitySource,
      view: () => globe.getView(),
      requestRender: () => viewer.scene.requestRender(),
      setNote(text) { self.state[layer.id].note = text || ''; self.emit(layer.id); },
      refresh: () => self.refresh(layer.id),
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
    st.busy = true;
    const ctx = this.ctx[id];
    let nextSec = settings.interval(id) || 0;
    try {
      const data = await layer.fetch(ctx);
      if (!st.enabled) return;
      const count = layer.render(ctx, data);
      st.count = (typeof count === 'number') ? count : st.count;
      st.status = 'ok';
      st.message = '';
      st.failures = 0;
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
      if (st.enabled && nextSec > 0) this.timers[id] = setTimeout(() => this.refresh(id), nextSec * 1000);
    }
  }

  // Called when the camera stops moving: layers that depend on the view can reload.
  viewChanged() {
    const view = globe.getView();
    for (const layer of this.layers) {
      const st = this.state[layer.id];
      if (!st.enabled || !layer.onViewChange) continue;
      let want = false;
      this.safe(layer, 'onViewChange', () => { want = layer.onViewChange(this.ctx[layer.id], view); });
      if (want) this.refresh(layer.id);
    }
  }

  settingChanged(key) {
    for (const layer of this.layers) {
      const st = this.state[layer.id];
      if (!st.enabled || !layer.onSettingChange) continue;
      let want = false;
      this.safe(layer, 'onSettingChange', () => { want = layer.onSettingChange(this.ctx[layer.id], key); });
      if (want) this.refresh(layer.id);
    }
  }

  setPaused(p) {
    this.paused = p;
    if (!p) {
      // Coming back: refresh anything that is now overdue.
      for (const layer of this.layers) {
        const st = this.state[layer.id];
        const due = (Date.now() - st.updatedAt) / 1000 >= (settings.interval(layer.id) || Infinity);
        if (st.enabled && (due || st.status === 'error')) this.refresh(layer.id);
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

  position(id, key) {
    const layer = this.get(id);
    let p;
    try { p = layer.position && layer.position(this.ctx[id], key); } catch { p = undefined; }
    return p;
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
}
