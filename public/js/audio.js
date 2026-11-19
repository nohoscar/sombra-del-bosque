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
    this._initMusic();
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
    // Voces del modo historia (si faltan, el juego solo muestra el subtitulo)
    for (const key of this.VOICES) {
      try {
        const res = await fetch(`audio/voz/${key}.mp3`);
        if (!res.ok) continue;
        this.voices[key] = await this.ctx.decodeAudioData(await res.arrayBuffer());
      } catch (e) { /* sin voz */ }
    }
  },

  // ================= VOCES =================
  VOICES: [
    "op_1", "op_2", "op_3", "pr_tommy", "pr_contestadora", "pr_dibujo", "pr_ventana", "pr_caja",
    "pr_linterna", "pr_salir", "in_1", "n1_inicio", "n1_arbusto", "n1_ahi", "n1_huellas", "n1_miller",
    "n1_baliza", "n1_tommy", "n2_inicio", "n2_bitacora", "n2_literas", "n2_cinta", "n2_tommy", "n2_nolo",
    "n2_dibujo", "n2_final", "n2_cab1", "n2_cab2", "n2_cab3",
  ],
  voices: {},
  _voiceSrc: null,
  // Voces que suenan por un aparato viejo (contestadora, dictafono, cinta)
  _FILTERED: ["pr_contestadora", "n1_miller", "n2_cinta"],
  // Ajuste de volumen por linea (algunas grabaciones salen mas fuertes)
  _GAIN: {},   // las voces ya vienen con el mismo volumen (loudnorm)

  hasVoice(key) { return !!(this.voices && this.voices[key]); },

  // Reproduce una voz; devuelve su duracion (0 si no existe).
  // panTo (-1 izquierda .. 1 derecha) coloca la voz en un lado.
  playVoice(key, panTo) {
    if (!this.started || !this.voices[key]) return 0;
    this.stopVoice();
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.voices[key];
    let node = src;
    if (this._FILTERED.includes(key)) {
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 420;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3000;
      const sh = ctx.createWaveShaper(); sh.curve = this._crunch(); 
      node.connect(hp); hp.connect(lp); lp.connect(sh); node = sh;
      // siseo de cinta debajo
      const hiss = ctx.createBufferSource(); hiss.buffer = this._noiseBuf; hiss.loop = true;
      const hg = ctx.createGain(); hg.gain.value = 0.025;
      const hb = ctx.createBiquadFilter(); hb.type = "highpass"; hb.frequency.value = 2500;
      hiss.connect(hb); hb.connect(hg); hg.connect(this.master);
      hiss.start(t); hiss.stop(t + src.buffer.duration + 0.3);
    }
    const g = ctx.createGain(); g.gain.value = this._GAIN[key] ?? 1.0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    // La voz de Tommy no viene de un lugar fijo: se mueve de un oido al otro
    if (pan && key === "n1_tommy") {
      pan.pan.setValueAtTime(-0.9, t);
      pan.pan.linearRampToValueAtTime(0.9, t + src.buffer.duration);
    } else if (pan && typeof panTo === "number") {
      pan.pan.value = Math.max(-1, Math.min(1, panTo));
    }
    node.connect(g);
    if (pan) { g.connect(pan); pan.connect(this.master); } else g.connect(this.master);
    // La musica se hace a un lado mientras hablan
    if (this._musicBus) {
      this._musicBus.gain.setTargetAtTime(0.45, t, 0.2);
      this._musicBus.gain.setTargetAtTime(1, t + src.buffer.duration, 0.6);
    }
    src.start(t);
    this._voiceSrc = src;
    return src.buffer.duration;
  },

  stopVoice() {
    if (this._voiceSrc) { try { this._voiceSrc.stop(); } catch (e) {} this._voiceSrc = null; }
    if (this._musicBus && this.ctx) this._musicBus.gain.setTargetAtTime(1, this.ctx.currentTime, 0.4);
  },

  _crunch() {
    if (this.__crunch) return this.__crunch;
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * 2.2); }
    return (this.__crunch = c);
  },

  // Paso del Esbelto: golpe grave y crujido de ramas, colocado a la izquierda o derecha
  slenderStep(pan, vol) {
    if (!this.started || vol <= 0.01) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = vol;
    let dest = out;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; out.connect(p); p.connect(this.master); }
    else out.connect(this.master);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.2);
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.9, t + 0.015); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(og); og.connect(dest); o.start(t); o.stop(t + 0.32);
    const n = ctx.createBufferSource(); n.buffer = this._noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900 + Math.random() * 700; bp.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.35, t + 0.01); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    n.connect(bp); bp.connect(ng); ng.connect(dest); n.start(t, Math.random()); n.stop(t + 0.14);
  },

  // ================= MENU =================
  // Musica del menu: viento, grillos y la caja de musica de Tommy cada tanto
  menuStart() {
    if (!this.started || this._menuTimer) return;
    this.startAmbience();
    this.setMusic("home");
    this.theme();
    this._menuTimer = setInterval(() => this.theme(Math.random() < 0.3), 15000);
  },
  menuStop() {
    if (this._menuTimer) { clearInterval(this._menuTimer); this._menuTimer = null; }
    this.stopAmbience();
  },
  // Chispazo corto de estatica
  glitchBurst(vol) {
    const V = vol ?? 1;
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this._noiseBuf;
    const bp = this.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32 * V + 0.0002, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    s.connect(bp); bp.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + 0.4);
    const o = this.ctx.createOscillator(), og = this.ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    og.gain.setValueAtTime(0.3 * V + 0.0002, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.65);
  },

  // ================= MUSICA QUE CAMBIA EN VIVO =================
  // Capas: zumbido grave (siempre), cuerdas tensas (sospecha) y percusion (persecucion).
  _initMusic() {
    const ctx = this.ctx;
    this._musicBus = ctx.createGain(); this._musicBus.gain.value = 1;
    this._musicBus.connect(this.master);
    // Reverb casera para la caja de musica y los golpes
    this._reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this._reverb.buffer = ir;
    const rvGain = ctx.createGain(); rvGain.gain.value = 0.55;
    this._reverb.connect(rvGain); rvGain.connect(this._musicBus);

    const layer = (freqs, type, cutoff, detune) => {
      const g = ctx.createGain(); g.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = cutoff;
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
        o.detune.value = (i % 2 ? 1 : -1) * detune;
        o.connect(lp); o.start();
      });
      lp.connect(g); g.connect(this._musicBus);
      return { g, lp };
    };
    this._drone = layer([55, 55.4, 82.4], "triangle", 260, 4);
    this._strings = layer([110, 116.5, 155.6, 164.8], "sawtooth", 650, 9);
    // El filtro de las cuerdas "respira" despacio
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 380;
    lfo.connect(lg); lg.connect(this._strings.lp.frequency); lfo.start();
    this._strings.g.connect(this._reverb);
    // Zumbido electrico cuando el esta cerca (los aparatos fallan)
    this._buzz = ctx.createGain(); this._buzz.gain.value = 0;
    const bo = ctx.createOscillator(); bo.type = "square"; bo.frequency.value = 60;
    const bb = ctx.createBiquadFilter(); bb.type = "bandpass"; bb.frequency.value = 180; bb.Q.value = 3;
    bo.connect(bb); bb.connect(this._buzz); this._buzz.connect(this.master); bo.start();
    // Zumbido grave que sube mientras se acerca (se siente mas que se oye)
    this._sub = ctx.createGain(); this._sub.gain.value = 0;
    [36, 36.7].forEach((f) => { const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = f; o2.connect(this._sub); o2.start(); });
    this._sub.connect(this.master);

    this._music = "off"; this._chase = 0; this._nextDrum = 0; this._drumStep = 0;
    this._nextWhisper = ctx.currentTime + 20;
  },

  setMusic(state) {
    if (!this.started || !this._drone || state === this._music) return;
    this._music = state;
    const t = this.ctx.currentTime;
    const L = {
      off: [0, 0, 0], home: [0.05, 0, 0], calm: [0.085, 0.012, 0],
      tension: [0.1, 0.05, 0], chase: [0.11, 0.085, 1],
    }[state] || [0, 0, 0];
    const tc = state === "chase" ? 0.25 : 1.4;
    this._drone.g.gain.setTargetAtTime(L[0], t, tc);
    this._strings.g.gain.setTargetAtTime(L[1], t, tc);
    this._chase = L[2];
    if (state === "chase") this._nextDrum = t + 0.05;
  },

  setProximity(v) {
    this._prox = Math.max(0, Math.min(1, v || 0));
    if (!this._buzz) return;
    // Interferencia que tartamudea, no un tono limpio
    const jitter = this._prox > 0.2 && Math.random() < 0.3 ? 0 : 1;
    this._buzz.gain.setTargetAtTime(this._prox * this._prox * 0.035 * jitter, this.ctx.currentTime, 0.03);
    if (this._sub) this._sub.gain.setTargetAtTime(this._prox * this._prox * 0.22, this.ctx.currentTime, 0.4);
  },

  // Silencio total un instante antes de un susto
  silence(sec) {
    if (!this.started) return;
    const t = this.ctx.currentTime, full = this.muted ? 0 : 0.9;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(full * 0.04, t, 0.08);
    this.master.gain.setTargetAtTime(full, t + sec, 0.02);
  },

  // Golpe de aparicion: impacto grave + chirrido de cuerdas
  hit() {
    if (!this.started) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.2);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.8, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g); g.connect(this.master); o.connect(this._reverb); o.start(t); o.stop(t + 1.7);
    [1760, 1864, 2093].forEach((f) => {
      const s = ctx.createOscillator(), sg = ctx.createGain();
      s.type = "sawtooth"; s.frequency.setValueAtTime(f, t); s.frequency.linearRampToValueAtTime(f * 0.94, t + 1.4);
      sg.gain.setValueAtTime(0.0001, t); sg.gain.exponentialRampToValueAtTime(0.05, t + 0.05); sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      s.connect(sg); sg.connect(this._reverb); sg.connect(this.master); s.start(t); s.stop(t + 1.6);
    });
  },

  // Tema de Tommy: caja de musica. "roto" = mas lento y desafinado
  theme(roto) {
    if (!this.started) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.1;
    const A = 440, n = (s) => A * Math.pow(2, s / 12);
    const mel = [[7, .45], [12, .45], [15, .45], [14, .45], [12, .9], [7, .45], [10, .45], [8, .45], [7, 1.4]];
    let t = t0;
    mel.forEach(([semi, d], i) => {
      const f = n(semi) * (roto ? 1 + (Math.random() - 0.5) * 0.03 : 1);
      [1, 2.01, 3.98].forEach((mul, k) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = k ? "sine" : "triangle"; o.frequency.value = f * mul;
        const v = [0.07, 0.025, 0.01][k];
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        o.connect(g); g.connect(this._musicBus); g.connect(this._reverb);
        o.start(t); o.stop(t + 1.7);
      });
      t += d * (roto ? 1.35 + i * 0.05 : 1);
    });
  },

  // Percusion de persecucion y susurros que rodean (se llaman desde update)
  _musicTick() {
    const ctx = this.ctx, t = ctx.currentTime;
    if (this._chase > 0 && t >= this._nextDrum - 0.1) {
      const step = this._drumStep++ % 8, when = Math.max(t, this._nextDrum);
      if (step === 0 || step === 3 || step === 6) this._drum(when, 0.5, 58);
      if (step === 4) this._drum(when, 0.3, 110);
      this._tick(when, step % 2 ? 0.02 : 0.035);
      this._nextDrum = when + 60 / 150 / 2;
    }
    // Con mucha estatica, alguien susurra a tu alrededor
    if (this._static > 0.55 && t >= this._nextWhisper) {
      const keys = ["whisper1", "whisper2", "whisper3"].filter((k) => this.clips[k]);
      if (keys.length) {
        const src = ctx.createBufferSource(); src.buffer = this.clips[keys[Math.floor(Math.random() * keys.length)]];
        const g = ctx.createGain(); g.gain.value = 0.12;
        const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200;
        src.connect(lp); lp.connect(g);
        if (ctx.createStereoPanner) {
          const p = ctx.createStereoPanner(); const side = Math.random() < 0.5 ? -1 : 1;
          p.pan.setValueAtTime(side, t); p.pan.linearRampToValueAtTime(-side * 0.6, t + 3);
          g.connect(p); p.connect(this.master);
        } else g.connect(this.master);
        src.start(t); src.stop(t + 3.5);
      }
      this._nextWhisper = t + 9 + Math.random() * 10;
    }
  },
  _drum(when, vol, f) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(f * 2, when); o.frequency.exponentialRampToValueAtTime(f * 0.6, when + 0.18);
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(vol, when + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.35);
    o.connect(g); g.connect(this._musicBus); o.start(when); o.stop(when + 0.4);
  },
  _tick(when, vol) {
    const s = this.ctx.createBufferSource(); s.buffer = this._noiseBuf;
    const hp = this.ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 6000;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    s.connect(hp); hp.connect(g); g.connect(this._musicBus); s.start(when, Math.random()); s.stop(when + 0.06);
  },

  // ---- Bucle: programa el latido según la tensión ----
  update(dt) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    if (this._drone) this._musicTick();

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
    this.setMusic("off");
    this.setProximity(0);
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
      // El susurro se mueve alrededor de tu cabeza (con audifonos)
      if (this.ctx.createStereoPanner) {
        const pn = this.ctx.createStereoPanner(), plfo = this.ctx.createOscillator(), pg = this.ctx.createGain();
        plfo.frequency.value = 0.18; pg.gain.value = 0.85; plfo.connect(pg); pg.connect(pn.pan); plfo.start();
        src.connect(lp); lp.connect(pn); pn.connect(this._readGain); this._readNodes.push(plfo);
      } else src.connect(lp), lp.connect(this._readGain);
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
