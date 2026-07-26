/* ============================================================
   BAT BROS — Sistema de audio procedural (Web Audio API).
   Toda la música y los efectos se sintetizan en tiempo real,
   sin archivos de audio externos.
   ============================================================ */

const BatAudio = (() => {
  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let sfxGain = null;
  let muted = false;
  let musicMuted = false;
  let currentMusic = null;
  let currentMusicType = null;
  let initialized = false;

  function init() {
    if (initialized) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 1.0;
      masterGain.connect(ctx.destination);

      musicGain = ctx.createGain();
      musicGain.gain.value = 0.45;
      musicGain.connect(masterGain);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.5;
      sfxGain.connect(masterGain);

      initialized = true;
    } catch (e) {}
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function ensureReady() {
    init();
    resume();
  }

  function toggleMute() {
    muted = !muted;
    if (masterGain) masterGain.gain.value = muted ? 0 : 1;
    return muted;
  }

  const MUSIC_GAIN = 0.45;
  function toggleMusic() {
    musicMuted = !musicMuted;
    if (musicGain) musicGain.gain.value = musicMuted ? 0 : MUSIC_GAIN;
    return musicMuted;
  }

  function isMuted() { return muted; }
  function isMusicMuted() { return musicMuted; }

  // --- SFX helpers ---

  function playTone(freq, duration, type, volume, dest) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.value = volume || 0.3;
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(dest || sfxGain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  function playNoise(duration, volume, dest) {
    if (!ctx) return;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume || 0.15;
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
    src.connect(gain);
    gain.connect(dest || sfxGain);
    src.start(ctx.currentTime);
  }

  // --- Sound effects ---

  function sfxJump() {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(500, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  }

  function sfxDoubleJump() {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(700, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
    setTimeout(() => {
      if (!ctx) return;
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = 'square';
      o2.frequency.setValueAtTime(400, ctx.currentTime);
      o2.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.08);
      g2.gain.setValueAtTime(0.15, ctx.currentTime);
      g2.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
      o2.connect(g2);
      g2.connect(sfxGain);
      o2.start(ctx.currentTime);
      o2.stop(ctx.currentTime + 0.1);
    }, 60);
  }

  function sfxLand() {
    if (!ctx) return;
    playNoise(0.06, 0.12);
    playTone(80, 0.08, 'sine', 0.15);
  }

  function sfxCoin() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(988, t);
    osc.frequency.setValueAtTime(1319, t + 0.06);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.15);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  function sfxStomp() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.linearRampToValueAtTime(100, t + 0.12);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.15);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(t);
    osc.stop(t + 0.15);
    playNoise(0.08, 0.15);
  }

  function sfxThaw() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.linearRampToValueAtTime(200, t + 0.2);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.25);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(t);
    osc.stop(t + 0.25);
    playNoise(0.15, 0.1);
  }

  function sfxHurt() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.linearRampToValueAtTime(100, t + 0.25);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.3);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(t);
    osc.stop(t + 0.3);
    playNoise(0.15, 0.12);
  }

  function sfxDeath() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = [300, 250, 200, 150, 100];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, t + i * 0.12);
      gain.gain.linearRampToValueAtTime(0, t + i * 0.12 + 0.12);
      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start(t + i * 0.12);
      osc.stop(t + i * 0.12 + 0.13);
    });
  }

  function sfxBatarang() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.linearRampToValueAtTime(900, t + 0.05);
    osc.frequency.linearRampToValueAtTime(500, t + 0.12);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.15);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  function sfxBatarangHit() {
    if (!ctx) return;
    playTone(500, 0.05, 'square', 0.2);
    playTone(300, 0.1, 'square', 0.15);
    playNoise(0.08, 0.1);
  }

  function sfxGrapple() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.linearRampToValueAtTime(400, t + 0.08);
    osc.frequency.linearRampToValueAtTime(350, t + 0.2);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.linearRampToValueAtTime(0.1, t + 0.12);
    gain.gain.linearRampToValueAtTime(0, t + 0.25);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  function sfxSwingRelease() {
    if (!ctx) return;
    playTone(350, 0.06, 'triangle', 0.12);
    playTone(250, 0.08, 'triangle', 0.1);
  }

  function sfxBossHit() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.linearRampToValueAtTime(80, t + 0.2);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.25);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(t);
    osc.stop(t + 0.25);
    playNoise(0.12, 0.2);
  }

  function sfxBossDefeat() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const fanfare = [523, 659, 784, 1047];
    fanfare.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, t + i * 0.15);
      gain.gain.linearRampToValueAtTime(0, t + i * 0.15 + 0.2);
      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start(t + i * 0.15);
      osc.stop(t + i * 0.15 + 0.22);
    });
  }

  function sfxLevelComplete() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const melody = [523, 587, 659, 784, 1047, 1047];
    melody.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      const dur = i === melody.length - 1 ? 0.3 : 0.12;
      gain.gain.setValueAtTime(0.18, t + i * 0.13);
      gain.gain.linearRampToValueAtTime(0, t + i * 0.13 + dur);
      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start(t + i * 0.13);
      osc.stop(t + i * 0.13 + dur + 0.01);
    });
  }

  function sfxGameOver() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = [392, 349, 330, 262, 196];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, t + i * 0.2);
      gain.gain.linearRampToValueAtTime(0, t + i * 0.2 + 0.25);
      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start(t + i * 0.2);
      osc.stop(t + i * 0.2 + 0.27);
    });
  }

  function sfxPowerUp() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = [523, 659, 784, 988, 1047];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, t + i * 0.08);
      gain.gain.linearRampToValueAtTime(0, t + i * 0.08 + 0.12);
      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.13);
    });
  }

  function sfxSmokeBomb() {
    if (!ctx) return;
    playNoise(0.3, 0.2);
    playTone(120, 0.15, 'sine', 0.15);
  }

  function sfxAllCoins() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = [784, 988, 1175, 1319, 1568];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, t + i * 0.1);
      gain.gain.linearRampToValueAtTime(0, t + i * 0.1 + 0.15);
      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start(t + i * 0.1);
      osc.stop(t + i * 0.1 + 0.16);
    });
  }

  function sfxMenuSelect() {
    if (!ctx) return;
    playTone(660, 0.08, 'square', 0.15);
    setTimeout(() => playTone(880, 0.08, 'square', 0.12), 50);
  }

  function sfxSwap() {
    if (!ctx) return;
    const t = ctx.currentTime;
    playTone(440, 0.06, 'triangle', 0.15);
    setTimeout(() => playTone(660, 0.06, 'triangle', 0.15), 70);
    setTimeout(() => playTone(550, 0.08, 'triangle', 0.12), 140);
  }

  function sfxShockwave() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.linearRampToValueAtTime(30, t + 0.4);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.4);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(t);
    osc.stop(t + 0.42);
    playNoise(0.25, 0.15);
  }

  function sfxFreeze() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.linearRampToValueAtTime(400, t + 0.3);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.35);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(t);
    osc.stop(t + 0.35);
    playNoise(0.2, 0.08);
  }

  // ============================================================
  //   MUSIC ENGINE — layered composition
  //   Each track builds from: drums (kick/snare/hats), bass line,
  //   sustained pad chords, main melody, and optional harmony line.
  //   Every track loops via a scheduled function that re-queues its
  //   next iteration at `loopLen * 1000` ms.
  // ============================================================

  function playKick(t, vol) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.14);
    const v = vol || 0.32;
    gain.gain.setValueAtTime(v, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain);
    gain.connect(musicGain);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  function playSnare(t, vol) {
    const dur = 0.18;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1500;
    const gain = ctx.createGain();
    const v = vol || 0.16;
    gain.gain.setValueAtTime(v, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(hp);
    hp.connect(gain);
    gain.connect(musicGain);
    noise.start(t);
    const osc = ctx.createOscillator();
    const oscG = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(160, t + 0.05);
    oscG.gain.setValueAtTime(v * 0.4, t);
    oscG.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(oscG);
    oscG.connect(musicGain);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  function playHat(t, open, vol) {
    const dur = open ? 0.12 : 0.03;
    const buf = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    const gain = ctx.createGain();
    const v = vol || 0.05;
    gain.gain.setValueAtTime(v, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(hp);
    hp.connect(gain);
    gain.connect(musicGain);
    noise.start(t);
  }

  function playBass(freq, t, dur, vol) {
    if (freq <= 0) return;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const gain = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    osc.type = 'sawtooth'; osc.frequency.value = freq;
    sub.type = 'sine'; sub.frequency.value = freq / 2;
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + Math.max(0.08, dur * 0.6));
    const v = vol || 0.11;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(v, t + 0.005);
    gain.gain.setValueAtTime(v, t + dur * 0.9);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(lp); sub.connect(lp); lp.connect(gain); gain.connect(musicGain);
    osc.start(t); sub.start(t);
    osc.stop(t + dur + 0.02); sub.stop(t + dur + 0.02);
  }

  function playLead(freq, t, dur, waveType, vol, vibrato) {
    if (freq <= 0) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = waveType || 'square';
    osc.frequency.value = freq;
    if (vibrato !== false) {
      const lfo = ctx.createOscillator();
      const lfoG = ctx.createGain();
      lfo.frequency.value = 5.5;
      lfoG.gain.value = freq * 0.007;
      lfo.connect(lfoG); lfoG.connect(osc.frequency);
      lfo.start(t + dur * 0.35);
      lfo.stop(t + dur + 0.01);
    }
    const v = vol || 0.07;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(v, t + 0.015);
    gain.gain.setValueAtTime(v, t + dur * 0.8);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(gain);
    gain.connect(musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function playPad(freqs, t, dur, vol) {
    const v = vol || 0.028;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(v, t + Math.min(0.6, dur * 0.3));
    gain.gain.setValueAtTime(v, t + dur - 0.5);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(gain);
    gain.connect(musicGain);
    for (const f of freqs) {
      for (const det of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = det;
        osc.connect(lp);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      }
    }
  }

  function playBell(freq, t, dur, vol) {
    if (freq <= 0) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const v = vol || 0.06;
    gain.gain.setValueAtTime(v, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain); gain.connect(musicGain);
    osc.start(t); osc.stop(t + dur + 0.01);
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = 'sine';
    o2.frequency.value = freq * 3;
    g2.gain.setValueAtTime(v * 0.25, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.7);
    o2.connect(g2); g2.connect(musicGain);
    o2.start(t); o2.stop(t + dur + 0.01);
  }

  // Drums accept an array of tokens per 8th-note step: 'K' kick, 'S' snare,
  // 'H' closed hat, 'O' open hat, '.' rest. Cells combine tokens (e.g. 'KH').
  function playDrums(pattern, t0, stepDur, kV, sV, hV) {
    for (let i = 0; i < pattern.length; i++) {
      const cell = pattern[i];
      if (!cell || cell === '.') continue;
      const t = t0 + i * stepDur;
      if (cell.includes('K')) playKick(t, kV);
      if (cell.includes('S')) playSnare(t, sV);
      if (cell.includes('O')) playHat(t, true, hV);
      else if (cell.includes('H')) playHat(t, false, hV);
    }
  }

  function playNoteSeq(seq, t0, beat, voiceFn) {
    let offset = 0;
    for (const note of seq) {
      const dur = note.d * beat;
      voiceFn(note.n, t0 + offset, dur);
      offset += dur;
    }
  }

  function playTrack(nodes, spec) {
    const beat = 60 / spec.bpm;
    const loopLen = spec.loopBeats * beat;
    let running = true;

    function loop() {
      if (!running || !ctx) return;
      const t0 = ctx.currentTime + 0.05;

      if (spec.drums) {
        const stepDur = loopLen / spec.drums.length;
        const dv = spec.drumVol || {};
        playDrums(spec.drums, t0, stepDur, dv.k, dv.s, dv.h);
      }
      if (spec.bass) {
        const bv = spec.bassVol;
        playNoteSeq(spec.bass, t0, beat, (n, t, d) => playBass(n, t, d, bv));
      }
      if (spec.pad) {
        const pv = spec.padVol;
        let offset = 0;
        for (const chord of spec.pad) {
          const dur = chord.d * beat;
          if (chord.n && chord.n.length) playPad(chord.n, t0 + offset, dur, pv);
          offset += dur;
        }
      }
      if (spec.lead) {
        const w = spec.leadWave || 'square';
        const v = spec.leadVol != null ? spec.leadVol : 0.07;
        playNoteSeq(spec.lead, t0, beat, (n, t, d) => playLead(n, t, d, w, v, spec.leadVib !== false));
      }
      if (spec.harmony) {
        const w = spec.harmonyWave || 'triangle';
        const v = spec.harmonyVol != null ? spec.harmonyVol : 0.045;
        playNoteSeq(spec.harmony, t0, beat, (n, t, d) => playLead(n, t, d, w, v, false));
      }

      setTimeout(loop, loopLen * 1000);
    }
    loop();
    nodes.push({
      get gain() { return { gain: { linearRampToValueAtTime() { running = false; } } }; },
      get osc() { return { stop() { running = false; } }; }
    });
  }

  function stopMusic() {
    if (currentMusic) {
      try {
        currentMusic.forEach(n => {
          try {
            if (n.gain) n.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
            if (n.osc) { try { n.osc.stop(ctx.currentTime + 0.35); } catch(e){} }
          } catch(e) {}
        });
      } catch(e) {}
      currentMusic = null;
      currentMusicType = null;
    }
  }

  function startMusic(type) {
    if (!ctx) return;
    if (currentMusicType === type) return;
    stopMusic();
    currentMusicType = type;

    const nodes = [];
    const builder = MUSIC_BUILDERS[type];
    if (builder) builder(nodes);
    currentMusic = nodes;
  }

  // ---- Track catalog ----
  // All tracks are in a dark minor mode. Frequencies use the standard
  // 12-tone map (A4 = 440).
  const MUSIC_BUILDERS = {
    menu(nodes) {
      playTrack(nodes, {
        bpm: 90, loopBeats: 16,
        drums: [
          'K','.','H','.','.','.','H','.',
          'K','.','H','.','.','.','H','.',
          'K','.','H','.','.','.','H','.',
          'K','.','H','.','.','.','H','.',
        ],
        drumVol: { k: 0.22, h: 0.03 },
        bass: [
          { n: 110, d: 4 }, { n: 110, d: 4 },
          { n: 98,  d: 4 }, { n: 130.8, d: 4 },
        ],
        bassVol: 0.09,
        pad: [
          { n: [220, 261.6, 329.6], d: 4 },
          { n: [220, 261.6, 329.6], d: 4 },
          { n: [196, 233, 293.7], d: 4 },
          { n: [261.6, 311, 392], d: 4 },
        ],
        padVol: 0.03,
        lead: [
          { n: 440, d: 3 }, { n: 523, d: 1 },
          { n: 494, d: 2 }, { n: 440, d: 2 },
          { n: 392, d: 3 }, { n: 466, d: 1 },
          { n: 440, d: 4 },
        ],
        leadWave: 'triangle', leadVol: 0.09,
      });
    },

    act1(nodes) {
      playTrack(nodes, {
        bpm: 140, loopBeats: 16,
        drums: [
          'KH','H','SH','H','KH','H','SH','H',
          'KH','H','SH','H','KH','H','SO','H',
          'KH','H','SH','H','KH','H','SH','H',
          'KH','H','SH','H','KH','H','SO','H',
        ],
        drumVol: { k: 0.22, s: 0.12, h: 0.035 },
        bass: [
          { n: 110, d: 1 }, { n: 110, d: 1 }, { n: 165, d: 1 }, { n: 110, d: 1 },
          { n: 130.8, d: 1 }, { n: 130.8, d: 1 }, { n: 165, d: 1 }, { n: 130.8, d: 1 },
          { n: 98, d: 1 }, { n: 98, d: 1 }, { n: 147, d: 1 }, { n: 98, d: 1 },
          { n: 110, d: 1 }, { n: 165, d: 1 }, { n: 196, d: 1 }, { n: 165, d: 1 },
        ],
        bassVol: 0.13,
        lead: [
          { n: 440, d: 1 }, { n: 523, d: 1 }, { n: 587, d: 2 },
          { n: 523, d: 1 }, { n: 440, d: 1 }, { n: 392, d: 2 },
          { n: 349, d: 1 }, { n: 392, d: 1 }, { n: 440, d: 2 },
          { n: 587, d: 2 }, { n: 494, d: 1 }, { n: 440, d: 1 },
        ],
        leadWave: 'square', leadVol: 0.08,
        harmony: [
          { n: 330, d: 1 }, { n: 392, d: 1 }, { n: 440, d: 2 },
          { n: 392, d: 1 }, { n: 330, d: 1 }, { n: 294, d: 2 },
          { n: 262, d: 1 }, { n: 294, d: 1 }, { n: 330, d: 2 },
          { n: 440, d: 2 }, { n: 392, d: 1 }, { n: 330, d: 1 },
        ],
        harmonyWave: 'triangle', harmonyVol: 0.05,
      });
    },

    act2(nodes) {
      playTrack(nodes, {
        bpm: 150, loopBeats: 16,
        drums: [
          'KH','H','SH','H','K','H','SH','H',
          'KH','H','SH','K','K','H','SO','H',
          'KH','H','SH','H','K','H','SH','H',
          'KH','H','SH','K','K','H','SO','H',
        ],
        drumVol: { k: 0.24, s: 0.13, h: 0.03 },
        bass: [
          { n: 82.4, d: 1 }, { n: 123.5, d: 1 }, { n: 82.4, d: 1 }, { n: 123.5, d: 1 },
          { n: 98, d: 1 }, { n: 147, d: 1 }, { n: 98, d: 1 }, { n: 147, d: 1 },
          { n: 73.4, d: 1 }, { n: 110, d: 1 }, { n: 73.4, d: 1 }, { n: 110, d: 1 },
          { n: 82.4, d: 1 }, { n: 123.5, d: 1 }, { n: 165, d: 1 }, { n: 123.5, d: 1 },
        ],
        bassVol: 0.12,
        pad: [
          { n: [165, 196, 247], d: 4 },
          { n: [196, 233, 294], d: 4 },
          { n: [147, 175, 220], d: 4 },
          { n: [165, 196, 247], d: 4 },
        ],
        padVol: 0.024,
        lead: [
          { n: 330, d: 1 }, { n: 392, d: 1 }, { n: 494, d: 2 },
          { n: 466, d: 1 }, { n: 440, d: 1 }, { n: 392, d: 2 },
          { n: 330, d: 1 }, { n: 349, d: 1 }, { n: 440, d: 1 }, { n: 494, d: 1 },
          { n: 587, d: 2 }, { n: 494, d: 1 }, { n: 440, d: 1 },
          { n: 330, d: 2 }, { n: 294, d: 1 }, { n: 262, d: 1 },
        ],
        leadWave: 'square', leadVol: 0.08,
      });
    },

    act3(nodes) {
      playTrack(nodes, {
        bpm: 110, loopBeats: 16,
        drums: [
          'K','.','.','H','S','.','H','.',
          'K','.','K','.','S','.','H','.',
          'K','.','.','H','S','.','H','.',
          'K','.','K','.','S','.','O','.',
        ],
        drumVol: { k: 0.24, s: 0.11, h: 0.028 },
        bass: [
          { n: 110, d: 2 }, { n: 110, d: 2 },
          { n: 116.5, d: 2 }, { n: 110, d: 2 },
          { n: 98, d: 2 }, { n: 98, d: 2 },
          { n: 82.4, d: 2 }, { n: 110, d: 2 },
        ],
        bassVol: 0.11,
        pad: [
          { n: [220, 261.6, 311, 415], d: 4 },
          { n: [233, 277, 330], d: 4 },
          { n: [196, 247, 294], d: 4 },
          { n: [220, 261.6, 349], d: 4 },
        ],
        padVol: 0.035,
        lead: [
          { n: 440, d: 3 }, { n: 466, d: 1 },
          { n: 523, d: 2 }, { n: 494, d: 2 },
          { n: 392, d: 2 }, { n: 349, d: 1 }, { n: 392, d: 1 },
          { n: 440, d: 2 }, { n: 415, d: 2 },
        ],
        leadWave: 'sawtooth', leadVol: 0.06,
        harmony: [
          { n: 330, d: 3 }, { n: 349, d: 1 },
          { n: 392, d: 2 }, { n: 370, d: 2 },
          { n: 293.7, d: 2 }, { n: 261.6, d: 1 }, { n: 293.7, d: 1 },
          { n: 330, d: 2 }, { n: 311, d: 2 },
        ],
        harmonyWave: 'triangle', harmonyVol: 0.04,
      });
    },

    act4(nodes) {
      playTrack(nodes, {
        bpm: 128, loopBeats: 16,
        drums: [
          'KH','H','SH','H','K','KH','SH','H',
          'KH','H','SH','K','K','H','SO','H',
          'KH','H','SH','H','K','KH','SH','H',
          'KH','H','SH','K','K','H','SO','H',
        ],
        drumVol: { k: 0.24, s: 0.13, h: 0.035 },
        bass: [
          { n: 73.4, d: 1 }, { n: 73.4, d: 1 }, { n: 110, d: 1 }, { n: 73.4, d: 1 },
          { n: 87.3, d: 1 }, { n: 87.3, d: 1 }, { n: 130.8, d: 1 }, { n: 87.3, d: 1 },
          { n: 65.4, d: 1 }, { n: 65.4, d: 1 }, { n: 98, d: 1 }, { n: 65.4, d: 1 },
          { n: 73.4, d: 1 }, { n: 110, d: 1 }, { n: 147, d: 1 }, { n: 110, d: 1 },
        ],
        bassVol: 0.13,
        pad: [
          { n: [147, 175, 220], d: 4 },
          { n: [174, 208, 261.6], d: 4 },
          { n: [130.8, 165, 196], d: 4 },
          { n: [147, 185, 220], d: 4 },
        ],
        padVol: 0.03,
        lead: [
          { n: 440, d: 1 }, { n: 523, d: 1 }, { n: 587, d: 2 },
          { n: 523, d: 1 }, { n: 466, d: 1 }, { n: 440, d: 2 },
          { n: 392, d: 1 }, { n: 440, d: 1 }, { n: 494, d: 2 },
          { n: 523, d: 1 }, { n: 494, d: 1 }, { n: 440, d: 1 }, { n: 392, d: 1 },
        ],
        leadWave: 'square', leadVol: 0.08,
        harmony: [
          { n: 293.7, d: 1 }, { n: 349, d: 1 }, { n: 392, d: 2 },
          { n: 349, d: 1 }, { n: 311, d: 1 }, { n: 293.7, d: 2 },
          { n: 261.6, d: 1 }, { n: 293.7, d: 1 }, { n: 330, d: 2 },
          { n: 349, d: 1 }, { n: 330, d: 1 }, { n: 293.7, d: 1 }, { n: 261.6, d: 1 },
        ],
        harmonyWave: 'triangle', harmonyVol: 0.05,
      });
    },

    'boss-bane'(nodes)     { playBossTrack(nodes, 'bane'); },
    'boss-twoface'(nodes)  { playBossTrack(nodes, 'twoface'); },
    'boss-freeze'(nodes)   { playBossTrack(nodes, 'freeze'); },
    'boss-penguin'(nodes)  { playBossTrack(nodes, 'penguin'); },

    cave(nodes) {
      let running = true;
      function loop() {
        if (!running || !ctx) return;
        const t0 = ctx.currentTime + 0.05;
        playPad([110, 130.8, 165], t0, 8, 0.03);
        playPad([87.3, 104, 155.6], t0 + 8, 8, 0.03);
        const bells = [
          { t: 0.5, f: 880 }, { t: 2.2, f: 1046 }, { t: 4.1, f: 784 },
          { t: 5.8, f: 1174 }, { t: 7.5, f: 880 },
          { t: 9.3, f: 698 }, { t: 11.2, f: 831 }, { t: 13.6, f: 622 },
        ];
        for (const b of bells) playBell(b.f, t0 + b.t, 1.2, 0.05);
        const drone = ctx.createOscillator();
        const dG = ctx.createGain();
        drone.type = 'sine';
        drone.frequency.value = 55;
        dG.gain.setValueAtTime(0, t0);
        dG.gain.linearRampToValueAtTime(0.05, t0 + 2);
        dG.gain.setValueAtTime(0.05, t0 + 14);
        dG.gain.linearRampToValueAtTime(0, t0 + 16);
        drone.connect(dG); dG.connect(musicGain);
        drone.start(t0); drone.stop(t0 + 16.01);
        setTimeout(loop, 16000);
      }
      loop();
      nodes.push({
        get gain() { return { gain: { linearRampToValueAtTime() { running = false; } } }; },
        get osc() { return { stop() { running = false; } }; }
      });
    },

    chase(nodes) {
      playTrack(nodes, {
        bpm: 180, loopBeats: 16,
        drums: [
          'KH','H','SH','H','KH','H','SH','H',
          'KH','H','SH','H','KH','H','SO','H',
          'KH','H','SH','H','KH','H','SH','H',
          'KH','H','SH','H','KH','H','SO','SH',
        ],
        drumVol: { k: 0.26, s: 0.14, h: 0.038 },
        bass: [
          { n: 165, d: 0.5 }, { n: 165, d: 0.5 },
          { n: 175, d: 0.5 }, { n: 175, d: 0.5 },
          { n: 185, d: 0.5 }, { n: 185, d: 0.5 },
          { n: 196, d: 0.5 }, { n: 208, d: 0.5 },
          { n: 220, d: 0.5 }, { n: 220, d: 0.5 },
          { n: 233, d: 0.5 }, { n: 233, d: 0.5 },
          { n: 247, d: 0.5 }, { n: 247, d: 0.5 },
          { n: 261.6, d: 0.5 }, { n: 233, d: 0.5 },
          { n: 220, d: 0.5 }, { n: 220, d: 0.5 },
          { n: 233, d: 0.5 }, { n: 233, d: 0.5 },
          { n: 220, d: 0.5 }, { n: 220, d: 0.5 },
          { n: 196, d: 0.5 }, { n: 196, d: 0.5 },
          { n: 175, d: 0.5 }, { n: 175, d: 0.5 },
          { n: 165, d: 0.5 }, { n: 165, d: 0.5 },
          { n: 147, d: 0.5 }, { n: 165, d: 0.5 },
          { n: 175, d: 0.5 }, { n: 196, d: 0.5 },
        ],
        bassVol: 0.13,
        lead: [
          { n: 659, d: 1 }, { n: 587, d: 1 }, { n: 523, d: 1 }, { n: 494, d: 1 },
          { n: 523, d: 1 }, { n: 587, d: 1 }, { n: 659, d: 1 }, { n: 784, d: 1 },
          { n: 880, d: 2 }, { n: 784, d: 1 }, { n: 659, d: 1 },
          { n: 523, d: 1 }, { n: 587, d: 1 }, { n: 659, d: 1 }, { n: 494, d: 1 },
        ],
        leadWave: 'square', leadVol: 0.075,
      });
    },

    cutscene(nodes) {
      playTrack(nodes, {
        bpm: 80, loopBeats: 16,
        bass: [
          { n: 87.3, d: 4 }, { n: 82.4, d: 4 },
          { n: 73.4, d: 4 }, { n: 98, d: 4 },
        ],
        bassVol: 0.09,
        pad: [
          { n: [174, 220, 261.6], d: 4 },
          { n: [165, 208, 247], d: 4 },
          { n: [147, 185, 220], d: 4 },
          { n: [196, 247, 293.7], d: 4 },
        ],
        padVol: 0.04,
        lead: [
          { n: 349, d: 4 }, { n: 415, d: 4 },
          { n: 466, d: 4 }, { n: 392, d: 4 },
        ],
        leadWave: 'triangle', leadVol: 0.06,
      });
    },
  };

  // Boss music engine — same driving beat, different key + melody per villain.
  function playBossTrack(nodes, kind) {
    let spec;
    if (kind === 'bane') {
      spec = {
        bpm: 172, root: 82.4, key5: 116.5,
        pad: [
          { n: [82.4, 116.5, 165], d: 4 },
          { n: [82.4, 116.5, 165], d: 4 },
          { n: [98, 138.6, 196],   d: 4 },
          { n: [82.4, 116.5, 165], d: 4 },
        ],
        lead: [
          { n: 329.6, d: 1 }, { n: 391.9, d: 1 }, { n: 466, d: 1 }, { n: 391.9, d: 1 },
          { n: 329.6, d: 1 }, { n: 466, d: 1 }, { n: 391.9, d: 1 }, { n: 329.6, d: 1 },
          { n: 293.7, d: 1 }, { n: 349, d: 1 }, { n: 415, d: 1 }, { n: 349, d: 1 },
          { n: 329.6, d: 1 }, { n: 293.7, d: 1 }, { n: 246.9, d: 1 }, { n: 293.7, d: 1 },
        ],
      };
    } else if (kind === 'twoface') {
      spec = {
        bpm: 172, root: 110, key5: 155.6,
        pad: [
          { n: [110, 130.8, 165], d: 4 },
          { n: [138.6, 165, 220], d: 4 },
          { n: [110, 130.8, 165], d: 4 },
          { n: [123.5, 147, 196], d: 4 },
        ],
        lead: [
          { n: 440, d: 1 }, { n: 523, d: 1 }, { n: 659, d: 1 }, { n: 523, d: 1 },
          { n: 440, d: 1 }, { n: 349, d: 1 }, { n: 440, d: 1 }, { n: 523, d: 1 },
          { n: 587, d: 1 }, { n: 659, d: 1 }, { n: 523, d: 1 }, { n: 440, d: 1 },
          { n: 392, d: 1 }, { n: 349, d: 1 }, { n: 329.6, d: 1 }, { n: 261.6, d: 1 },
        ],
        harmony: [
          { n: 330, d: 1 }, { n: 415, d: 1 }, { n: 523, d: 1 }, { n: 415, d: 1 },
          { n: 330, d: 1 }, { n: 277, d: 1 }, { n: 330, d: 1 }, { n: 415, d: 1 },
          { n: 466, d: 1 }, { n: 523, d: 1 }, { n: 415, d: 1 }, { n: 330, d: 1 },
          { n: 311, d: 1 }, { n: 277, d: 1 }, { n: 261.6, d: 1 }, { n: 220, d: 1 },
        ],
      };
    } else if (kind === 'penguin') {
      spec = {
        bpm: 165, root: 73.4, key5: 104,
        pad: [
          { n: [73.4, 87.3, 110], d: 4 },
          { n: [87.3, 104, 130.8], d: 4 },
          { n: [65.4, 78, 98], d: 4 },
          { n: [73.4, 92.5, 116.5], d: 4 },
        ],
        lead: [
          { n: 587, d: 1 }, { n: 494, d: 1 }, { n: 440, d: 1 }, { n: 494, d: 1 },
          { n: 523, d: 1 }, { n: 622, d: 1 }, { n: 587, d: 1 }, { n: 466, d: 1 },
          { n: 440, d: 1 }, { n: 415, d: 1 }, { n: 349, d: 1 }, { n: 415, d: 1 },
          { n: 440, d: 1 }, { n: 494, d: 1 }, { n: 587, d: 1 }, { n: 622, d: 1 },
        ],
      };
    } else {
      // Mr. Freeze — cold, high pad + tritone-flavored lead
      spec = {
        bpm: 158, root: 65.4, key5: 98,
        pad: [
          { n: [130.8, 155.6, 196, 261.6], d: 4 },
          { n: [138.6, 165, 220], d: 4 },
          { n: [116.5, 147, 175], d: 4 },
          { n: [130.8, 155.6, 196], d: 4 },
        ],
        lead: [
          { n: 523, d: 2 }, { n: 587, d: 2 },
          { n: 622, d: 2 }, { n: 587, d: 2 },
          { n: 523, d: 1 }, { n: 466, d: 1 }, { n: 523, d: 2 },
          { n: 622, d: 2 }, { n: 466, d: 2 },
        ],
      };
    }
    const drums = [
      'KH','H','SH','H','KH','H','SH','H',
      'KH','H','SH','H','KH','H','SO','H',
      'KH','H','SH','H','KH','H','SH','H',
      'KH','H','SH','H','KH','H','SO','SH',
    ];
    const b = spec.root, b5 = spec.key5;
    const bass = [
      { n: b, d: 0.5 }, { n: b, d: 0.5 }, { n: b5, d: 0.5 }, { n: b, d: 0.5 },
      { n: b, d: 0.5 }, { n: b, d: 0.5 }, { n: b5, d: 0.5 }, { n: b, d: 0.5 },
      { n: b, d: 0.5 }, { n: b, d: 0.5 }, { n: b5, d: 0.5 }, { n: b, d: 0.5 },
      { n: b, d: 0.5 }, { n: b5, d: 0.5 }, { n: b * 2, d: 0.5 }, { n: b5, d: 0.5 },
      { n: b, d: 0.5 }, { n: b, d: 0.5 }, { n: b5, d: 0.5 }, { n: b, d: 0.5 },
      { n: b, d: 0.5 }, { n: b, d: 0.5 }, { n: b5, d: 0.5 }, { n: b, d: 0.5 },
      { n: b, d: 0.5 }, { n: b, d: 0.5 }, { n: b5, d: 0.5 }, { n: b, d: 0.5 },
      { n: b, d: 0.5 }, { n: b5, d: 0.5 }, { n: b * 2, d: 0.5 }, { n: b5, d: 0.5 },
    ];
    playTrack(nodes, {
      bpm: spec.bpm, loopBeats: 16,
      drums, drumVol: { k: 0.28, s: 0.16, h: 0.04 },
      bass, bassVol: 0.14,
      pad: spec.pad, padVol: 0.036,
      lead: spec.lead, leadWave: 'sawtooth', leadVol: 0.075,
      harmony: spec.harmony, harmonyWave: 'square', harmonyVol: 0.05,
    });
  }

  // Music type for a given level
  function musicForLevel(levelName, isCave, isChase, hasBane, hasTwoface, hasMrfreeze, hasPenguin) {
    if (isCave) return 'cave';
    if (isChase) return 'chase';
    if (hasBane) return null; // boss music triggered separately
    if (hasTwoface) return null;
    if (hasMrfreeze) return null;
    if (hasPenguin) return null;
    if (!levelName) return 'act1';
    if (levelName.startsWith('4-')) return 'act4';
    if (levelName.startsWith('3-')) return 'act3';
    if (levelName.startsWith('2-')) return 'act2';
    return 'act1';
  }

  return {
    init, ensureReady, toggleMute, toggleMusic, isMuted, isMusicMuted,
    startMusic, stopMusic, musicForLevel,
    sfxJump, sfxDoubleJump, sfxLand, sfxCoin, sfxStomp, sfxThaw,
    sfxHurt, sfxDeath, sfxBatarang, sfxBatarangHit, sfxGrapple,
    sfxSwingRelease, sfxBossHit, sfxBossDefeat, sfxLevelComplete,
    sfxGameOver, sfxPowerUp, sfxSmokeBomb, sfxAllCoins, sfxMenuSelect,
    sfxSwap, sfxShockwave, sfxFreeze,
  };
})();
