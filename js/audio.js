/* 极简 WebAudio 音效（无外部资源） */
(function (g) {
  'use strict';

  const Sfx = {
    ctx: null,
    on: true,
    master: null,

    init() {
      if (this.ctx) return;
      const AC = g.AudioContext || g.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.32;
        this.master.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
    },

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    setOn(v) {
      this.on = v;
      if (this.master) this.master.gain.value = v ? 0.32 : 0;
    },

    _tone(freq, dur, type, vol, when, slideTo) {
      if (!this.on || !this.ctx) return;
      const c = this.ctx, t0 = c.currentTime + (when || 0);
      const o = c.createOscillator();
      const gn = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(gn); gn.connect(this.master);
      o.start(t0); o.stop(t0 + dur + 0.03);
    },

    _noise(dur, vol, when, freq) {
      if (!this.on || !this.ctx) return;
      const c = this.ctx, t0 = c.currentTime + (when || 0);
      const n = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, n, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freq || 1400; f.Q.value = 1.1;
      const gn = c.createGain(); gn.gain.value = vol;
      src.connect(f); f.connect(gn); gn.connect(this.master);
      src.start(t0);
    },

    /** 消除：组越大音越亮 */
    pop(n) {
      const base = 300 + Math.min(n, 14) * 42;
      this._tone(base, 0.16, 'triangle', 0.5, 0, base * 1.9);
      this._noise(0.13, 0.24, 0, 1100 + Math.min(n, 14) * 90);
      if (n >= 6) this._tone(base * 1.5, 0.24, 'sine', 0.32, 0.05, base * 2.6);
      if (n >= 12) this._tone(base * 2, 0.32, 'sine', 0.26, 0.1, base * 3.2);
    },

    /** 落地 */
    land(hard) {
      this._tone(hard ? 150 : 200, 0.09, 'sine', hard ? 0.30 : 0.13, 0, 70);
    },

    invalid() { this._tone(180, 0.12, 'square', 0.12, 0, 120); },

    levelClear() {
      const seq = [523, 659, 784, 1046];
      seq.forEach((f, i) => this._tone(f, 0.32, 'triangle', 0.34, i * 0.1));
      this._tone(1318, 0.5, 'sine', 0.26, 0.42);
    },

    gameOver() {
      const seq = [440, 392, 330, 262];
      seq.forEach((f, i) => this._tone(f, 0.4, 'sawtooth', 0.2, i * 0.14, f * 0.94));
    },

    start() {
      [392, 523, 659].forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.3, i * 0.07));
    },

    tick() { this._tone(1200, 0.04, 'sine', 0.1); }
  };

  g.Sfx = Sfx;
})(typeof window !== 'undefined' ? window : globalThis);
