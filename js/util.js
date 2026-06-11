/* ASHFALL — util.js
 * Small shared helpers. No DOM, no state. Safe in browser and Node.
 */
"use strict";
var ASH = typeof ASH !== "undefined" ? ASH : {};

ASH.util = (function () {
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* Round to 1 decimal for display of fractional resources. */
  function fmt1(v) {
    var r = Math.round(v * 10) / 10;
    return (r % 1 === 0) ? String(r) : r.toFixed(1);
  }

  function signed(v) {
    var r = Math.round(v * 10) / 10;
    return (r >= 0 ? "+" : "") + fmt1(r);
  }

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  /* Stable insertion-order object iteration helper. */
  function each(obj, fn) {
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) fn(obj[k], k);
  }

  function sum(arr, fn) {
    var t = 0;
    for (var i = 0; i < arr.length; i++) t += fn ? fn(arr[i]) : arr[i];
    return t;
  }

  /* Pick the element with the highest score; ties go to the earliest. */
  function best(arr, score) {
    var b = null, bs = -Infinity;
    for (var i = 0; i < arr.length; i++) {
      var s = score(arr[i]);
      if (s > bs) { bs = s; b = arr[i]; }
    }
    return b;
  }

  function shuffleInPlace(arr, rand) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* Tiny mustache: subst("{a} of {b}", {a:1,b:2}) -> "1 of 2" */
  function subst(tpl, vars) {
    return tpl.replace(/\{(\w+)\}/g, function (m, k) {
      return (vars && vars[k] !== undefined) ? String(vars[k]) : m;
    });
  }

  /* 32-bit FNV-1a string hash — used to give tiles stable visual variants. */
  function hash32(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  return {
    clamp: clamp, lerp: lerp, fmt1: fmt1, signed: signed,
    deepClone: deepClone, each: each, sum: sum, best: best,
    shuffleInPlace: shuffleInPlace, subst: subst, hash32: hash32
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = ASH;
