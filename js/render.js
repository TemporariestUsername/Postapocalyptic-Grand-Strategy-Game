/* ASHFALL — render.js
 * Everything you see is drawn here, procedurally: hex terrain with per-tile
 * texture, fog of war, faction borders and sigils, settlements, warband
 * tokens, storms, radiation shimmer, battle flashes, drifting ash, vignette
 * and film grain — plus the animated title-screen vista. No image files.
 */
"use strict";
var ASH = typeof ASH !== "undefined" ? ASH : {};

ASH.render = (function () {
  var U = ASH.util;
  var HEX = 30;
  var SQ3 = Math.sqrt(3);
  var canvas = null, ctx = null;
  var base = null, bctx = null;           // offscreen world snapshot
  var grain = null;
  var state = null;
  var dirty = true;
  var camera = { x: 0, y: 0, zoom: 1 };
  var flashes = [], floats = [], particles = [];
  var time = 0;

  /* ---------------- palettes ---------------- */
  var TERRA = {
    ash:    { base: ["#4a463f", "#514c44", "#45413b"], detail: "#5d574d", dark: "#3a3733" },
    pine:   { base: ["#2e3a2c", "#2a362a", "#333f2e"], detail: "#1d271c", dark: "#222b20" },
    ruin:   { base: ["#454a52", "#4b505a", "#41454d"], detail: "#2c2f35", dark: "#33373e" },
    fen:    { base: ["#3a4435", "#36402f", "#404a38"], detail: "#2a3326", dark: "#2c3429" },
    crag:   { base: ["#55503f", "#5c5745", "#4e4a3c"], detail: "#6d6852", dark: "#403c30" },
    glass:  { base: ["#5d6b58", "#576551", "#64725e"], detail: "#8fa37f", dark: "#46523f" },
    seabed: { base: ["#5e594b", "#665f50", "#575246"], detail: "#7d765f", dark: "#46423a" },
    water:  { base: ["#16201f", "#15211f", "#182423"], detail: "#23403a", dark: "#0e1514" }
  };
  var FOG_VEIL = "rgba(6,6,9,0.45)";
  var UNEXPLORED = "#0a0a0c";

  /* ---------------- geometry ---------------- */
  function tileCenter(i) {
    var w = state.w;
    var col = i % w, row = Math.floor(i / w);
    return {
      x: SQ3 * HEX * (col + 0.5 * (row & 1)) + HEX,
      y: 1.5 * HEX * row + HEX
    };
  }
  function worldSize() {
    return { w: SQ3 * HEX * (state.w + 0.5) + HEX, h: 1.5 * HEX * state.h + HEX };
  }
  function hexPath(c, cx, cy, r) {
    c.beginPath();
    for (var k = 0; k < 6; k++) {
      var a = Math.PI / 180 * (60 * k - 90);
      var x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.closePath();
  }
  function screenToWorld(px, py) {
    return {
      x: (px - canvas.width / 2) / camera.zoom + camera.x,
      y: (py - canvas.height / 2) / camera.zoom + camera.y
    };
  }
  function screenToTile(px, py) {
    if (!state) return -1;
    var wpt = screenToWorld(px, py);
    var row = Math.round((wpt.y - HEX) / (1.5 * HEX));
    var bestI = -1, bestD = Infinity;
    for (var r = Math.max(0, row - 1); r <= Math.min(state.h - 1, row + 1); r++) {
      for (var c = 0; c < state.w; c++) {
        var i = r * state.w + c;
        var p = tileCenter(i);
        var dx = p.x - wpt.x, dy = p.y - wpt.y;
        var d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; bestI = i; }
      }
    }
    return (bestD <= HEX * HEX * 1.05) ? bestI : -1;
  }
  function centerOn(i) {
    var p = tileCenter(i);
    camera.x = p.x; camera.y = p.y;
  }
  function clampCamera() {
    if (!state) return;
    var ws = worldSize();
    camera.zoom = U.clamp(camera.zoom, 0.4, 2.4);
    var mx = 120 / camera.zoom;
    camera.x = U.clamp(camera.x, -mx, ws.w + mx);
    camera.y = U.clamp(camera.y, -mx, ws.h + mx);
  }

  /* ---------------- base map (offscreen) ---------------- */
  function redrawBase() {
    if (!state) return;
    var ws = worldSize();
    if (!base || base.width !== Math.ceil(ws.w) || base.height !== Math.ceil(ws.h)) {
      base = document.createElement("canvas");
      base.width = Math.ceil(ws.w); base.height = Math.ceil(ws.h);
      bctx = base.getContext("2d");
    }
    var c = bctx;
    c.fillStyle = UNEXPLORED;
    c.fillRect(0, 0, base.width, base.height);

    var i, t, p;
    /* terrain */
    for (i = 0; i < state.tiles.length; i++) {
      t = state.tiles[i];
      if (!t.explored) { drawUnexplored(c, i); continue; }
      drawTerrain(c, i, t);
    }
    /* ownership tint + borders */
    for (i = 0; i < state.tiles.length; i++) {
      t = state.tiles[i];
      if (!t.explored || t.owner < 0) continue;
      p = tileCenter(i);
      var col = state.factions[t.owner].color;
      hexPath(c, p.x, p.y, HEX - 0.5);
      c.fillStyle = hexToRgba(col, 0.10);
      c.fill();
      var ns = state.adj[i];
      c.strokeStyle = hexToRgba(col, 0.85);
      c.lineWidth = 2.5;
      c.lineCap = "round";
      for (var k = 0; k < ns.length; k++) {
        if (state.tiles[ns[k]].owner === t.owner) continue;
        drawSharedEdge(c, i, ns[k]);
      }
      /* map borders count as frontier too */
      if (ns.length < 6) { /* edge of the world: skip for cleanliness */ }
    }
    /* sites + settlements on top */
    for (i = 0; i < state.tiles.length; i++) {
      t = state.tiles[i];
      if (!t.explored) continue;
      if (t.site) drawSite(c, i, t);
      if (t.settlement) drawSettlement(c, i, t);
      if (t.rad > 0 && t.terrain !== "glass") drawRadFringe(c, i, t);
    }
    /* fog veil for explored-but-unseen */
    for (i = 0; i < state.tiles.length; i++) {
      t = state.tiles[i];
      if (!t.explored || (state.visible && state.visible[i])) continue;
      p = tileCenter(i);
      hexPath(c, p.x, p.y, HEX + 0.5);
      c.fillStyle = FOG_VEIL;
      c.fill();
    }
    dirty = false;
  }

  function drawUnexplored(c, i) {
    var p = tileCenter(i);
    var rl = ASH.rng.local(state.tiles[i].variant ^ 0x9999);
    hexPath(c, p.x, p.y, HEX + 0.5);
    c.fillStyle = UNEXPLORED;
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.018)";
    c.lineWidth = 1;
    for (var k = 0; k < 3; k++) {
      var a = rl() * Math.PI;
      c.beginPath();
      c.moveTo(p.x + Math.cos(a) * HEX * 0.7, p.y + Math.sin(a) * HEX * 0.7);
      c.lineTo(p.x - Math.cos(a) * HEX * 0.7, p.y - Math.sin(a) * HEX * 0.7);
      c.stroke();
    }
  }

  function drawTerrain(c, i, t) {
    var p = tileCenter(i);
    var pal = TERRA[t.terrain];
    var rl = ASH.rng.local(t.variant);
    hexPath(c, p.x, p.y, HEX + 0.5);
    c.fillStyle = pal.base[t.variant % pal.base.length];
    c.fill();
    /* soft edge shading for depth */
    hexPath(c, p.x, p.y, HEX + 0.5);
    var g = c.createRadialGradient(p.x, p.y - HEX * 0.4, HEX * 0.2, p.x, p.y, HEX * 1.05);
    g.addColorStop(0, "rgba(255,255,255,0.04)");
    g.addColorStop(1, "rgba(0,0,0,0.16)");
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = "rgba(0,0,0,0.25)";
    c.lineWidth = 1;
    hexPath(c, p.x, p.y, HEX);
    c.stroke();

    var k, x, y, n;
    c.save();
    hexPath(c, p.x, p.y, HEX);
    c.clip();
    switch (t.terrain) {
      case "ash":
        c.fillStyle = pal.detail;
        for (k = 0; k < 9; k++) {
          x = p.x + (rl() - 0.5) * HEX * 1.6; y = p.y + (rl() - 0.5) * HEX * 1.6;
          c.globalAlpha = 0.25 + rl() * 0.3;
          c.fillRect(x, y, 1.5, 1.5);
        }
        c.globalAlpha = 0.12;
        c.strokeStyle = pal.dark;
        for (k = 0; k < 2; k++) {
          c.beginPath();
          c.moveTo(p.x - HEX, p.y + (rl() - 0.5) * HEX);
          c.bezierCurveTo(p.x - HEX / 2, p.y + (rl() - 0.5) * HEX, p.x + HEX / 2, p.y + (rl() - 0.5) * HEX, p.x + HEX, p.y + (rl() - 0.5) * HEX);
          c.stroke();
        }
        break;
      case "pine":
        for (k = 0; k < 7; k++) {
          x = p.x + (rl() - 0.5) * HEX * 1.4; y = p.y + (rl() - 0.5) * HEX * 1.4 + 3;
          var h = 5 + rl() * 5;
          c.globalAlpha = 0.8;
          c.fillStyle = pal.detail;
          c.beginPath();
          c.moveTo(x, y - h); c.lineTo(x - h * 0.42, y); c.lineTo(x + h * 0.42, y);
          c.closePath(); c.fill();
        }
        break;
      case "ruin":
        for (k = 0; k < 6; k++) {
          x = p.x + (rl() - 0.5) * HEX * 1.3; y = p.y + (rl() - 0.5) * HEX * 1.3;
          var bw = 3 + rl() * 7, bh = 3 + rl() * 9;
          c.globalAlpha = 0.85;
          c.fillStyle = rl() < 0.5 ? pal.detail : pal.dark;
          c.fillRect(x - bw / 2, y - bh, bw, bh);
          if (rl() < 0.4) { /* broken top */
            c.fillStyle = pal.base[0];
            c.fillRect(x - bw / 2, y - bh, bw * rl() * 0.7, 2);
          }
        }
        break;
      case "fen":
        for (k = 0; k < 5; k++) {
          x = p.x + (rl() - 0.5) * HEX * 1.3; y = p.y + (rl() - 0.5) * HEX * 1.3;
          c.globalAlpha = 0.5;
          c.fillStyle = "#1d2b25";
          c.beginPath();
          c.ellipse(x, y, 3.5 + rl() * 4, 2 + rl() * 2, 0, 0, Math.PI * 2);
          c.fill();
        }
        c.globalAlpha = 0.7;
        c.strokeStyle = pal.detail;
        for (k = 0; k < 6; k++) {
          x = p.x + (rl() - 0.5) * HEX * 1.4; y = p.y + (rl() - 0.5) * HEX * 1.4;
          c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rl() - 0.5) * 2, y - 4 - rl() * 3); c.stroke();
        }
        break;
      case "crag":
        c.strokeStyle = pal.detail;
        c.lineWidth = 1.5;
        for (k = 0; k < 4; k++) {
          x = p.x + (rl() - 0.5) * HEX; y = p.y + (rl() - 0.5) * HEX;
          c.globalAlpha = 0.7;
          c.beginPath();
          c.moveTo(x - 6, y + 4); c.lineTo(x, y - 5 - rl() * 4); c.lineTo(x + 6, y + 4);
          c.stroke();
          c.globalAlpha = 0.35;
          c.strokeStyle = pal.dark;
          c.beginPath(); c.moveTo(x, y - 5); c.lineTo(x + 3, y + 4); c.stroke();
          c.strokeStyle = pal.detail;
        }
        break;
      case "glass":
        c.globalAlpha = 0.5;
        c.strokeStyle = pal.detail;
        for (k = 0; k < 6; k++) {
          x = p.x + (rl() - 0.5) * HEX * 1.4; y = p.y + (rl() - 0.5) * HEX * 1.4;
          var a2 = rl() * Math.PI;
          c.beginPath();
          c.moveTo(x - Math.cos(a2) * 6, y - Math.sin(a2) * 6);
          c.lineTo(x + Math.cos(a2) * 6, y + Math.sin(a2) * 6);
          c.stroke();
        }
        c.globalAlpha = 0.5;
        c.fillStyle = "#b9d8a0";
        for (k = 0; k < 3; k++) {
          c.globalAlpha = 0.25 + rl() * 0.3;
          c.beginPath();
          c.arc(p.x + (rl() - 0.5) * HEX, p.y + (rl() - 0.5) * HEX, 1.2, 0, Math.PI * 2);
          c.fill();
        }
        break;
      case "seabed":
        c.globalAlpha = 0.4;
        c.strokeStyle = pal.dark;
        for (k = 0; k < 4; k++) {
          x = p.x + (rl() - 0.5) * HEX * 1.2; y = p.y + (rl() - 0.5) * HEX * 1.2;
          c.beginPath();
          c.moveTo(x, y);
          for (var s = 0; s < 3; s++) c.lineTo(x += (rl() - 0.5) * 10, y += (rl() - 0.3) * 6);
          c.stroke();
        }
        c.globalAlpha = 0.5;
        c.fillStyle = pal.detail;
        for (k = 0; k < 4; k++) c.fillRect(p.x + (rl() - 0.5) * HEX * 1.3, p.y + (rl() - 0.5) * HEX * 1.3, 2, 1);
        break;
      case "water":
        c.globalAlpha = 0.5;
        c.strokeStyle = pal.detail;
        c.lineWidth = 1;
        for (k = 0; k < 3; k++) {
          y = p.y + (k - 1) * 8 + rl() * 4;
          c.beginPath();
          c.moveTo(p.x - 12, y);
          c.quadraticCurveTo(p.x - 4, y - 2, p.x + 2, y);
          c.quadraticCurveTo(p.x + 8, y + 2, p.x + 13, y);
          c.stroke();
        }
        break;
    }
    c.restore();
    c.globalAlpha = 1;
  }

  function drawSharedEdge(c, i, j) {
    var a = tileCenter(i), b = tileCenter(j);
    var ang = Math.atan2(b.y - a.y, b.x - a.x);
    var v1 = ang - Math.PI / 6, v2 = ang + Math.PI / 6;
    c.beginPath();
    c.moveTo(a.x + Math.cos(v1) * (HEX - 1), a.y + Math.sin(v1) * (HEX - 1));
    c.lineTo(a.x + Math.cos(v2) * (HEX - 1), a.y + Math.sin(v2) * (HEX - 1));
    c.stroke();
  }

  function drawRadFringe(c, i, t) {
    var p = tileCenter(i);
    c.save();
    c.globalAlpha = 0.18 * t.rad;
    c.strokeStyle = "#a8d77f";
    c.lineWidth = 1;
    hexPath(c, p.x, p.y, HEX * 0.55);
    c.stroke();
    c.restore();
  }

  function drawSite(c, i, t) {
    var p = tileCenter(i);
    c.save();
    c.translate(p.x, p.y);
    c.lineWidth = 1.6;
    if (t.site === "vault") {
      c.strokeStyle = "#c9b87a";
      c.fillStyle = "rgba(30,28,20,0.8)";
      c.beginPath(); c.arc(0, 0, 7, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.arc(0, 0, 3, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(0, -7); c.lineTo(0, -3); c.stroke();
    } else if (t.site === "cache") {
      c.strokeStyle = "#b3a06a";
      c.fillStyle = "rgba(30,28,20,0.7)";
      c.fillRect(-5, -4, 10, 8); c.strokeRect(-5, -4, 10, 8);
      c.beginPath(); c.moveTo(-5, 0); c.lineTo(5, 0); c.stroke();
    } else if (t.site === "reactor") {
      c.strokeStyle = "#9fd0c9";
      c.fillStyle = "rgba(20,28,28,0.85)";
      c.beginPath();
      c.moveTo(-6, 6); c.bezierCurveTo(-8, -2, -3, -2, -3, -8);
      c.lineTo(3, -8); c.bezierCurveTo(3, -2, 8, -2, 6, 6);
      c.closePath(); c.fill(); c.stroke();
    } else if (t.site === "beacon") {
      c.strokeStyle = "#e8d9a0";
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(-7, 9); c.lineTo(0, -11); c.lineTo(7, 9); c.stroke();
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(-4.6, 3); c.lineTo(4.6, 3); c.stroke();
      c.beginPath(); c.moveTo(-2.6, -3); c.lineTo(2.6, -3); c.stroke();
    }
    c.restore();
  }

  function drawSettlement(c, i, t) {
    var p = tileCenter(i);
    var f = state.factions[t.owner];
    var s = t.settlement;
    var rl = ASH.rng.local(t.variant ^ 0x51e77);
    c.save();
    c.translate(p.x, p.y);
    /* huts */
    var n = Math.min(7, 3 + Math.floor(s.pop / 4));
    for (var k = 0; k < n; k++) {
      var a = (k / n) * Math.PI * 2 + rl();
      var d = 4 + rl() * 7;
      var x = Math.cos(a) * d, y = Math.sin(a) * d * 0.7;
      c.fillStyle = k % 2 ? "#6b5f4c" : "#7a6c55";
      c.fillRect(x - 2.5, y - 2.5, 5, 4);
      c.fillStyle = "#3a332a";
      c.beginPath(); c.moveTo(x - 3, y - 2.5); c.lineTo(x, y - 5.5); c.lineTo(x + 3, y - 2.5); c.closePath(); c.fill();
    }
    /* walls ring */
    if (s.buildings.indexOf("walls") !== -1) {
      c.strokeStyle = "#8a7d60";
      c.lineWidth = 2;
      hexPath(c, 0, 0, 14);
      c.stroke();
    }
    /* capital sigil banner */
    if (s.isCapital) {
      c.fillStyle = f.color;
      c.fillRect(-1, -22, 2, 12);
      drawSigil(c, f.key, 6, -18, 5.5, f.color);
    }
    c.restore();
    /* name */
    c.font = "9px monospace";
    c.textAlign = "center";
    c.fillStyle = "rgba(0,0,0,0.6)";
    c.fillText(s.name, p.x + 1, p.y + HEX * 0.78 + 1);
    c.fillStyle = hexToRgba(f.color, 0.95);
    c.fillText(s.name, p.x, p.y + HEX * 0.78);
  }

  /* ---------------- faction sigils ---------------- */
  function drawSigil(c, key, x, y, r, color) {
    c.save();
    c.translate(x, y);
    c.strokeStyle = color; c.fillStyle = color;
    c.lineWidth = Math.max(1, r * 0.22);
    c.lineCap = "round";
    c.beginPath(); c.arc(0, 0, r + c.lineWidth, 0, Math.PI * 2);
    c.fillStyle = "rgba(10,10,12,0.85)"; c.fill();
    c.fillStyle = color;
    switch (key) {
      case "hearth": /* hearth-flame in a ring */
        c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
        c.beginPath();
        c.moveTo(0, r * 0.5);
        c.bezierCurveTo(-r * 0.6, 0, -r * 0.2, -r * 0.3, 0, -r * 0.65);
        c.bezierCurveTo(r * 0.2, -r * 0.3, r * 0.6, 0, 0, r * 0.5);
        c.fill();
        break;
      case "legion": /* crossed blades */
        c.beginPath();
        c.moveTo(-r * 0.8, -r * 0.8); c.lineTo(r * 0.8, r * 0.8);
        c.moveTo(r * 0.8, -r * 0.8); c.lineTo(-r * 0.8, r * 0.8);
        c.stroke();
        c.beginPath(); c.arc(0, 0, r * 0.35, 0, Math.PI * 2); c.fill();
        break;
      case "choir": /* rayed sun */
        c.beginPath(); c.arc(0, 0, r * 0.4, 0, Math.PI * 2); c.fill();
        for (var k = 0; k < 7; k++) {
          var a = k / 7 * Math.PI * 2 - Math.PI / 2;
          c.beginPath();
          c.moveTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
          c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          c.stroke();
        }
        break;
      case "caravan": /* spoked wheel */
        c.beginPath(); c.arc(0, 0, r * 0.9, 0, Math.PI * 2); c.stroke();
        for (k = 0; k < 4; k++) {
          a = k / 4 * Math.PI;
          c.beginPath();
          c.moveTo(-Math.cos(a) * r * 0.9, -Math.sin(a) * r * 0.9);
          c.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
          c.stroke();
        }
        break;
      case "archive": /* open book */
        c.beginPath();
        c.moveTo(0, -r * 0.5); c.lineTo(0, r * 0.7);
        c.moveTo(0, -r * 0.5); c.quadraticCurveTo(-r * 0.9, -r * 0.8, -r * 0.9, -r * 0.1);
        c.lineTo(-r * 0.9, r * 0.45); c.quadraticCurveTo(-r * 0.45, r * 0.25, 0, r * 0.7);
        c.moveTo(0, -r * 0.5); c.quadraticCurveTo(r * 0.9, -r * 0.8, r * 0.9, -r * 0.1);
        c.lineTo(r * 0.9, r * 0.45); c.quadraticCurveTo(r * 0.45, r * 0.25, 0, r * 0.7);
        c.stroke();
        break;
      case "feral": /* three claw rakes */
        for (k = -1; k <= 1; k++) {
          c.beginPath();
          c.moveTo(k * r * 0.5 - r * 0.25, -r * 0.8);
          c.quadraticCurveTo(k * r * 0.5 + r * 0.3, 0, k * r * 0.5 - r * 0.15, r * 0.8);
          c.stroke();
        }
        break;
      default:
        c.beginPath(); c.arc(0, 0, r * 0.5, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  /* ---------------- dynamic layer ---------------- */
  function drawUnits(c, ui) {
    var drawn = {};
    for (var i = 0; i < state.tiles.length; i++) {
      var t = state.tiles[i];
      if (!t.units.length) continue;
      if (state.visible && !state.visible[i]) continue;
      var p = tileCenter(i);
      var shown = Math.min(t.units.length, 3);
      for (var k = 0; k < shown; k++) {
        var u = state.units[t.units[k]];
        if (!u) continue;
        var ox = (k - (shown - 1) / 2) * 11;
        drawToken(c, u, p.x + ox, p.y - 4, ui);
      }
      if (t.units.length > 3) {
        c.font = "bold 9px monospace";
        c.fillStyle = "#ddd";
        c.textAlign = "center";
        c.fillText("+" + (t.units.length - 3), p.x + 19, p.y - 14);
      }
    }
    return drawn;
  }

  function drawToken(c, u, x, y, ui) {
    var f = state.factions[u.f];
    var sel = ui && ui.selectedUnits && ui.selectedUnits.indexOf(u.id) !== -1;
    c.save();
    c.translate(x, y);
    /* banner-shield */
    c.beginPath();
    c.moveTo(-6, -7); c.lineTo(6, -7); c.lineTo(6, 3); c.lineTo(0, 8); c.lineTo(-6, 3);
    c.closePath();
    c.fillStyle = sel ? lighten(f.color, 0.25) : f.color;
    c.fill();
    c.lineWidth = sel ? 2 : 1;
    c.strokeStyle = sel ? "#fff" : "rgba(0,0,0,0.7)";
    c.stroke();
    c.fillStyle = "rgba(0,0,0,0.75)";
    c.font = "bold 8px monospace";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(ASH.data.UNITS[u.type].glyph, 0, -1);
    /* hp pip bar */
    c.fillStyle = "rgba(0,0,0,0.55)";
    c.fillRect(-6, 9, 12, 2);
    c.fillStyle = u.hp > 60 ? "#7dc26a" : (u.hp > 30 ? "#d8b13c" : "#c25a4a");
    c.fillRect(-6, 9, 12 * (u.hp / 100), 2);
    /* can-still-act dot */
    if (u.f === 0 && u.moves > 0) {
      c.fillStyle = "#fff";
      c.beginPath(); c.arc(7, -8, 1.8, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  function drawHighlights(c, ui) {
    var k;
    if (ui.reach) {
      c.save();
      for (k in ui.reach) {
        var p = tileCenter(parseInt(k, 10));
        hexPath(c, p.x, p.y, HEX - 3);
        c.fillStyle = "rgba(214,196,150,0.12)";
        c.fill();
        c.strokeStyle = "rgba(214,196,150,0.35)";
        c.lineWidth = 1;
        c.stroke();
      }
      c.restore();
    }
    if (ui.attackable) {
      for (k = 0; k < ui.attackable.length; k++) {
        var p2 = tileCenter(ui.attackable[k]);
        hexPath(c, p2.x, p2.y, HEX - 3);
        c.strokeStyle = "rgba(214,84,58," + (0.55 + 0.3 * Math.sin(time * 5)) + ")";
        c.lineWidth = 2.5;
        c.stroke();
      }
    }
    if (ui.selectedTile >= 0) {
      var p3 = tileCenter(ui.selectedTile);
      hexPath(c, p3.x, p3.y, HEX - 1.5);
      c.strokeStyle = "rgba(232,217,160," + (0.7 + 0.3 * Math.sin(time * 4)) + ")";
      c.lineWidth = 2;
      c.stroke();
    }
    if (ui.hoverTile >= 0 && ui.hoverTile !== ui.selectedTile) {
      var p4 = tileCenter(ui.hoverTile);
      hexPath(c, p4.x, p4.y, HEX - 1.5);
      c.strokeStyle = "rgba(255,255,255,0.25)";
      c.lineWidth = 1.5;
      c.stroke();
    }
  }

  function drawStorms(c) {
    for (var s = 0; s < state.storms.length; s++) {
      var st = state.storms[s];
      if (state.visible && !state.visible[st.tile]) continue;
      var center = tileCenter(st.tile);
      var R = (st.r + 0.7) * HEX * 1.8;
      for (var k = 0; k < 5; k++) {
        var a = time * 0.35 + k * Math.PI * 2 / 5;
        var x = center.x + Math.cos(a) * R * 0.35;
        var y = center.y + Math.sin(a) * R * 0.3;
        var g = c.createRadialGradient(x, y, 2, x, y, R * 0.75);
        g.addColorStop(0, "rgba(94,80,60,0.34)");
        g.addColorStop(1, "rgba(94,80,60,0)");
        c.fillStyle = g;
        c.beginPath(); c.arc(x, y, R * 0.75, 0, Math.PI * 2); c.fill();
      }
      /* wind streaks */
      c.save();
      c.strokeStyle = "rgba(160,140,110,0.25)";
      c.lineWidth = 1;
      var rl = ASH.rng.local((st.tile * 31 + ((time * 6) | 0)) | 0);
      for (k = 0; k < 7; k++) {
        var sx = center.x + (rl() - 0.5) * R * 1.6;
        var sy = center.y + (rl() - 0.5) * R * 1.4;
        c.beginPath();
        c.moveTo(sx, sy);
        c.lineTo(sx + 14, sy + 3);
        c.stroke();
      }
      c.restore();
    }
  }

  function drawGlassShimmer(c, vis) {
    for (var k = 0; k < vis.length; k++) {
      var i = vis[k];
      var t = state.tiles[i];
      if (t.terrain !== "glass" || !t.explored) continue;
      if (state.visible && !state.visible[i]) continue;
      var p = tileCenter(i);
      var a = 0.05 + 0.05 * Math.sin(time * 1.4 + (t.variant % 17));
      hexPath(c, p.x, p.y, HEX - 2);
      c.fillStyle = "rgba(173,219,138," + a.toFixed(3) + ")";
      c.fill();
    }
  }

  function drawBeaconPulse(c) {
    var b = state.beacon;
    if (b.tile < 0 || !state.tiles[b.tile].explored) return;
    var p = tileCenter(b.tile);
    var phase = (time % 2.4) / 2.4;
    c.strokeStyle = "rgba(232,217,160," + (0.5 * (1 - phase)).toFixed(3) + ")";
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(p.x, p.y - 8, 4 + phase * 22, 0, Math.PI * 2);
    c.stroke();
    if (b.faction >= 0) {
      c.fillStyle = "rgba(232,217,160,0.9)";
      c.font = "bold 9px monospace";
      c.textAlign = "center";
      c.fillText("KINDLING " + b.progress + "/" + ASH.data.BEACON.turns, p.x, p.y + HEX);
    }
  }

  /* battle flashes & floating text */
  function addFlash(tileIdx) { flashes.push({ i: tileIdx, t0: time }); }
  function addFloat(tileIdx, text, color) {
    floats.push({ i: tileIdx, text: text, color: color || "#e8d9a0", t0: time });
  }
  function drawFx(c) {
    for (var k = flashes.length - 1; k >= 0; k--) {
      var fl = flashes[k];
      var dt = time - fl.t0;
      if (dt > 0.7) { flashes.splice(k, 1); continue; }
      var p = tileCenter(fl.i);
      var prog = dt / 0.7;
      c.strokeStyle = "rgba(255,180,90," + (0.8 * (1 - prog)).toFixed(3) + ")";
      c.lineWidth = 3 * (1 - prog) + 1;
      c.beginPath();
      c.arc(p.x, p.y, 6 + prog * HEX * 1.1, 0, Math.PI * 2);
      c.stroke();
      if (dt < 0.18) {
        c.fillStyle = "rgba(255,230,170," + (0.55 * (1 - dt / 0.18)).toFixed(3) + ")";
        hexPath(c, p.x, p.y, HEX * 0.8);
        c.fill();
      }
    }
    c.font = "bold 11px monospace";
    c.textAlign = "center";
    for (k = floats.length - 1; k >= 0; k--) {
      var fo = floats[k];
      var d2 = time - fo.t0;
      if (d2 > 1.5) { floats.splice(k, 1); continue; }
      var p2 = tileCenter(fo.i);
      var alpha = d2 < 1.1 ? 1 : (1.5 - d2) / 0.4;
      c.fillStyle = hexToRgba(fo.color, alpha);
      c.fillText(fo.text, p2.x, p2.y - 14 - d2 * 16);
    }
  }

  /* ash particles — screen space */
  function ensureParticles() {
    if (particles.length) return;
    for (var k = 0; k < 110; k++) {
      particles.push({
        x: Math.random(), y: Math.random(),
        vx: 0.012 + Math.random() * 0.025, vy: 0.004 + Math.random() * 0.012,
        r: 0.6 + Math.random() * 1.4, a: 0.05 + Math.random() * 0.16,
        w: Math.random() * Math.PI * 2
      });
    }
  }
  function drawAsh(c, dt, wcanvas) {
    ensureParticles();
    var W = wcanvas.width, H = wcanvas.height;
    for (var k = 0; k < particles.length; k++) {
      var pa = particles[k];
      pa.w += dt * 0.7;
      pa.x += (pa.vx + Math.sin(pa.w) * 0.006) * dt;
      pa.y += pa.vy * dt;
      if (pa.x > 1.02) pa.x = -0.02;
      if (pa.y > 1.02) pa.y = -0.02;
      c.fillStyle = "rgba(200,190,170," + pa.a.toFixed(3) + ")";
      c.beginPath();
      c.arc(pa.x * W, pa.y * H, pa.r, 0, Math.PI * 2);
      c.fill();
    }
  }

  /* vignette + grain */
  function ensureGrain() {
    if (grain) return;
    grain = document.createElement("canvas");
    grain.width = 256; grain.height = 256;
    var g = grain.getContext("2d");
    var img = g.createImageData(256, 256);
    for (var k = 0; k < img.data.length; k += 4) {
      var v = (Math.random() * 255) | 0;
      img.data[k] = v; img.data[k + 1] = v; img.data[k + 2] = v;
      img.data[k + 3] = 14;
    }
    g.putImageData(img, 0, 0);
  }
  var grainOn = true;
  function drawPost(c) {
    var W = canvas.width, H = canvas.height;
    var g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.42)");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    if (grainOn) {
      ensureGrain();
      var ox = (Math.random() * 256) | 0, oy = (Math.random() * 256) | 0;
      c.save();
      c.globalAlpha = 0.5;
      for (var x = -ox; x < W; x += 256)
        for (var y = -oy; y < H; y += 256)
          c.drawImage(grain, x, y);
      c.restore();
    }
  }

  /* ---------------- frame ---------------- */
  function visibleTileIndices() {
    var out = [];
    var tl = screenToWorld(0, 0), br = screenToWorld(canvas.width, canvas.height);
    for (var i = 0; i < state.tiles.length; i++) {
      var p = tileCenter(i);
      if (p.x > tl.x - HEX * 2 && p.x < br.x + HEX * 2 && p.y > tl.y - HEX * 2 && p.y < br.y + HEX * 2)
        out.push(i);
    }
    return out;
  }

  function frame(dt, ui) {
    if (!ctx || !state) return;
    time += dt;
    if (dirty) redrawBase();
    clampCamera();
    var c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#050507";
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.save();
    c.translate(canvas.width / 2, canvas.height / 2);
    c.scale(camera.zoom, camera.zoom);
    c.translate(-camera.x, -camera.y);
    c.drawImage(base, 0, 0);
    var vis = visibleTileIndices();
    drawGlassShimmer(c, vis);
    drawHighlights(c, ui || {});
    drawUnits(c, ui || {});
    drawStorms(c);
    drawBeaconPulse(c);
    drawFx(c);
    c.restore();
    drawAsh(c, dt, canvas);
    drawPost(c);
  }

  /* ---------------- minimap ---------------- */
  function drawMinimap(mcanvas) {
    if (!state) return;
    var c = mcanvas.getContext("2d");
    var W = mcanvas.width, H = mcanvas.height;
    var ws = worldSize();
    var sx = W / ws.w, sy = H / ws.h;
    c.fillStyle = "#0a0a0c";
    c.fillRect(0, 0, W, H);
    for (var i = 0; i < state.tiles.length; i++) {
      var t = state.tiles[i];
      if (!t.explored) continue;
      var p = tileCenter(i);
      var col;
      if (t.owner >= 0) col = state.factions[t.owner].color;
      else col = TERRA[t.terrain].base[0];
      c.fillStyle = col;
      c.globalAlpha = t.owner >= 0 ? 0.95 : 0.55;
      c.fillRect(p.x * sx - 1.6, p.y * sy - 1.6, 3.2, 3.2);
      if (t.settlement) {
        c.globalAlpha = 1;
        c.fillStyle = "#fff";
        c.fillRect(p.x * sx - 0.8, p.y * sy - 0.8, 1.6, 1.6);
      }
    }
    c.globalAlpha = 1;
    /* viewport */
    var tl = screenToWorld(0, 0), br = screenToWorld(canvas.width, canvas.height);
    c.strokeStyle = "rgba(232,217,160,0.8)";
    c.lineWidth = 1;
    c.strokeRect(tl.x * sx, tl.y * sy, (br.x - tl.x) * sx, (br.y - tl.y) * sy);
  }
  function minimapToWorld(mcanvas, mx, my) {
    var ws = worldSize();
    return { x: mx / mcanvas.width * ws.w, y: my / mcanvas.height * ws.h };
  }

  /* ---------------- title vista ---------------- */
  var titleP = [];
  function drawTitle(tcanvas, t) {
    var c = tcanvas.getContext("2d");
    var W = tcanvas.width, H = tcanvas.height;
    /* sky */
    var sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#070608");
    sky.addColorStop(0.45, "#1c1212");
    sky.addColorStop(0.72, "#3d2317");
    sky.addColorStop(1, "#0c0907");
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    /* dying sun */
    var sunX = W * 0.62, sunY = H * 0.66;
    var sg = c.createRadialGradient(sunX, sunY, 4, sunX, sunY, H * 0.3);
    sg.addColorStop(0, "rgba(255,160,90,0.55)");
    sg.addColorStop(0.25, "rgba(220,110,60,0.18)");
    sg.addColorStop(1, "rgba(220,110,60,0)");
    c.fillStyle = sg;
    c.fillRect(0, 0, W, H);
    c.fillStyle = "rgba(255,190,130,0.7)";
    c.beginPath(); c.arc(sunX, sunY, H * 0.045, 0, Math.PI * 2); c.fill();
    c.fillStyle = "rgba(20,12,8,0.55)"; /* haze bands over the sun */
    c.fillRect(0, sunY - H * 0.02, W, H * 0.012);
    c.fillRect(0, sunY + H * 0.015, W, H * 0.018);

    /* skyline layers */
    skyline(c, W, H, 0.74, "#100d0d", 977, 1.15);
    skyline(c, W, H, 0.80, "#0b0909", 1311, 1.6);
    skyline(c, W, H, 0.88, "#070606", 2017, 2.2);

    /* the beacon on the horizon, blinking */
    var bx = W * 0.18, byTop = H * 0.36;
    c.strokeStyle = "#161111";
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(bx - 14, H * 0.8); c.lineTo(bx, byTop); c.lineTo(bx + 14, H * 0.8); c.stroke();
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(bx - 8, H * 0.62); c.lineTo(bx + 8, H * 0.62); c.stroke();
    var blink = (Math.sin(t * 2.1) > 0.93) ? 0.9 : 0.12;
    c.fillStyle = "rgba(255,90,70," + blink + ")";
    c.beginPath(); c.arc(bx, byTop, 2.5, 0, Math.PI * 2); c.fill();

    /* ground */
    var gg = c.createLinearGradient(0, H * 0.82, 0, H);
    gg.addColorStop(0, "#171310");
    gg.addColorStop(1, "#060505");
    c.fillStyle = gg;
    c.fillRect(0, H * 0.82, W, H * 0.18);

    /* drifting ash */
    if (!titleP.length)
      for (var k = 0; k < 90; k++)
        titleP.push({ x: Math.random(), y: Math.random(), v: 0.01 + Math.random() * 0.03, r: 0.5 + Math.random() * 1.6, a: 0.04 + Math.random() * 0.14, w: Math.random() * 7 });
    for (k = 0; k < titleP.length; k++) {
      var pa = titleP[k];
      pa.x += pa.v * 0.016; pa.w += 0.016;
      pa.y += Math.sin(pa.w) * 0.0006 + 0.0014;
      if (pa.x > 1.02) pa.x = -0.02;
      if (pa.y > 1.02) pa.y = -0.02;
      c.fillStyle = "rgba(210,190,170," + pa.a + ")";
      c.beginPath(); c.arc(pa.x * W, pa.y * H, pa.r, 0, Math.PI * 2); c.fill();
    }
    /* vignette */
    var vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);
  }

  function skyline(c, W, H, baseY, color, seed, scale) {
    var rl = ASH.rng.local(seed);
    c.fillStyle = color;
    var x = -20;
    while (x < W + 20) {
      var bw = (14 + rl() * 46) * scale;
      var bh = (20 + rl() * 95) * scale;
      var by = H * baseY - bh;
      c.fillRect(x, by, bw, bh + H * (1 - baseY));
      /* broken crown */
      if (rl() < 0.6) {
        c.beginPath();
        c.moveTo(x, by);
        c.lineTo(x + bw * rl(), by - 6 * scale - rl() * 10 * scale);
        c.lineTo(x + bw, by);
        c.closePath();
        c.fill();
      }
      /* antenna */
      if (rl() < 0.28) {
        c.fillRect(x + bw * 0.5, by - 18 * scale, 1.2, 18 * scale);
      }
      /* a few dead windows, one lit */
      if (rl() < 0.18) {
        c.save();
        c.fillStyle = "rgba(255,170,90," + (0.25 + rl() * 0.4) + ")";
        c.fillRect(x + 3 + rl() * (bw - 6), by + 6 + rl() * (bh * 0.7), 1.6, 2.2);
        c.restore();
        c.fillStyle = color;
      }
      x += bw + 2 + rl() * 14 * scale;
    }
  }

  /* ---------------- utils ---------------- */
  function hexToRgba(hex, a) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function lighten(hex, amt) {
    var h = hex.replace("#", "");
    var n = parseInt(h, 16);
    var r = Math.min(255, ((n >> 16) & 255) + 255 * amt) | 0;
    var g = Math.min(255, ((n >> 8) & 255) + 255 * amt) | 0;
    var b = Math.min(255, (n & 255) + 255 * amt) | 0;
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function init(cv) {
    canvas = cv;
    ctx = canvas.getContext("2d");
  }
  function setState(s) {
    state = s;
    dirty = true;
    flashes = []; floats = [];
  }
  function markDirty() { dirty = true; }
  function setGrain(on) { grainOn = on; }

  return {
    init: init, setState: setState, markDirty: markDirty, frame: frame,
    camera: camera, centerOn: centerOn, screenToTile: screenToTile,
    tileCenter: function (i) { return tileCenter(i); },
    addFlash: addFlash, addFloat: addFloat,
    drawMinimap: drawMinimap, minimapToWorld: minimapToWorld,
    drawTitle: drawTitle, drawSigil: drawSigil, setGrain: setGrain,
    hexToRgba: hexToRgba, HEX: HEX
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = ASH;
