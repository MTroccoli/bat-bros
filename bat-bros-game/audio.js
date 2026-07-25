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
      musicGain.gain.value = 0.4;
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

  function toggleMusic() {
    musicMuted = !musicMuted;
    if (musicGain) musicGain.gain.value = musicMuted ? 0 : 0.25;
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

  // --- Music system ---

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

    if (type === 'menu') {
      playMenuMusic(nodes);
    } else if (type === 'act1') {
      playAct1Music(nodes);
    } else if (type === 'act2') {
      playAct2Music(nodes);
    } else if (type === 'act3') {
      playAct3Music(nodes);
    } else if (type === 'act4') {
      playAct4Music(nodes);
    } else if (type === 'boss-bane') {
      playBossMusic(nodes, 'bane');
    } else if (type === 'boss-twoface') {
      playBossMusic(nodes, 'twoface');
    } else if (type === 'boss-freeze') {
      playBossMusic(nodes, 'freeze');
    } else if (type === 'cave') {
      playCaveMusic(nodes);
    } else if (type === 'chase') {
      playChaseMusic(nodes);
    } else if (type === 'cutscene') {
      playCutsceneMusic(nodes);
    }

    currentMusic = nodes;
  }

  function scheduleLoop(notesFn, loopDuration) {
    const nodes = [];
    let running = true;

    function schedule() {
      if (!running || !ctx) return;
      notesFn(ctx.currentTime, nodes);
      setTimeout(schedule, loopDuration * 1000);
    }
    schedule();

    return {
      nodes,
      stop() { running = false; }
    };
  }

  function playMenuMusic(nodes) {
    const bpm = 70;
    const beat = 60 / bpm;
    const melody = [
      { n: 196, d: 2 }, { n: 233, d: 1 }, { n: 262, d: 1 },
      { n: 311, d: 2 }, { n: 262, d: 1 }, { n: 233, d: 1 },
      { n: 196, d: 2 }, { n: 175, d: 2 },
      { n: 196, d: 2 }, { n: 262, d: 1 }, { n: 311, d: 1 },
      { n: 349, d: 2 }, { n: 311, d: 1 }, { n: 262, d: 1 },
      { n: 233, d: 2 }, { n: 196, d: 2 },
    ];
    const totalBeats = melody.reduce((s, n) => s + n.d, 0);
    const loopLen = totalBeats * beat;

    let running = true;
    function loop() {
      if (!running || !ctx) return;
      const t0 = ctx.currentTime + 0.05;
      let offset = 0;
      for (const note of melody) {
        const dur = note.d * beat;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = note.n;
        gain.gain.setValueAtTime(0.08, t0 + offset);
        gain.gain.setValueAtTime(0.08, t0 + offset + dur * 0.8);
        gain.gain.linearRampToValueAtTime(0, t0 + offset + dur);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start(t0 + offset);
        osc.stop(t0 + offset + dur + 0.01);
        offset += dur;
      }
      // bass drone
      const bass = ctx.createOscillator();
      const bassG = ctx.createGain();
      bass.type = 'sine';
      bass.frequency.value = 98;
      bassG.gain.value = 0.06;
      bass.connect(bassG);
      bassG.connect(musicGain);
      bass.start(t0);
      bass.stop(t0 + loopLen);

      setTimeout(loop, loopLen * 1000);
    }
    loop();
    nodes.push({ osc: null, gain: null, _stop() { running = false; } });
    const origStop = nodes[0]._stop;
    Object.defineProperty(nodes[0], 'gain', { get: () => ({ gain: { linearRampToValueAtTime() { running = false; } } }) });
    Object.defineProperty(nodes[0], 'osc', { get: () => ({ stop() { running = false; } }) });
  }

  function playLoopingMusic(nodes, melody, bassNote, bpm, waveType) {
    const beat = 60 / bpm;
    const totalBeats = melody.reduce((s, n) => s + n.d, 0);
    const loopLen = totalBeats * beat;
    let running = true;

    function loop() {
      if (!running || !ctx) return;
      const t0 = ctx.currentTime + 0.05;
      let offset = 0;
      for (const note of melody) {
        const dur = note.d * beat;
        if (note.n > 0) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = waveType || 'square';
          osc.frequency.value = note.n;
          gain.gain.setValueAtTime(0.06, t0 + offset);
          gain.gain.setValueAtTime(0.06, t0 + offset + dur * 0.75);
          gain.gain.linearRampToValueAtTime(0, t0 + offset + dur);
          osc.connect(gain);
          gain.connect(musicGain);
          osc.start(t0 + offset);
          osc.stop(t0 + offset + dur + 0.01);
        }
        offset += dur;
      }
      if (bassNote) {
        const bass = ctx.createOscillator();
        const bassG = ctx.createGain();
        bass.type = 'sine';
        bass.frequency.value = bassNote;
        bassG.gain.value = 0.05;
        bass.connect(bassG);
        bassG.connect(musicGain);
        bass.start(t0);
        bass.stop(t0 + loopLen);
      }
      setTimeout(loop, loopLen * 1000);
    }
    loop();
    nodes.push({
      get gain() { return { gain: { linearRampToValueAtTime() { running = false; } } }; },
      get osc() { return { stop() { running = false; } }; }
    });
  }

  function playAct1Music(nodes) {
    const melody = [
      { n: 262, d: 1 }, { n: 294, d: 1 }, { n: 330, d: 1 }, { n: 349, d: 1 },
      { n: 392, d: 2 }, { n: 349, d: 1 }, { n: 330, d: 1 },
      { n: 294, d: 2 }, { n: 262, d: 1 }, { n: 294, d: 1 },
      { n: 330, d: 2 }, { n: 262, d: 2 },
      { n: 247, d: 1 }, { n: 262, d: 1 }, { n: 330, d: 1 }, { n: 392, d: 1 },
      { n: 349, d: 2 }, { n: 330, d: 1 }, { n: 294, d: 1 },
      { n: 262, d: 2 }, { n: 247, d: 1 }, { n: 220, d: 1 },
      { n: 262, d: 2 }, { n: 0, d: 2 },
    ];
    playLoopingMusic(nodes, melody, 131, 140, 'square');
  }

  function playAct2Music(nodes) {
    const melody = [
      { n: 330, d: 1 }, { n: 392, d: 1 }, { n: 440, d: 2 },
      { n: 392, d: 1 }, { n: 330, d: 1 }, { n: 294, d: 2 },
      { n: 330, d: 1 }, { n: 349, d: 1 }, { n: 392, d: 1 }, { n: 440, d: 1 },
      { n: 494, d: 2 }, { n: 440, d: 1 }, { n: 392, d: 1 },
      { n: 330, d: 2 }, { n: 294, d: 1 }, { n: 262, d: 1 },
      { n: 330, d: 2 }, { n: 0, d: 2 },
    ];
    playLoopingMusic(nodes, melody, 165, 150, 'square');
  }

  function playAct3Music(nodes) {
    const melody = [
      { n: 220, d: 2 }, { n: 262, d: 1 }, { n: 294, d: 1 },
      { n: 330, d: 2 }, { n: 311, d: 1 }, { n: 262, d: 1 },
      { n: 220, d: 1 }, { n: 208, d: 1 }, { n: 196, d: 2 },
      { n: 220, d: 1 }, { n: 262, d: 1 }, { n: 330, d: 1 }, { n: 349, d: 1 },
      { n: 330, d: 2 }, { n: 262, d: 1 }, { n: 220, d: 1 },
      { n: 196, d: 2 }, { n: 0, d: 2 },
    ];
    playLoopingMusic(nodes, melody, 110, 120, 'triangle');
  }

  function playAct4Music(nodes) {
    const melody = [
      { n: 196, d: 1 }, { n: 233, d: 1 }, { n: 262, d: 2 },
      { n: 294, d: 1 }, { n: 330, d: 1 }, { n: 294, d: 1 }, { n: 262, d: 1 },
      { n: 233, d: 2 }, { n: 196, d: 1 }, { n: 175, d: 1 },
      { n: 196, d: 1 }, { n: 262, d: 1 }, { n: 311, d: 2 },
      { n: 262, d: 1 }, { n: 233, d: 1 }, { n: 196, d: 2 },
      { n: 0, d: 2 },
    ];
    playLoopingMusic(nodes, melody, 98, 130, 'square');
  }

  function playBossMusic(nodes, bossType) {
    let melody, bassNote, bpm;
    if (bossType === 'bane') {
      melody = [
        { n: 165, d: 1 }, { n: 196, d: 1 }, { n: 220, d: 1 }, { n: 165, d: 1 },
        { n: 196, d: 1 }, { n: 262, d: 1 }, { n: 220, d: 1 }, { n: 196, d: 1 },
        { n: 175, d: 1 }, { n: 208, d: 1 }, { n: 262, d: 1 }, { n: 208, d: 1 },
        { n: 175, d: 1 }, { n: 165, d: 1 }, { n: 196, d: 1 }, { n: 0, d: 1 },
      ];
      bassNote = 82; bpm = 180;
    } else if (bossType === 'twoface') {
      melody = [
        { n: 220, d: 1 }, { n: 262, d: 1 }, { n: 330, d: 1 }, { n: 262, d: 1 },
        { n: 220, d: 1 }, { n: 175, d: 1 }, { n: 220, d: 1 }, { n: 262, d: 1 },
        { n: 294, d: 1 }, { n: 330, d: 1 }, { n: 262, d: 1 }, { n: 220, d: 1 },
        { n: 196, d: 1 }, { n: 175, d: 1 }, { n: 165, d: 1 }, { n: 0, d: 1 },
      ];
      bassNote = 110; bpm = 170;
    } else {
      melody = [
        { n: 196, d: 1 }, { n: 208, d: 1 }, { n: 196, d: 1 }, { n: 175, d: 1 },
        { n: 165, d: 2 }, { n: 196, d: 1 }, { n: 233, d: 1 },
        { n: 262, d: 1 }, { n: 233, d: 1 }, { n: 196, d: 1 }, { n: 175, d: 1 },
        { n: 165, d: 2 }, { n: 0, d: 2 },
      ];
      bassNote = 82; bpm = 160;
    }
    playLoopingMusic(nodes, melody, bassNote, bpm, 'sawtooth');
  }

  function playCaveMusic(nodes) {
    const beat = 60 / 60;
    let running = true;

    function loop() {
      if (!running || !ctx) return;
      const t0 = ctx.currentTime + 0.05;
      // ambient cave drone with slow evolving tones
      const drone = ctx.createOscillator();
      const droneG = ctx.createGain();
      drone.type = 'sine';
      drone.frequency.value = 82;
      droneG.gain.setValueAtTime(0.04, t0);
      droneG.gain.setValueAtTime(0.04, t0 + 7.5);
      droneG.gain.linearRampToValueAtTime(0, t0 + 8);
      drone.connect(droneG);
      droneG.connect(musicGain);
      drone.start(t0);
      drone.stop(t0 + 8.01);

      // water drip notes
      const drips = [0.5, 2.1, 3.8, 5.2, 6.9];
      for (const d of drips) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 1200 + Math.random() * 600;
        gain.gain.setValueAtTime(0.04, t0 + d);
        gain.gain.linearRampToValueAtTime(0, t0 + d + 0.15);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start(t0 + d);
        osc.stop(t0 + d + 0.16);
      }

      setTimeout(loop, 8000);
    }
    loop();
    nodes.push({
      get gain() { return { gain: { linearRampToValueAtTime() { running = false; } } }; },
      get osc() { return { stop() { running = false; } }; }
    });
  }

  function playChaseMusic(nodes) {
    const melody = [
      { n: 330, d: 1 }, { n: 330, d: 1 }, { n: 392, d: 1 }, { n: 330, d: 1 },
      { n: 440, d: 1 }, { n: 392, d: 1 }, { n: 330, d: 1 }, { n: 294, d: 1 },
      { n: 330, d: 1 }, { n: 392, d: 1 }, { n: 440, d: 1 }, { n: 494, d: 1 },
      { n: 523, d: 2 }, { n: 440, d: 1 }, { n: 392, d: 1 },
      { n: 330, d: 2 }, { n: 0, d: 2 },
    ];
    playLoopingMusic(nodes, melody, 165, 190, 'square');
  }

  function playCutsceneMusic(nodes) {
    const melody = [
      { n: 175, d: 2 }, { n: 196, d: 2 }, { n: 220, d: 2 }, { n: 233, d: 2 },
      { n: 262, d: 4 }, { n: 220, d: 2 }, { n: 196, d: 2 },
      { n: 175, d: 4 }, { n: 0, d: 4 },
    ];
    playLoopingMusic(nodes, melody, 88, 80, 'triangle');
  }

  // Music type for a given level
  function musicForLevel(levelName, isCave, isChase, hasBane, hasTwoface, hasMrfreeze) {
    if (isCave) return 'cave';
    if (isChase) return 'chase';
    if (hasBane) return null; // boss music triggered separately
    if (hasTwoface) return null;
    if (hasMrfreeze) return null;
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
