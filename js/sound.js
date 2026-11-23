// Pack-opening sounds made live with WebAudio (no audio files). Mute is remembered.
(function (ILL) {
  'use strict';
  let ctx = null, master = null;
  let muted = ILL.u.store.get('ill.muted', false);

  function ac() {
    if (muted) return null;
    try {
      if (!ctx) {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        ctx = new C(); master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) { return null; }
  }

  function tone(freq, start, dur, type, vol, slideTo) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + start;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(start, dur, vol, fromHz, toHz) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + start;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
    f.frequency.setValueAtTime(fromHz, t); f.frequency.exponentialRampToValueAtTime(toHz, t + dur);
    const g = c.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master); src.start(t);
  }

  const NOTES = { common: [523], uncommon: [523, 659], rare: [523, 659, 784], epic: [523, 659, 784, 1047],
    legendary: [392, 523, 659, 784, 1047], mythic: [262, 392, 523, 659, 784, 1047, 1319] };

  const S = {
    get muted() { return muted; },
    setMuted(m) { muted = !!m; ILL.u.store.set('ill.muted', muted); if (muted && ctx) ctx.suspend(); },
    click() { tone(880, 0, 0.05, 'square', 0.06); },
    tear() { noise(0, 0.32, 0.9, 900, 4200); noise(0.08, 0.25, 0.5, 2500, 7000); tone(140, 0, 0.25, 'triangle', 0.25, 60); },
    whoosh() { noise(0, 0.35, 0.4, 300, 2400); },
    flip() { tone(660, 0, 0.07, 'triangle', 0.18, 990); noise(0, 0.08, 0.2, 3000, 6000); },
    reveal(rarityKey, holo) {
      const n = NOTES[rarityKey] || NOTES.common;
      n.forEach((f, i) => tone(f, i * 0.07, 0.35 + i * 0.02, i % 2 ? 'triangle' : 'sine', 0.22));
      if (rarityKey === 'mythic' || rarityKey === 'legendary') { tone(65, 0, 0.9, 'sawtooth', 0.12, 40); noise(0, 0.6, 0.3, 200, 900); }
      if (holo) for (let i = 0; i < 6; i++) tone(1800 + i * 260, 0.25 + i * 0.05, 0.12, 'sine', 0.08);
    },
    coin() { tone(988, 0, 0.08, 'square', 0.1); tone(1319, 0.08, 0.2, 'square', 0.1); },
    error() { tone(200, 0, 0.18, 'sawtooth', 0.12, 140); }
  };
  ILL.sound = S;
})(window.ILL);
