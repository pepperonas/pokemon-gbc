'use strict';
/**
 * sound.js — Minimale GBC-artige Sound-Effekte per WebAudio (Square/Triangle-
 * Bleeps, keine Samples). Stumm schaltbar mit Taste M (persistiert).
 *
 * Der AudioContext wird lazy erzeugt und bei Bedarf resumed — Browser
 * erlauben Sound erst nach der ersten Nutzer-Interaktion.
 */
const Sound = (() => {
  let ctx = null;
  let muted = localStorage.getItem('pkmn_mute') === '1';

  function ac() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  /** Einzelner Ton: freq in Hz, dur in s, optionaler Pitch-Slide. */
  function tone(freq, dur = 0.07, type = 'square', vol = 0.04, when = 0, slide = 0) {
    if (muted) return;
    const a = ac();
    if (!a) return;
    const t = a.currentTime + when;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function toggleMute() {
    muted = !muted;
    localStorage.setItem('pkmn_mute', muted ? '1' : '0');
    if (!muted) tone(880, 0.06);
    return muted;
  }
  window.addEventListener('keydown', e => {
    if (e.key === 'm' || e.key === 'M') toggleMute();
  });

  return {
    toggleMute,
    get muted() { return muted; },
    cursor()  { tone(880, 0.035, 'square', 0.02); },
    confirm() { tone(660, 0.05); tone(990, 0.06, 'square', 0.035, 0.05); },
    hit(eff = 1) { tone(eff > 1 ? 220 : eff < 1 ? 110 : 160, 0.12, 'sawtooth', 0.05, 0, -80); },
    faint()   { tone(300, 0.3, 'square', 0.05, 0, -260); },
    levelup() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.09, 'square', 0.035, i * 0.08)); },
    catch()   { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.1, 'square', 0.035, i * 0.09)); },
    badge()   { [523, 523, 587, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0.04, i * 0.1)); },
    heal()    { [784, 988, 1175].forEach((f, i) => tone(f, 0.08, 'triangle', 0.05, i * 0.07)); },
    alert()   { tone(1046, 0.09, 'square', 0.05); tone(1046, 0.09, 'square', 0.05, 0.12); },
    warp()    { tone(440, 0.1, 'triangle', 0.035, 0, 200); },
  };
})();
