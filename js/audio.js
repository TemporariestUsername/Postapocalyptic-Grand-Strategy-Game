/* ASHFALL — audio.js
 * The full soundtrack, synthesized live. No audio files anywhere.
 *
 * Music: a layered dark-ambient engine in A phrygian — detuned drones, a
 * noise-wind bed, slow pads, sparse plucked melody, war percussion — driven
 * by a lookahead scheduler and a "mood" that follows the game state
 * (title / calm / tension / war / doom). Stingers punctuate events.
 * SFX: every interface and battle sound is an envelope over oscillators
 * and filtered noise.
 *
 * Everything no-ops cleanly when WebAudio is unavailable (tests, headless).
 */
"use strict";
var ASH = typeof ASH !== "undefined" ? ASH : {};

ASH.audio = (function () {
  var ctx = null;
  var master, musicBus, sfxBus, compressor, verb, verbGain;
  var started = false;
  var muted = false;
  var musicVol = 0.8, sfxVol = 0.8;

  /* ---------------- theory ---------------- */
  var ROOT = 45; // A2
  var PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  /* chord shapes as scale degrees (rooted on A) */
  var PROGRESSIONS = {
    title:   [[0, 2, 4], [-2, 0, 2], [0, 2, 4], [1, 3, 5]],
    calm:    [[0, 2, 4], [5, 7, 9], [3, 5, 7], [0, 2, 4]],
    tension: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [4, 6, 8]],
    war:     [[0, 2, 4], [0, 2, 4], [1, 3, 5], [4, 6, 8]],
    doom:    [[0, 2, 4], [1, 2, 4], [0, 2, 4], [1, 2, 6]]
  };
  function degToMidi(deg, octave) {
    var d = ((deg % 7) + 7) % 7;
    var oct = Math.floor(deg / 7);
    return ROOT + PHRYGIAN[d] + 12 * (oct + (octave || 0));
  }

  /* ---------------- mood ---------------- */
  var MOODS = {
    title:   { bpm: 54, drone: 0.50, wind: 0.40, pad: 0.55, melody: 0.45, perc: 0.00, bell: 0.5 },
    calm:    { bpm: 60, drone: 0.42, wind: 0.34, pad: 0.45, melody: 0.50, perc: 0.05, bell: 0.4 },
    tension: { bpm: 76, drone: 0.50, wind: 0.45, pad: 0.38, melody: 0.30, perc: 0.30, bell: 0.2 },
    war:     { bpm: 104, drone: 0.45, wind: 0.40, pad: 0.30, melody: 0.22, perc: 0.85, bell: 0.0 },
    doom:    { bpm: 50, drone: 0.65, wind: 0.60, pad: 0.40, melody: 0.18, perc: 0.15, bell: 0.6 }
  };
  var mood = "title";
  var layers = {}; // name -> GainNode

  function setMood(m) {
    if (!MOODS[m]) return;
    mood = m;
    if (!ctx) return;
    var t = ctx.currentTime;
    var def = MOODS[m];
    ["drone", "wind", "pad", "melody", "perc", "bell"].forEach(function (k) {
      if (layers[k]) {
        layers[k].gain.cancelScheduledValues(t);
        layers[k].gain.setTargetAtTime(def[k], t, 2.2);
      }
    });
  }

  /* Map game state -> mood. Called by the UI each turn / on battles. */
  function updateMood(state) {
    if (!state) { setMood("title"); return; }
    var p = state.factions[0];
    if (!p) { setMood("title"); return; }
    if (state.over) { setMood(state.over.win ? "calm" : "doom"); return; }
    var wars = 0;
    ASH.util.each(p.atWar, function (v) { if (v) wars++; });
    if (p.hope < 22) setMood("doom");
    else if (wars > 0) setMood("war");
    else if (p.hope < 45 || nearbyThreat(state)) setMood("tension");
    else setMood("calm");
  }
  function nearbyThreat(state) {
    for (var i = 0; i < state.storms.length; i++) {
      var st = state.storms[i];
      if (state.visible && state.visible[st.tile]) return true;
    }
    return false;
  }

  /* ---------------- plumbing ---------------- */
  function makeNoiseBuffer(seconds, color) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      var last = 0;
      for (var i = 0; i < len; i++) {
        var w = Math.random() * 2 - 1;
        if (color === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
        else d[i] = w;
      }
    }
    return buf;
  }

  function makeReverb() {
    var seconds = 2.8, len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
    }
    var conv = ctx.createConvolver();
    conv.buffer = buf;
    return conv;
  }

  function env(param, t0, attack, peak, decay, sustain) {
    param.cancelScheduledValues(t0);
    param.setValueAtTime(0.0001, t0);
    param.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + attack);
    param.exponentialRampToValueAtTime(Math.max(sustain || 0.0001, 0.0001), t0 + attack + decay);
  }

  /* ---------------- persistent music layers ---------------- */
  function buildLayers() {
    /* drone: two detuned saws + sub sine through a breathing lowpass */
    var g = ctx.createGain(); g.gain.value = 0;
    var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 220; lp.Q.value = 1.2;
    var lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    var lfoG = ctx.createGain(); lfoG.gain.value = 90;
    lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
    [["sawtooth", mtof(ROOT - 12), -6], ["sawtooth", mtof(ROOT - 12) * 1.006, 6], ["sine", mtof(ROOT - 24), 0]].forEach(function (spec) {
      var o = ctx.createOscillator();
      o.type = spec[0]; o.frequency.value = spec[1]; o.detune.value = spec[2];
      var og = ctx.createGain(); og.gain.value = spec[0] === "sine" ? 0.5 : 0.22;
      o.connect(og); og.connect(lp); o.start();
    });
    lp.connect(g); g.connect(musicBus);
    layers.drone = g;

    /* wind: looped brown noise through a slowly wandering bandpass */
    var wg = ctx.createGain(); wg.gain.value = 0;
    var src = ctx.createBufferSource(); src.buffer = makeNoiseBuffer(6, "brown"); src.loop = true;
    var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 320; bp.Q.value = 0.6;
    var wlfo = ctx.createOscillator(); wlfo.frequency.value = 0.07;
    var wlfoG = ctx.createGain(); wlfoG.gain.value = 180;
    wlfo.connect(wlfoG); wlfoG.connect(bp.frequency); wlfo.start();
    var amp = ctx.createOscillator(); amp.frequency.value = 0.043;
    var ampG = ctx.createGain(); ampG.gain.value = 0.4;
    var ampBase = ctx.createGain(); ampBase.gain.value = 1.0;
    amp.connect(ampG); amp.start();
    src.connect(bp); bp.connect(ampBase); ampG.connect(ampBase.gain);
    ampBase.connect(wg); wg.connect(musicBus);
    src.start();
    layers.wind = wg;

    /* buses for scheduled voices */
    ["pad", "melody", "perc", "bell"].forEach(function (k) {
      var lg = ctx.createGain(); lg.gain.value = 0;
      lg.connect(musicBus);
      layers[k] = lg;
    });

    /* shared echo for the melody — a wasteland's worth of empty space */
    var dly = ctx.createDelay(2.0); dly.delayTime.value = 0.55;
    var fb = ctx.createGain(); fb.gain.value = 0.42;
    var dGain = ctx.createGain(); dGain.gain.value = 0.5;
    layers.melody.connect(dly); dly.connect(fb); fb.connect(dly);
    dly.connect(dGain); dGain.connect(musicBus);
  }

  /* ---------------- scheduler ---------------- */
  var nextStep = 0, stepIdx = 0, barIdx = 0, timer = null;
  var rngLocal = null;

  function secondsPerStep() { return 60 / MOODS[mood].bpm / 2; } // 8th notes

  function schedulerTick() {
    if (!ctx) return;
    while (nextStep < ctx.currentTime + 0.15) {
      scheduleStep(nextStep, stepIdx, barIdx);
      nextStep += secondsPerStep();
      stepIdx++;
      if (stepIdx % 8 === 0) barIdx++;
    }
  }

  function chordNow(bar) {
    var prog = PROGRESSIONS[mood] || PROGRESSIONS.calm;
    return prog[Math.floor(bar / 2) % prog.length];
  }

  function scheduleStep(t, step, bar) {
    var s8 = step % 8;
    var chord = chordNow(bar);

    /* pads: a slow chord swell at the top of every other bar */
    if (s8 === 0 && bar % 2 === 0) {
      var barLen = secondsPerStep() * 8;
      for (var i = 0; i < chord.length; i++) {
        padVoice(degToMidi(chord[i], 1), t, barLen * 2.2, 0.16 / chord.length + 0.02);
      }
    }

    /* melody: probabilistic, chord-aware, sparse */
    var mel = MOODS[mood].melody;
    if (mel > 0.01 && rngLocal() < (s8 % 2 === 0 ? 0.16 : 0.07) * (mel + 0.4)) {
      var deg = chord[Math.floor(rngLocal() * chord.length)] + (rngLocal() < 0.4 ? 7 : 14);
      if (rngLocal() < 0.25) deg += rngLocal() < 0.5 ? 1 : -1; // a passing sting
      pluck(degToMidi(deg, 0), t, 0.20);
    }

    /* bells: rare, far away */
    if (MOODS[mood].bell > 0.01 && s8 === 0 && rngLocal() < 0.10 * MOODS[mood].bell) {
      bell(degToMidi(chord[0] + 14, 0), t, 0.10);
    }

    /* percussion */
    var perc = MOODS[mood].perc;
    if (perc > 0.02) {
      if (mood === "war" || mood === "tension") {
        if (s8 === 0 || (s8 === 3 && rngLocal() < 0.7) || (s8 === 6 && mood === "war")) tom(t, s8 === 0 ? 0.9 : 0.55);
        if (mood === "war" && s8 === 4) clank(t, 0.35);
        if (mood === "war" && rngLocal() < 0.12) tick(t, 0.2);
      } else if (s8 === 0 && rngLocal() < 0.35) {
        tom(t, 0.35); // a slow heartbeat under calm
      }
    }
  }

  /* ---------------- voices ---------------- */
  function padVoice(midi, t, dur, vol) {
    var o1 = ctx.createOscillator(); o1.type = "triangle"; o1.frequency.value = mtof(midi);
    var o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = mtof(midi) * 2.003;
    var g = ctx.createGain();
    var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(layers.pad); g.connect(verb);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }

  function pluck(midi, t, vol) {
    var o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = mtof(midi);
    var g = ctx.createGain();
    var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 3;
    lp.frequency.setValueAtTime(2600, t);
    lp.frequency.exponentialRampToValueAtTime(320, t + 0.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(lp); lp.connect(g); g.connect(layers.melody); g.connect(verb);
    o.start(t); o.stop(t + 1.2);
  }

  function bell(midi, t, vol) {
    /* two-operator FM — a far-off, slightly sour chime */
    var car = ctx.createOscillator(); car.frequency.value = mtof(midi);
    var modO = ctx.createOscillator(); modO.frequency.value = mtof(midi) * 2.76;
    var modG = ctx.createGain(); modG.gain.setValueAtTime(mtof(midi) * 1.8, t);
    modG.gain.exponentialRampToValueAtTime(1, t + 2.2);
    modO.connect(modG); modG.connect(car.frequency);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    car.connect(g); g.connect(layers.bell); g.connect(verb);
    car.start(t); modO.start(t); car.stop(t + 3.3); modO.stop(t + 3.3);
  }

  function tom(t, vol) {
    var o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    var g = ctx.createGain();
    env(g.gain, t, 0.004, vol * 0.5, 0.32);
    o.connect(g); g.connect(layers.perc);
    o.start(t); o.stop(t + 0.5);
    var n = ctx.createBufferSource(); n.buffer = noiseShot();
    var ng = ctx.createGain(); env(ng.gain, t, 0.002, vol * 0.12, 0.08);
    var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 900;
    n.connect(hp); hp.connect(ng); ng.connect(layers.perc);
    n.start(t); n.stop(t + 0.1);
  }

  function clank(t, vol) {
    [613, 1187, 1670].forEach(function (f, i) {
      var o = ctx.createOscillator(); o.type = "square"; o.frequency.value = f * (1 + Math.random() * 0.01);
      var g = ctx.createGain(); env(g.gain, t, 0.001, vol * (0.12 / (i + 1)), 0.4);
      var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 9;
      o.connect(bp); bp.connect(g); g.connect(layers.perc); g.connect(verb);
      o.start(t); o.stop(t + 0.5);
    });
  }

  function tick(t, vol) {
    var n = ctx.createBufferSource(); n.buffer = noiseShot();
    var g = ctx.createGain(); env(g.gain, t, 0.001, vol * 0.2, 0.03);
    var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 4;
    n.connect(bp); bp.connect(g); g.connect(layers.perc);
    n.start(t); n.stop(t + 0.06);
  }

  var noiseShotBuf = null;
  function noiseShot() {
    if (!noiseShotBuf) noiseShotBuf = makeNoiseBuffer(0.5);
    return noiseShotBuf;
  }

  /* ---------------- stingers ---------------- */
  function stinger(kind) {
    if (!ctx) return;
    var t = ctx.currentTime + 0.02;
    if (kind === "event") {
      bell(degToMidi(0, 0) + 12, t, 0.18);
      padVoice(degToMidi(0, 0), t, 3.0, 0.10);
    } else if (kind === "battle") {
      tom(t, 1.0); clank(t + 0.05, 0.5); tom(t + 0.22, 0.7);
    } else if (kind === "war") {
      tom(t, 1.0); tom(t + 0.3, 1.0); clank(t + 0.6, 0.6);
      padVoice(degToMidi(1, -1), t, 4.0, 0.14);
    } else if (kind === "victory") {
      [0, 4, 7, 14].forEach(function (d, i) { pluck(degToMidi(d, 1), t + i * 0.16, 0.22); });
      padVoice(degToMidi(0, 1), t, 6.0, 0.16);
      bell(degToMidi(14, 0), t + 0.7, 0.12);
    } else if (kind === "defeat") {
      [7, 5, 1, 0].forEach(function (d, i) { pluck(degToMidi(d, -1), t + i * 0.3, 0.2); });
      padVoice(degToMidi(1, -1), t, 7.0, 0.18);
    } else if (kind === "season") {
      bell(degToMidi(7, 0), t, 0.08);
    }
  }

  /* ---------------- SFX ---------------- */
  function blip(t, f0, f1, dur, vol, type) {
    var o = ctx.createOscillator(); o.type = type || "triangle";
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    var g = ctx.createGain(); env(g.gain, t, 0.002, vol, dur);
    o.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noiseHit(t, freq, q, dur, vol) {
    var n = ctx.createBufferSource(); n.buffer = noiseShot();
    var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
    var g = ctx.createGain(); env(g.gain, t, 0.002, vol, dur);
    n.connect(bp); bp.connect(g); g.connect(sfxBus);
    n.start(t); n.stop(t + dur + 0.05);
  }

  function sfx(name) {
    if (!ctx || muted) return;
    var t = ctx.currentTime + 0.01;
    switch (name) {
      case "click": blip(t, 660, 440, 0.06, 0.12); break;
      case "hover": blip(t, 880, 0, 0.025, 0.03); break;
      case "select": blip(t, 520, 700, 0.07, 0.10); noiseHit(t, 1800, 3, 0.04, 0.05); break;
      case "move": noiseHit(t, 700, 1.2, 0.12, 0.10); noiseHit(t + 0.08, 500, 1.2, 0.1, 0.07); break;
      case "build": noiseHit(t, 1300, 5, 0.05, 0.2); blip(t + 0.07, 180, 120, 0.1, 0.15, "square"); noiseHit(t + 0.16, 1500, 5, 0.05, 0.14); break;
      case "recruit": blip(t, 220, 330, 0.1, 0.14, "square"); noiseHit(t + 0.06, 1000, 2, 0.06, 0.08); break;
      case "attack": noiseHit(t, 400, 0.8, 0.25, 0.3); blip(t, 150, 60, 0.3, 0.25, "sawtooth"); noiseHit(t + 0.05, 2400, 8, 0.12, 0.2); break;
      case "claim": blip(t, 330, 220, 0.12, 0.16, "square"); noiseHit(t + 0.03, 900, 3, 0.06, 0.1); break;
      case "salvage": for (var i = 0; i < 4; i++) noiseHit(t + i * 0.05, 1500 + i * 400, 6, 0.04, 0.12 - i * 0.02); break;
      case "endturn": blip(t, 392, 196, 0.4, 0.12, "triangle"); noiseHit(t, 600, 0.7, 0.5, 0.08); break;
      case "error": blip(t, 160, 140, 0.18, 0.15, "square"); break;
      case "coin": blip(t, 988, 1319, 0.08, 0.10); break;
      case "research": [523, 659, 784].forEach(function (f, k) { blip(t + k * 0.07, f, 0, 0.08, 0.08); }); break;
      case "found": blip(t, 262, 392, 0.3, 0.14); bellSafe(t + 0.2, 0.08); break;
      case "alert": blip(t, 740, 740, 0.09, 0.12, "square"); blip(t + 0.12, 740, 740, 0.09, 0.12, "square"); break;
    }
  }
  function bellSafe(t, vol) { try { bell(degToMidi(7, 0), t, vol); } catch (e) { /* bell uses music layers; ignore if absent */ } }

  /* ---------------- lifecycle ---------------- */
  function boot() {
    if (started) { resume(); return; }
    var AC = (typeof window !== "undefined") && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 1;
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18; compressor.ratio.value = 6;
    master.connect(compressor); compressor.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = musicVol * 0.9;
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxVol;
    musicBus.connect(master); sfxBus.connect(master);
    verb = makeReverb();
    verbGain = ctx.createGain(); verbGain.gain.value = 0.5;
    verb.connect(verbGain); verbGain.connect(musicBus);
    rngLocal = ASH.rng.local((Date.now() & 0xffff) ^ 0x5eed);
    buildLayers();
    setMood(mood);
    nextStep = ctx.currentTime + 0.1;
    timer = setInterval(schedulerTick, 30);
    started = true;
  }

  function resume() { if (ctx && ctx.state === "suspended") ctx.resume(); }

  function setVolumes(music, sfxv) {
    musicVol = music; sfxVol = sfxv;
    if (musicBus) musicBus.gain.setTargetAtTime(music * 0.9, ctx.currentTime, 0.1);
    if (sfxBus) sfxBus.gain.setTargetAtTime(sfxv, ctx.currentTime, 0.1);
  }
  function setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05);
  }
  function isMuted() { return muted; }
  function getVolumes() { return { music: musicVol, sfx: sfxVol }; }

  return { boot: boot, resume: resume, setMood: setMood, updateMood: updateMood,
           stinger: stinger, sfx: sfx, setVolumes: setVolumes, getVolumes: getVolumes,
           setMuted: setMuted, isMuted: isMuted };
})();

if (typeof module !== "undefined" && module.exports) module.exports = ASH;
