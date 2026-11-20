// Procedural WebAudio sound for Umbravault — no asset files. Effects are synthesized from oscillators + noise.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('uv.muted') === '1';
  }

  // must be called from a user gesture (browsers block audio until then)
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('uv.muted', this.muted ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  // low drone + filtered wind + occasional distant drips
  startAmbience() {
    const c = this.ctx;
    const amb = c.createGain(); amb.gain.value = 0.16; amb.connect(this.master);
    for (const [f, det] of [[55, 0], [82.4, 4], [110, -6]]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
      const g = c.createGain(); g.gain.value = 0.18;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.05 + Math.random() * 0.08;
      const lfoG = c.createGain(); lfoG.gain.value = 0.1; lfo.connect(lfoG); lfoG.connect(g.gain);
      o.connect(lp); lp.connect(g); g.connect(amb); o.start(); lfo.start();
    }
    const wind = c.createBufferSource(); wind.buffer = this.noiseBuf; wind.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 0.7;
    const wg = c.createGain(); wg.gain.value = 0.25;
    const wl = c.createOscillator(); wl.frequency.value = 0.07; const wlg = c.createGain(); wlg.gain.value = 250;
    wl.connect(wlg); wlg.connect(bp.frequency); wl.start();
    wind.connect(bp); bp.connect(wg); wg.connect(amb); wind.start();
    const drip = () => { if (!this.muted) this.tone(1200 + Math.random() * 900, 0.18, 'sine', 0.05, 400); setTimeout(drip, 3000 + Math.random() * 7000); };
    setTimeout(drip, 4000);
  }

  // ---------- primitives ----------
  tone(freq, dur, type = 'sine', vol = 0.3, slideTo = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }

  noise(dur, vol = 0.3, filter = 'lowpass', freq = 1000, slideTo = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = filter; f.frequency.setValueAtTime(freq, t);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // ---------- game sounds ----------
  step() { this.noise(0.09, 0.12, 'lowpass', 500 + Math.random() * 200); this.tone(70, 0.08, 'sine', 0.08); }
  bump() { this.tone(90, 0.12, 'square', 0.08, 50); }
  turn() { this.noise(0.12, 0.04, 'bandpass', 1500, 700); }

  play(ev, selfId) {
    const near = ev.near !== false;
    const v = near ? 1 : 0.5;
    switch (ev.k) {
      case 'swing': this.noise(0.16, 0.25 * v, 'bandpass', 2500, 600); break;
      case 'bolt': this.tone(880, 0.25, 'triangle', 0.18 * v, 220); this.tone(1320, 0.2, 'sine', 0.08 * v, 330); break;
      case 'arrow': this.noise(0.18, 0.18 * v, 'highpass', 3000, 1200); this.tone(500, 0.05, 'square', 0.05 * v); break;
      case 'fire': this.noise(0.3, 0.25 * v, 'lowpass', 600, 2000); this.noise(0.7, 0.45 * v, 'lowpass', 1200, 80, 0.2); this.tone(60, 0.6, 'sine', 0.4 * v, 30, 0.2); break;
      case 'frost': for (let i = 0; i < 5; i++) this.tone(1800 + i * 350, 0.4, 'sine', 0.06 * v, 2600, i * 0.04); this.noise(0.5, 0.15 * v, 'highpass', 4000); break;
      case 'holy': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.7, 'triangle', 0.1 * v, null, i * 0.05)); break;
      case 'thorn': this.noise(0.5, 0.2 * v, 'bandpass', 300, 900); this.tone(140, 0.4, 'sawtooth', 0.06 * v, 70); break;
      case 'heal': [660, 880, 1100].forEach((f, i) => this.tone(f, 0.45, 'sine', 0.1 * v, null, i * 0.08)); break;
      case 'drain': this.tone(600, 0.3, 'sine', 0.14 * v, 180); this.tone(180, 0.35, 'sine', 0.08 * v, 600, 0.2); break;
      case 'hex': this.tone(110, 0.7, 'sawtooth', 0.1 * v, 55); this.noise(0.6, 0.15 * v, 'bandpass', 500, 150); this.tone(233, 0.6, 'triangle', 0.08 * v, 220); break;
      case 'ward': this.tone(300, 0.5, 'square', 0.06 * v, 320); this.noise(0.3, 0.12 * v, 'bandpass', 1200, 600); break;
      case 'might': this.tone(220, 0.6, 'sawtooth', 0.12 * v, 440); this.tone(330, 0.6, 'sawtooth', 0.08 * v, 660); break;
      case 'veil': this.tone(400, 0.6, 'sine', 0.12 * v, 90); this.noise(0.6, 0.08 * v, 'lowpass', 800, 100); break;
      case 'levelup': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.35, 'square', 0.07, null, i * 0.08)); break;
      case 'equip': [392, 523, 659, 784].slice(0, 2 + ev.r).forEach((f, i) => this.tone(f * (1 + ev.r * 0.25), 0.3, 'triangle', 0.1, null, i * 0.07)); break;
      case 'pickup': this.tone(1400, 0.08, 'square', 0.06); this.tone(2100, 0.15, 'square', 0.05, null, 0.06); break;
      case 'dmg': this.noise(0.1, ev.crit ? 0.4 : 0.25, 'lowpass', ev.crit ? 2500 : 1400); if (ev.crit) this.tone(180, 0.15, 'square', 0.12, 90); break;
      case 'death': this.tone(300, 0.5, 'sawtooth', 0.12 * v, 60); this.noise(0.4, 0.2 * v, 'lowpass', 900, 100); break;
      case 'door': this.noise(0.9, 0.18 * v, 'lowpass', 300, 900); for (let i = 0; i < 6; i++) this.tone(180 + Math.random() * 60, 0.05, 'square', 0.04 * v, null, i * 0.13); break;
      case 'trap': this.tone(1500, 0.06, 'square', 0.1 * v); this.noise(0.25, 0.35 * v, 'highpass', 2500, 800, 0.03); break;
      case 'disarm': this.tone(1200, 0.06, 'square', 0.05); this.tone(900, 0.08, 'square', 0.05, null, 0.08); break;
      case 'warn': this.tone(60, 1.4, 'sawtooth', 0.25, 120); this.noise(1.4, 0.2, 'lowpass', 200, 1200); break;
      case 'bossnova': this.noise(0.9, 0.5, 'lowpass', 2500, 80); this.tone(50, 0.9, 'sine', 0.5, 25); break;
      case 'summon': this.tone(220, 0.5, 'triangle', 0.1 * v, 110); this.noise(0.4, 0.12 * v, 'bandpass', 600, 200); break;
      case 'claw': this.noise(0.12, 0.2 * v, 'bandpass', 1800, 500); break;
      case 'mbolt': this.tone(300, 0.3, 'sawtooth', 0.1 * v, 120); break;
      case 'num': if (!ev.heal && ev.pid === selfId) { this.tone(110, 0.2, 'square', 0.15, 55); this.noise(0.15, 0.2, 'lowpass', 700); } break;
      case 'revive': [440, 554, 659, 880, 1109].forEach((f, i) => this.tone(f, 0.6, 'sine', 0.1, null, i * 0.09)); break;
      case 'pdeath': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.12, null, i * 0.18)); break;
    }
  }

  descend() { this.tone(220, 1.6, 'sine', 0.25, 55); this.noise(1.6, 0.25, 'lowpass', 2000, 100); }
  chat() { this.tone(988, 0.08, 'sine', 0.06); this.tone(1319, 0.12, 'sine', 0.05, null, 0.07); }
  bossRoar() { this.tone(80, 1.4, 'sawtooth', 0.35, 40); this.noise(1.4, 0.3, 'lowpass', 500, 80); }
}
