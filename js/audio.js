/* ASHFALL — audio.js
 * The full soundtrack, synthesized live. No audio files anywhere.
 *
 * Two axes shape the score:
 *  - THEME (who you are): each faction has its own musical identity — mode,
 *    root pitch, drone/pluck timbres, percussion style, bell character, and
 *    a short signature motif. The title screen has its own wasteland theme.
 *  - MOOD (how it's going): title / calm / tension / war / doom follow the
 *    game state and crossfade layer intensities, tempo, and density.
 *
 * Layers: detuned drones, a noise-wind bed, slow pads, sparse chord-aware
 * melody through a long echo, percussion, far-off bells — all driven by a
 * lookahead scheduler. Stingers punctuate events; every interface and battle
 * sound is an envelope over oscillators and filtered noise.
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
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  var SCALES = {
    phrygian:    [0, 1, 3, 5, 7, 8, 10],  // the wasteland's default tongue
    dorian:      [0, 2, 3, 5, 7, 9, 10],  // minor with a warm sixth
    phrygianDom: [0, 1, 4, 5, 7, 8, 10],  // martial, scorched
    lydian:      [0, 2, 4, 6, 7, 9, 11],  // radiant, wrong in a beautiful way
    mixolydian:  [0, 2, 4, 5, 7, 9, 10],  // road music
    harmMinor:   [0, 2, 3, 5, 7, 8, 11],  // monastic, candle-lit
    locrian:     [0, 1, 3, 5, 6, 8, 10]   // nothing here will resolve
  };

  /* chord shapes as scale degrees — they adapt to whichever scale is live */
  var PROGRESSIONS = {
    title:   [[0, 2, 4], [-2, 0, 2], [0, 2, 4], [1, 3, 5]],
    calm:    [[0, 2, 4], [5, 7, 9], [3, 5, 7], [0, 2, 4]],
    tension: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [4, 6, 8]],
    war:     [[0, 2, 4], [0, 2, 4], [1, 3, 5], [4, 6, 8]],
    doom:    [[0, 2, 4], [1, 2, 4], [0, 2, 4], [1, 2, 6]]
  };

  /* ---------------- faction themes ----------------
   * root: MIDI note the world hums at. motif: [scaleDegree, lengthInSteps]
   * pairs — a faction's signature phrase, played now and then in the melody
   * register. layerMul scales mood layer gains to bias the mix. */
  var THEMES = {
    title: {
      root: 45, scale: "phrygian",
      drone: { type: "sawtooth", filter: 220 }, wind: { freq: 320 },
      pad: { type: "triangle" },
      pluck: { cut: 2600, fall: 320, decay: 1.1, type: "sawtooth", glide: 0 },
      bellRatio: 2.76, bellMul: 1, melodyMul: 1, tempoMult: 1,
      percStyle: "waste", layerMul: {},
      motif: [[0, 1], [7, 1], [8, 2], [7, 4]]
    },
    hearth: { /* D dorian — furrows, woodsmoke, stubborn warmth */
      root: 50, scale: "dorian",
      drone: { type: "triangle", filter: 300 }, wind: { freq: 260 },
      pad: { type: "sine" },
      pluck: { cut: 2100, fall: 380, decay: 1.5, type: "triangle", glide: 0 },
      bellRatio: 2.0, bellMul: 0.8, melodyMul: 1.15, tempoMult: 0.95,
      percStyle: "soft", layerMul: { pad: 1.15, melody: 1.1, perc: 0.7 },
      motif: [[0, 1], [1, 1], [2, 1], [4, 3], [2, 2]] /* seed, sprout, stand */
    },
    legion: { /* G phrygian dominant — forges, columns, appetite */
      root: 43, scale: "phrygianDom",
      drone: { type: "sawtooth", filter: 185 }, wind: { freq: 430 },
      pad: { type: "sawtooth" },
      pluck: { cut: 3000, fall: 260, decay: 0.8, type: "square", glide: 0 },
      bellRatio: 3.0, bellMul: 0.35, melodyMul: 0.8, tempoMult: 1.08,
      percStyle: "anvil", layerMul: { perc: 1.3, drone: 1.1, bell: 0.5 },
      motif: [[0, 1], [0, 1], [1, 2], [0, 4]] /* hammer, hammer, strike */
    },
    choir: { /* C lydian — the Glow, singing back */
      root: 48, scale: "lydian",
      drone: { type: "triangle", filter: 340 }, wind: { freq: 540 },
      pad: { type: "sine", vibrato: true },
      pluck: { cut: 2400, fall: 600, decay: 1.7, type: "triangle", glide: 0 },
      bellRatio: 2.76, bellMul: 1.6, melodyMul: 0.9, tempoMult: 0.9,
      percStyle: "gong", layerMul: { pad: 1.3, bell: 1.4, perc: 0.5 },
      motif: [[0, 1], [2, 1], [4, 1], [6, 2], [7, 4]] /* ascent through the bright fourth */
    },
    caravan: { /* D mixolydian — wheels, ledgers, the long road */
      root: 50, scale: "mixolydian",
      drone: { type: "sawtooth", filter: 280 }, wind: { freq: 360 },
      pad: { type: "triangle" },
      pluck: { cut: 3200, fall: 500, decay: 0.7, type: "sawtooth", glide: 0 },
      bellRatio: 2.4, bellMul: 0.6, melodyMul: 1.3, tempoMult: 1.12,
      percStyle: "wheels", layerMul: { melody: 1.2 },
      motif: [[0, 1], [4, 1], [5, 1], [4, 2], [0, 2]] /* the road bounce */
    },
    archive: { /* A harmonic minor — candlelight, index cards, patience */
      root: 45, scale: "harmMinor",
      drone: { type: "sine", filter: 240 }, wind: { freq: 1100 },
      pad: { type: "sine" },
      pluck: { cut: 1900, fall: 900, decay: 1.3, type: "triangle", glide: 0 },
      bellRatio: 3.51, bellMul: 1.8, melodyMul: 0.85, tempoMult: 0.92,
      percStyle: "clock", layerMul: { bell: 1.5, wind: 0.8, perc: 0.6 },
      motif: [[7, 2], [6, 2], [4, 2], [2, 4]] /* a descending chant */
    },
    feral: { /* F locrian — dens, breath, nothing resolves */
      root: 41, scale: "locrian",
      drone: { type: "sawtooth", filter: 160 }, wind: { freq: 210 },
      pad: { type: "sawtooth" },
      pluck: { cut: 2200, fall: 200, decay: 0.9, type: "sawtooth", glide: 0.09 },
      bellRatio: 3.9, bellMul: 0.4, melodyMul: 1.0, tempoMult: 1.02,
      percStyle: "skins", layerMul: { wind: 1.2, perc: 1.1, pad: 0.8, bell: 0.4 },
      motif: [[0, 1], [3, 1], [1, 2], [0, 4]] /* a yelp, answered */
    }
  };

  var theme = "title";
  function th() { return THEMES[theme] || THEMES.title; }

  function degToMidi(deg, octave) {
    var sc = SCALES[th().scale];
    var d = ((deg % 7) + 7) % 7;
    var oct = Math.floor(deg / 7);
    return th().root + sc[d] + 12 * (oct + (octave || 0));
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
    var mul = th().layerMul;
    ["drone", "wind", "pad", "melody", "perc", "bell"].forEach(function (k) {
      if (layers[k]) {
        layers[k].gain.cancelScheduledValues(t);
        layers[k].gain.setTargetAtTime(def[k] * (mul[k] || 1), t, 2.2);
      }
    });
  }

  /* Re-voice the persistent layers for a new faction's identity. */
  var droneNodes = null, windBp = null;
  function setTheme(key) {
    if (!THEMES[key]) key = "title";
    if (theme === key) return;
    theme = key;
    if (!ctx || !droneNodes) return;
    var t = ctx.currentTime;
    var T = th();
    droneNodes.oscs.forEach(function (o) {
      if (o.kind !== "sub") o.osc.type = T.drone.type;
      o.osc.frequency.setTargetAtTime(mtof(T.root + o.off) * o.fac, t, 1.6);
    });
    droneNodes.filter.frequency.setTargetAtTime(T.drone.filter, t, 1.4);
    if (windBp) windBp.frequency.setTargetAtTime(T.wind.freq, t, 2.0);
    setMood(mood); // reapply gains with this theme's biases
  }
  function getTheme() { return theme; }

  /* Map game state -> theme + mood. Called by the UI each turn / on battles. */
  function updateMood(state) {
    if (!state) { setTheme("title"); setMood("title"); return; }
    var p = state.factions[0];
    if (!p) { setTheme("title"); setMood("title"); return; }
    setTheme(p.key);
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
    var T = th();
    /* drone: two detuned voices + sub sine through a breathing lowpass */
    var g = ctx.createGain(); g.gain.value = 0;
    var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = T.drone.filter; lp.Q.value = 1.2;
    var lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    var lfoG = ctx.createGain(); lfoG.gain.value = 90;
    lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
    droneNodes = { oscs: [], filter: lp };
    [{ kind: "a", off: -12, fac: 1, gain: 0.22 },
     { kind: "b", off: -12, fac: 1.006, gain: 0.22 },
     { kind: "sub", off: -24, fac: 1, gain: 0.5 }].forEach(function (spec) {
      var o = ctx.createOscillator();
      o.type = spec.kind === "sub" ? "sine" : T.drone.type;
      o.frequency.value = mtof(T.root + spec.off) * spec.fac;
      var og = ctx.createGain(); og.gain.value = spec.gain;
      o.connect(og); og.connect(lp); o.start();
      droneNodes.oscs.push({ osc: o, off: spec.off, fac: spec.fac, kind: spec.kind });
    });
    lp.connect(g); g.connect(musicBus);
    layers.drone = g;

    /* wind: looped brown noise through a slowly wandering bandpass */
    var wg = ctx.createGain(); wg.gain.value = 0;
    var src = ctx.createBufferSource(); src.buffer = makeNoiseBuffer(6, "brown"); src.loop = true;
    windBp = ctx.createBiquadFilter(); windBp.type = "bandpass"; windBp.frequency.value = T.wind.freq; windBp.Q.value = 0.6;
    var wlfo = ctx.createOscillator(); wlfo.frequency.value = 0.07;
    var wlfoG = ctx.createGain(); wlfoG.gain.value = 180;
    wlfo.connect(wlfoG); wlfoG.connect(windBp.frequency); wlfo.start();
    var amp = ctx.createOscillator(); amp.frequency.value = 0.043;
    var ampG = ctx.createGain(); ampG.gain.value = 0.4;
    var ampBase = ctx.createGain(); ampBase.gain.value = 1.0;
    amp.connect(ampG); amp.start();
    src.connect(windBp); windBp.connect(ampBase); ampG.connect(ampBase.gain);
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
  var lastMotifBar = -8;
  var rngLocal = null;

  function secondsPerStep() { return 60 / (MOODS[mood].bpm * th().tempoMult) / 2; } // 8th notes

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
    var T = th();

    /* pads: a slow chord swell at the top of every other bar */
    if (s8 === 0 && bar % 2 === 0) {
      var barLen = secondsPerStep() * 8;
      for (var i = 0; i < chord.length; i++) {
        padVoice(degToMidi(chord[i], 1), t, barLen * 2.2, 0.16 / chord.length + 0.02);
      }
    }

    /* the faction's signature motif, now and then, at the top of a bar */
    var motifChance = { title: 0.20, calm: 0.20, tension: 0.10, war: 0.07, doom: 0.10 }[mood] || 0.1;
    if (s8 === 0 && bar - lastMotifBar >= 6 && rngLocal() < motifChance) {
      lastMotifBar = bar;
      var when = t;
      for (i = 0; i < T.motif.length; i++) {
        pluck(degToMidi(T.motif[i][0] + 7, 0), when, 0.22);
        when += T.motif[i][1] * secondsPerStep();
      }
    }

    /* melody: probabilistic, chord-aware, sparse */
    var mel = MOODS[mood].melody * T.melodyMul;
    if (mel > 0.01 && rngLocal() < (s8 % 2 === 0 ? 0.16 : 0.07) * (mel + 0.4)) {
      var deg = chord[Math.floor(rngLocal() * chord.length)] + (rngLocal() < 0.4 ? 7 : 14);
      if (rngLocal() < 0.25) deg += rngLocal() < 0.5 ? 1 : -1; // a passing sting
      pluck(degToMidi(deg, 0), t, 0.20);
    }

    /* bells: rare, far away */
    var bellAmt = MOODS[mood].bell * T.bellMul;
    if (bellAmt > 0.01 && s8 === 0 && rngLocal() < 0.10 * bellAmt) {
      bell(degToMidi(chord[0] + 14, 0), t, 0.10);
    }

    /* percussion — each people keeps time their own way */
    schedulePerc(t, s8, bar);
  }

  function schedulePerc(t, s8, bar) {
    var perc = MOODS[mood].perc;
    var style = th().percStyle;
    var hot = mood === "war" || mood === "tension";

    switch (style) {
      case "soft": /* hearth: woody, patient */
        if (perc > 0.02 && s8 === 0 && rngLocal() < 0.5) tom(t, 0.4, 88);
        if (mood === "war" && s8 === 4) tom(t, 0.5, 72);
        break;
      case "anvil": /* legion: the forge never sleeps */
        if (hot) {
          if (s8 === 0 || (s8 === 3 && rngLocal() < 0.7) || (s8 === 6 && mood === "war")) tom(t, s8 === 0 ? 1.0 : 0.6, 100);
          if (s8 === 4) clank(t, mood === "war" ? 0.4 : 0.25);
          if (mood === "war" && s8 % 2 === 1) tick(t, 0.16); /* the column marches */
        } else if (perc > 0.02 && s8 === 0 && rngLocal() < 0.45) {
          tom(t, 0.4, 95); if (rngLocal() < 0.3) clank(t + 0.1, 0.15);
        }
        break;
      case "gong": /* choir: one vast note, rarely */
        if (s8 === 0 && bar % 4 === 0 && (perc > 0.04 || rngLocal() < 0.25)) gong(t, hot ? 0.5 : 0.3);
        if (mood === "war" && (s8 === 0 || s8 === 3)) tom(t, 0.6, 80);
        break;
      case "wheels": /* caravan: something is always rolling */
        if ((s8 === 0 || s8 === 3 || s8 === 4 || s8 === 6) && rngLocal() < 0.8)
          shaker(t, Math.max(perc, 0.18) * 0.5);
        if (hot && (s8 === 0 || (s8 === 3 && rngLocal() < 0.7))) tom(t, s8 === 0 ? 0.8 : 0.5, 96);
        break;
      case "clock": /* archive: the stacks keep their own time */
        if (s8 === 0 || s8 === 4) tick(t, 0.13);
        if (mood === "war" && (s8 === 0 || s8 === 6)) tom(t, 0.6, 84);
        break;
      case "skins": /* feral: irregular, breathing, close */
        if (perc > 0.02 && rngLocal() < perc * 0.28) {
          tom(t, 0.5 + rngLocal() * 0.4, 95 + rngLocal() * 35);
          if (rngLocal() < 0.3) tom(t + secondsPerStep() * 0.5, 0.35, 130 + rngLocal() * 40);
        }
        break;
      default: /* the open waste */
        if (perc > 0.02) {
          if (hot) {
            if (s8 === 0 || (s8 === 3 && rngLocal() < 0.7) || (s8 === 6 && mood === "war")) tom(t, s8 === 0 ? 0.9 : 0.55, 110);
            if (mood === "war" && s8 === 4) clank(t, 0.35);
            if (mood === "war" && rngLocal() < 0.12) tick(t, 0.2);
          } else if (s8 === 0 && rngLocal() < 0.35) {
            tom(t, 0.35, 110); // a slow heartbeat under calm
          }
        }
    }
  }

  /* ---------------- voices ---------------- */
  function padVoice(midi, t, dur, vol) {
    var T = th();
    var o1 = ctx.createOscillator(); o1.type = T.pad.type; o1.frequency.value = mtof(midi);
    var o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = mtof(midi) * 2.003;
    if (T.pad.vibrato) { /* the Choir's slow breath */
      var v = ctx.createOscillator(); v.frequency.value = 4.4;
      var vg = ctx.createGain(); vg.gain.value = mtof(midi) * 0.006;
      v.connect(vg); vg.connect(o1.frequency);
      v.start(t); v.stop(t + dur + 0.1);
    }
    var g = ctx.createGain();
    var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(layers.pad); g.connect(verb);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }

  function pluck(midi, t, vol) {
    var P = th().pluck;
    var o = ctx.createOscillator(); o.type = P.type;
    var f0 = mtof(midi);
    if (P.glide > 0) { /* feral howl-bend into the note */
      o.frequency.setValueAtTime(f0 * (1 + (rngLocal() < 0.5 ? P.glide : -P.glide)), t);
      o.frequency.exponentialRampToValueAtTime(f0, t + 0.13);
    } else {
      o.frequency.value = f0;
    }
    var g = ctx.createGain();
    var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 3;
    lp.frequency.setValueAtTime(P.cut, t);
    lp.frequency.exponentialRampToValueAtTime(P.fall, t + 0.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + P.decay);
    o.connect(lp); lp.connect(g); g.connect(layers.melody); g.connect(verb);
    o.start(t); o.stop(t + P.decay + 0.1);
  }

  function bell(midi, t, vol) {
    /* two-operator FM — a far-off, slightly sour chime */
    var ratio = th().bellRatio;
    var car = ctx.createOscillator(); car.frequency.value = mtof(midi);
    var modO = ctx.createOscillator(); modO.frequency.value = mtof(midi) * ratio;
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

  function tom(t, vol, pitch) {
    var p0 = pitch || 110;
    var o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(p0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, p0 * 0.35), t + 0.25);
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

  function shaker(t, vol) {
    var n = ctx.createBufferSource(); n.buffer = noiseShot();
    var g = ctx.createGain(); env(g.gain, t, 0.004, vol * 0.16, 0.07);
    var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 5200;
    n.connect(hp); hp.connect(g); g.connect(layers.perc);
    n.start(t); n.stop(t + 0.12);
  }

  function gong(t, vol) {
    /* a vast slow bloom at the root, with a sour shimmer riding it */
    var root = th().root - 24;
    [[1, 0.5], [1.51, 0.18], [2.39, 0.1]].forEach(function (part) {
      var o = ctx.createOscillator(); o.type = "sine";
      o.frequency.value = mtof(root) * part[0];
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * part[1], t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
      o.connect(g); g.connect(layers.perc); g.connect(verb);
      o.start(t); o.stop(t + 4.6);
    });
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
      tom(t, 1.0, 110); clank(t + 0.05, 0.5); tom(t + 0.22, 0.7, 95);
    } else if (kind === "war") {
      tom(t, 1.0, 110); tom(t + 0.3, 1.0, 100); clank(t + 0.6, 0.6);
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
           setTheme: setTheme, getTheme: getTheme, THEMES: THEMES, SCALES: SCALES,
           stinger: stinger, sfx: sfx, setVolumes: setVolumes, getVolumes: getVolumes,
           setMuted: setMuted, isMuted: isMuted };
})();

if (typeof module !== "undefined" && module.exports) module.exports = ASH;
