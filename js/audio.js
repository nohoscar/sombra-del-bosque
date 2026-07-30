// Gestor de audio. Sonido procedural (Web Audio) que funciona sin archivos,
// más carga opcional de clips de ElevenLabs desde /audio (con fallback elegante).
const Sound = {
  ctx: null,
  master: null,
  started: false,
  muted: false,
  clips: {},          // buffers decodificados desde /audio
  _noiseBuf: null,

  // Capas persistentes
  _staticGain: null,
  _windGain: null,
  _readGain: null,
  _readNodes: [],
  _ambienceSrc: null,

  // Estado del latido
  _tension: 0,
  _static: 0,
  _nextBeat: 0,

  // Se llama una vez tras un gesto del usuario (autoplay policy)
  init() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);

    // Buffer de ruido reutilizable (2 s)
    const len = this.ctx.sampleRate * 2;
    this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Capa: zumbido de estática (ruido -> bandpass -> gain)
    this._staticGain = this.ctx.createGain();
    this._staticGain.gain.value = 0;
    const sBP = this.ctx.createBiquadFilter();
    sBP.type = "bandpass";
    sBP.frequency.value = 3200;
    sBP.Q.value = 0.7;
    const sSrc = this.ctx.createBufferSource();
    sSrc.buffer = this._noiseBuf;
    sSrc.loop = true;
    sSrc.connect(sBP); sBP.connect(this._staticGain); this._staticGain.connect(this.master);
    sSrc.start();

    // Capa: viento del bosque (ruido -> lowpass -> gain, con leve LFO)
    this._windGain = this.ctx.createGain();
    this._windGain.gain.value = 0;
    const wLP = this.ctx.createBiquadFilter();
    wLP.type = "lowpass";
    wLP.frequency.value = 480;
    const wSrc = this.ctx.createBufferSource();
    wSrc.buffer = this._noiseBuf;
    wSrc.loop = true;
    wSrc.connect(wLP); wLP.connect(this._windGain); this._windGain.connect(this.master);
    wSrc.start();
    // LFO que mece el viento
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.1;
    lfoGain.gain.value = 0.015;
    lfo.connect(lfoGain); lfoGain.connect(this._windGain.gain);
    lfo.start();

    // Capa: lectura susurrada (para las notas)
    this._readGain = this.ctx.createGain();
    this._readGain.gain.value = 0;
    this._readGain.connect(this.master);

    this.started = true;
    this._nextBeat = this.ctx.currentTime + 1;
    this.loadClips();
  },

  resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    return this.muted;
  },

  // Carga opcional de clips de ElevenLabs (no falla si no existen)
  async loadClips() {
    if (!this.ctx) return;
    const manifest = {
      ambience: "audio/ambience_forest.mp3",
      jumpscare: "audio/jumpscare.mp3",
      whisper1: "audio/whisper_1.mp3",
      whisper2: "audio/whisper_2.mp3",
      whisper3: "audio/whisper_3.mp3",
    };
    for (const [key, url] of Object.entries(manifest)) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const arr = await res.arrayBuffer();
        this.clips[key] = await this.ctx.decodeAudioData(arr);
      } catch (e) { /* sin clip: usamos procedural */ }
    }
  },

  // ---- Bucle: programa el latido según la tensión ----
  update(dt) {
    if (!this.started) return;
    const t = this.ctx.currentTime;

    // Latido: intervalo y volumen según tensión
    if (this._tension > 0.12) {
      if (t >= this._nextBeat) {
        const vol = 0.15 + this._tension * 0.5;
        this._heartbeat(vol);
        const interval = 1.15 - this._tension * 0.8; // más rápido con más tensión
        this._nextBeat = t + Math.max(0.3, interval);
      }
    } else {
      this._nextBeat = t + 0.5;
    }
  },

  setTension(v) { this._tension = Math.max(0, Math.min(1, v)); },

  setStatic(v) {
    this._static = Math.max(0, Math.min(1, v));
    if (this._staticGain) {
      this._staticGain.gain.setTargetAtTime(this._static * 0.09, this.ctx.currentTime, 0.1);
    }
  },

  startAmbience() {
    if (!this.started) return;
    this._windGain.gain.setTargetAtTime(0.06, this.ctx.currentTime, 1.5);
    // Si hay clip de ambiente, lo loopeamos suave
    if (this.clips.ambience && !this._ambienceSrc) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.clips.ambience;
      src.loop = true;
      const g = this.ctx.createGain();
      g.gain.value = 0.5;
      src.connect(g); g.connect(this.master);
      src.start();
      this._ambienceSrc = src;
    }
  },

  stopAmbience() {
    if (!this.started) return;
    this._windGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
    this.setStatic(0);
    this.setTension(0);
    if (this._ambienceSrc) {
      try { this._ambienceSrc.stop(this.ctx.currentTime + 0.4); } catch (e) {}
      this._ambienceSrc = null;
    }
  },

  // ---- Latido (lub-dub) procedural ----
  _heartbeat(vol) {
    const t = this.ctx.currentTime;
    this._thump(t, vol);
    this._thump(t + 0.14, vol * 0.75);
  },
  _thump(when, vol) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(70, when);
    osc.frequency.exponentialRampToValueAtTime(38, when + 0.14);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    osc.connect(g); g.connect(this.master);
    osc.start(when); osc.stop(when + 0.24);
  },

  // ---- Pasos ----
  footstep(running) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "lowpass";
    bp.frequency.value = running ? 900 : 600;
    const g = this.ctx.createGain();
    const vol = running ? 0.14 : 0.07;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.13);
  },

  // ---- Jumpscare (clip si existe; si no, chillido procedural) ----
  stinger() {
    if (!this.started) return;
    if (this.clips.jumpscare) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.clips.jumpscare;
      const g = this.ctx.createGain();
      g.gain.value = 0.95;
      src.connect(g); g.connect(this.master);
      src.start();
      return;
    }
    const t = this.ctx.currentTime;
    // Ruido explosivo + osciladores disonantes en glissando
    const nsrc = this.ctx.createBufferSource();
    nsrc.buffer = this._noiseBuf;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.6, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    nsrc.connect(ng); ng.connect(this.master);
    nsrc.start(t); nsrc.stop(t + 0.7);
    [220, 233, 466].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f * 2, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.6);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.66);
    });
  },

  // ---- Lectura de notas: susurro ininteligible ----
  startReading() {
    if (!this.started) return;
    this.stopReading();
    this._readGain.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.2);

    const whisperKeys = ["whisper1", "whisper2", "whisper3"].filter((k) => this.clips[k]);
    if (whisperKeys.length) {
      // Reproduce un susurro real (ElevenLabs) en bucle, difuminado
      const key = whisperKeys[Math.floor(Math.random() * whisperKeys.length)];
      const src = this.ctx.createBufferSource();
      src.buffer = this.clips[key];
      src.loop = true;
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1700; // borra la inteligibilidad
      src.connect(lp); lp.connect(this._readGain);
      src.start();
      this._readNodes.push(src);
    } else {
      // Murmullo procedural: ruido con formantes y modulación de "habla"
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuf;
      src.loop = true;
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900;
      bp.Q.value = 4;
      const mgain = this.ctx.createGain();
      mgain.gain.value = 0.0;
      src.connect(bp); bp.connect(mgain); mgain.connect(this._readGain);
      // LFO de cadencia de habla
      const lfo = this.ctx.createOscillator();
      const lg = this.ctx.createGain();
      lfo.type = "square";
      lfo.frequency.value = 5.5;
      lg.gain.value = 0.5;
      lfo.connect(lg); lg.connect(mgain.gain);
      const lfo2 = this.ctx.createOscillator();
      lfo2.frequency.value = 0.7;
      const lg2 = this.ctx.createGain();
      lg2.gain.value = 300;
      lfo2.connect(lg2); lg2.connect(bp.frequency);
      src.start(); lfo.start(); lfo2.start();
      this._readNodes.push(src, lfo, lfo2);
    }
  },

  stopReading() {
    if (!this.started) return;
    this._readGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    const nodes = this._readNodes;
    this._readNodes = [];
    setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch (e) {} }), 260);
  },

  // Tic sutil por letra (efecto máquina de escribir / lectura)
  readTick() {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "triangle";
    o.frequency.value = 1200 + Math.random() * 400;
    g.gain.setValueAtTime(0.02, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.04);
  },

  // Clic de interfaz
  ui() {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "square";
    o.frequency.value = 320;
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.09);
  },
};
