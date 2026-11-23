// Prosedürel ses efektleri (WebAudio) — harici ses dosyası gerekmez.
(function () {
  const UI = (window.UI = window.UI || {});
  let ctx = null;
  let master = null;
  let muted = false;
  let vol = 1; // 0..1 (Ayarlar'dan)
  UI.setVolume = v => { vol = Math.max(0, Math.min(1, v)); if (master) master.gain.value = 0.35 * vol; };
  try { muted = localStorage.getItem('ygo_mute') === '1'; } catch (e) {}

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35 * vol;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, ensure, { once: false, passive: true }));

  function tone(freq, dur, { type = 'sine', vol = 0.5, slide = 0, delay = 0, attack = 0.005 } = {}) {
    const c = ensure(); if (!c || muted) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, { vol = 0.4, freq = 1500, q = 1, type = 'bandpass', delay = 0, sweep = 0 } = {}) {
    const c = ensure(); if (!c || muted) return;
    const t = c.currentTime + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  const SFX = {
    click() { tone(520, 0.06, { type: 'triangle', vol: 0.25 }); },
    draw() { noise(0.09, { vol: 0.25, freq: 3500, q: 0.7, type: 'highpass' }); },
    phase() { tone(660, 0.08, { type: 'sine', vol: 0.2 }); tone(880, 0.1, { type: 'sine', vol: 0.15, delay: 0.06 }); },
    summon() { tone(110, 0.35, { type: 'sawtooth', vol: 0.45, slide: -50 }); noise(0.25, { vol: 0.35, freq: 700, q: 0.8 }); tone(330, 0.25, { type: 'triangle', vol: 0.2, delay: 0.1, slide: 220 }); },
    set() { noise(0.12, { vol: 0.3, freq: 900, q: 1.2 }); tone(180, 0.12, { type: 'square', vol: 0.12 }); },
    attack() { noise(0.28, { vol: 0.5, freq: 4000, q: 1.5, type: 'bandpass', sweep: -3000 }); tone(300, 0.25, { type: 'sawtooth', vol: 0.18, slide: -200 }); },
    hit() { noise(0.18, { vol: 0.7, freq: 300, q: 0.7, type: 'lowpass' }); tone(90, 0.25, { type: 'square', vol: 0.5, slide: -50 }); },
    destroy() { noise(0.55, { vol: 0.6, freq: 1800, q: 0.6, type: 'bandpass', sweep: -1400 }); tone(70, 0.5, { type: 'sawtooth', vol: 0.35, slide: -40 }); },
    spell() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, { type: 'sine', vol: 0.22, delay: i * 0.07 })); noise(0.4, { vol: 0.12, freq: 6000, type: 'highpass', delay: 0.05 }); },
    trap() { tone(220, 0.35, { type: 'sawtooth', vol: 0.3, slide: 330 }); tone(110, 0.5, { type: 'square', vol: 0.25 }); noise(0.2, { vol: 0.4, freq: 2500, q: 2 }); },
    fusion() { for (let i = 0; i < 8; i++) tone(300 + i * 110, 0.35, { type: 'sine', vol: 0.18, delay: i * 0.06 }); noise(0.6, { vol: 0.25, freq: 800, q: 0.5, sweep: 5000 }); },
    damage() { tone(140, 0.3, { type: 'square', vol: 0.4, slide: -90 }); noise(0.15, { vol: 0.4, freq: 600, type: 'lowpass' }); },
    heal() { [523, 659, 784].forEach((f, i) => tone(f, 0.25, { type: 'sine', vol: 0.2, delay: i * 0.08 })); },
    pack() { noise(0.5, { vol: 0.4, freq: 600, q: 0.6, sweep: 4000 }); tone(220, 0.4, { type: 'sawtooth', vol: 0.15, slide: 400 }); },
    reveal(rank) { const n = { N: 1, R: 2, SR: 3, UR: 4, PR: 6 }[rank] || 1; for (let i = 0; i < n; i++) tone(520 + i * 160, 0.25, { type: 'triangle', vol: 0.22, delay: i * 0.07 }); if (n >= 4) noise(0.5, { vol: 0.2, freq: 7000, type: 'highpass' }); },
    buy() { tone(880, 0.07, { type: 'square', vol: 0.15 }); tone(1320, 0.12, { type: 'square', vol: 0.15, delay: 0.07 }); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.4, { type: 'triangle', vol: 0.3, delay: i * 0.12 })); },
    lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.5, { type: 'sawtooth', vol: 0.22, delay: i * 0.18 })); },
  };

  UI.sfx = (name, ...a) => { try { if (SFX[name]) SFX[name](...a); } catch (e) {} };
  UI.isMuted = () => muted;
  UI.toggleMute = () => {
    muted = !muted;
    try { localStorage.setItem('ygo_mute', muted ? '1' : '0'); } catch (e) {}
    UI.toast(muted ? 'Ses kapalı' : 'Ses açık');
    document.querySelectorAll('.mutebtn').forEach(b => (b.textContent = muted ? '🔇' : '🔊'));
    return muted;
  };
  document.addEventListener('keydown', e => { if (e.key === 'm' || e.key === 'M') UI.toggleMute(); });
})();
