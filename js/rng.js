/* ASHFALL — rng.js
 * Deterministic randomness.
 *
 * Two flavours:
 *  - Simulation RNG: a single mulberry32 stream whose 32-bit state lives in
 *    `state.rngState`. Every gameplay roll goes through here, so a saved game
 *    replays identically and tests can assert exact outcomes.
 *  - Local RNG: `local(seed)` returns an independent closure stream for
 *    worldgen (derived sub-seeds) and for purely visual jitter that must
 *    never touch simulation state.
 */
"use strict";
var ASH = typeof ASH !== "undefined" ? ASH : {};

ASH.rng = (function () {
  function mulberryStep(s) {
    s = (s + 0x6D2B79F5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return { s: s, v: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
  }

  /* --- simulation stream (mutates state.rngState) --- */
  function next(state) {
    var r = mulberryStep(state.rngState | 0);
    state.rngState = r.s;
    return r.v;
  }
  function int(state, lo, hi) { // inclusive both ends
    return lo + Math.floor(next(state) * (hi - lo + 1));
  }
  function range(state, lo, hi) { return lo + next(state) * (hi - lo); }
  function chance(state, p) { return next(state) < p; }
  function pick(state, arr) { return arr[Math.floor(next(state) * arr.length)]; }

  /* --- independent closure stream --- */
  function local(seed) {
    var s = seed | 0;
    var f = function () {
      var r = mulberryStep(s);
      s = r.s;
      return r.v;
    };
    f.int = function (lo, hi) { return lo + Math.floor(f() * (hi - lo + 1)); };
    f.range = function (lo, hi) { return lo + f() * (hi - lo); };
    f.chance = function (p) { return f() < p; };
    f.pick = function (arr) { return arr[Math.floor(f() * arr.length)]; };
    return f;
  }

  /* Derive a child seed from a parent seed and a salt string, so adding a new
   * generation step never shifts the draws of existing ones. */
  function derive(seed, salt) {
    var h = seed | 0;
    for (var i = 0; i < salt.length; i++) {
      h = Math.imul(h ^ salt.charCodeAt(i), 0x9E3779B1);
      h = (h << 13) | (h >>> 19);
    }
    return h | 0;
  }

  /* Parse a user-supplied seed: numeric strings pass through, anything else
   * is hashed, empty means random. */
  function parseSeed(text) {
    if (text === undefined || text === null || String(text).trim() === "") {
      return (Date.now() ^ (Math.random() * 0x7fffffff)) | 0;
    }
    var t = String(text).trim();
    if (/^-?\d+$/.test(t)) return parseInt(t, 10) | 0;
    return ASH.util.hash32(t) | 0;
  }

  return { next: next, int: int, range: range, chance: chance, pick: pick,
           local: local, derive: derive, parseSeed: parseSeed };
})();

if (typeof module !== "undefined" && module.exports) module.exports = ASH;
