/* ASHFALL — worldgen.js
 * seed -> world. Hex grid (pointy-top, odd-r offset), value-noise terrain,
 * blast craters, dead cities, sites, faction placement, initial state.
 * Fully deterministic: every sub-step draws from its own derived stream.
 */
"use strict";
var ASH = typeof ASH !== "undefined" ? ASH : {};

ASH.worldgen = (function () {
  var U = ASH.util, R = ASH.rng, D = ASH.data, N = ASH.names;

  /* ---------------- hex math (odd-r offset, pointy-top) ---------------- */
  var NEIGH_EVEN = [[1, 0], [-1, 0], [0, -1], [-1, -1], [0, 1], [-1, 1]];
  var NEIGH_ODD  = [[1, 0], [-1, 0], [1, -1], [0, -1], [1, 1], [0, 1]];

  function neighborsOf(col, row, w, h) {
    var offs = (row % 2 === 0) ? NEIGH_EVEN : NEIGH_ODD;
    var out = [];
    for (var k = 0; k < 6; k++) {
      var c = col + offs[k][0], r = row + offs[k][1];
      if (c >= 0 && c < w && r >= 0 && r < h) out.push(r * w + c);
    }
    return out;
  }

  function toCube(col, row) {
    var x = col - ((row - (row & 1)) / 2);
    var z = row;
    return { x: x, y: -x - z, z: z };
  }

  function hexDist(c1, r1, c2, r2) {
    var a = toCube(c1, r1), b = toCube(c2, r2);
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
  }

  function distT(state, i, j) {
    var w = state.w;
    return hexDist(i % w, Math.floor(i / w), j % w, Math.floor(j / w));
  }

  /* Build adjacency table for the whole grid. */
  function buildAdj(w, h) {
    var adj = new Array(w * h);
    for (var r = 0; r < h; r++)
      for (var c = 0; c < w; c++)
        adj[r * w + c] = neighborsOf(c, r, w, h);
    return adj;
  }

  /* ---------------- value noise ---------------- */
  function makeNoise(rand, w, h, scale) {
    var gw = Math.ceil(w / scale) + 2, gh = Math.ceil(h / scale) + 2;
    var grid = [];
    for (var i = 0; i < gw * gh; i++) grid.push(rand());
    function smooth(t) { return t * t * (3 - 2 * t); }
    return function (x, y) {
      var gx = x / scale, gy = y / scale;
      var x0 = Math.floor(gx), y0 = Math.floor(gy);
      var tx = smooth(gx - x0), ty = smooth(gy - y0);
      var a = grid[y0 * gw + x0], b = grid[y0 * gw + x0 + 1];
      var c = grid[(y0 + 1) * gw + x0], d = grid[(y0 + 1) * gw + x0 + 1];
      return U.lerp(U.lerp(a, b, tx), U.lerp(c, d, tx), ty);
    };
  }

  function fbm(rand, w, h, scale, octaves) {
    var layers = [], amp = 1, sc = scale, total = 0;
    for (var o = 0; o < octaves; o++) {
      layers.push({ n: makeNoise(rand, w, h, Math.max(2, sc)), amp: amp });
      total += amp; amp *= 0.5; sc /= 2;
    }
    return function (x, y) {
      var v = 0;
      for (var i = 0; i < layers.length; i++) v += layers[i].n(x, y) * layers[i].amp;
      return v / total;
    };
  }

  function quantile(sortedVals, q) {
    return sortedVals[Math.min(sortedVals.length - 1, Math.floor(q * sortedVals.length))];
  }

  /* ---------------- terrain ---------------- */
  function genTerrain(seed, w, h) {
    var elevR = R.local(R.derive(seed, "elev"));
    var moisR = R.local(R.derive(seed, "moist"));
    var featR = R.local(R.derive(seed, "features"));

    var elevN = fbm(elevR, w, h, 9, 4);
    var moisN = fbm(moisR, w, h, 7, 3);

    var n = w * h;
    var elev = new Array(n), mois = new Array(n);
    for (var i = 0; i < n; i++) {
      var c = i % w, r = Math.floor(i / w);
      elev[i] = elevN(c + (r % 2) * 0.5, r * 0.86);
      mois[i] = moisN(c + (r % 2) * 0.5, r * 0.86);
    }
    var se = elev.slice().sort(function (a, b) { return a - b; });
    var sm = mois.slice().sort(function (a, b) { return a - b; });
    var waterT = quantile(se, 0.06), seabedT = quantile(se, 0.14), cragT = quantile(se, 0.90);
    var fenT = quantile(sm, 0.84), pineT = quantile(sm, 0.60);

    var terrain = new Array(n), rad = new Array(n);
    for (i = 0; i < n; i++) {
      rad[i] = 0;
      if (elev[i] < waterT) terrain[i] = "water";
      else if (elev[i] < seabedT) terrain[i] = "seabed";
      else if (elev[i] > cragT) terrain[i] = "crag";
      else if (mois[i] > fenT) terrain[i] = "fen";
      else if (mois[i] > pineT) terrain[i] = "pine";
      else terrain[i] = "ash";
    }

    /* Blast craters -> glasslands with a radiation gradient. */
    var nCraters = featR.int(3, 5);
    var adj = buildAdj(w, h);
    for (var k = 0; k < nCraters; k++) {
      var cc = featR.int(3, w - 4), cr = featR.int(3, h - 4);
      var radius = featR.int(1, 3);
      for (i = 0; i < n; i++) {
        var d = hexDist(i % w, Math.floor(i / w), cc, cr);
        if (d <= radius && terrain[i] !== "water") {
          terrain[i] = "glass";
          rad[i] = Math.max(rad[i], d === 0 ? 3 : (d <= 1 ? 2 : 2));
        } else if (d === radius + 1 && rad[i] < 1 && terrain[i] !== "water") {
          rad[i] = 1;
        }
      }
    }

    /* Dead cities -> ruin blobs. */
    var cities = [];
    var nCities = featR.int(5, 7);
    var guard = 0;
    while (cities.length < nCities && guard++ < 400) {
      var ci = featR.int(0, n - 1);
      if (terrain[ci] === "water" || terrain[ci] === "glass") continue;
      var ok = true;
      for (var q = 0; q < cities.length; q++)
        if (distIdx(ci, cities[q]) < 5) { ok = false; break; }
      if (!ok) continue;
      cities.push(ci);
      var blob = [ci], frontier = [ci];
      var size = featR.int(3, 8);
      while (blob.length < size && frontier.length) {
        var fi = frontier[featR.int(0, frontier.length - 1)];
        var ns = adj[fi];
        var pickN = ns[featR.int(0, ns.length - 1)];
        if (terrain[pickN] !== "water" && blob.indexOf(pickN) === -1) {
          blob.push(pickN); frontier.push(pickN);
        } else if (featR.chance(0.3)) {
          frontier.splice(frontier.indexOf(fi), 1);
        }
      }
      for (q = 0; q < blob.length; q++)
        if (terrain[blob[q]] !== "glass") terrain[blob[q]] = "ruin";
    }
    function distIdx(a, b) {
      return hexDist(a % w, Math.floor(a / w), b % w, Math.floor(b / w));
    }

    return { terrain: terrain, rad: rad, adj: adj, cities: cities };
  }

  /* ---------------- sites ---------------- */
  function placeSites(seed, tiles, adj, w, h) {
    var rand = R.local(R.derive(seed, "sites"));
    var n = tiles.length;

    function placeOn(pred, count, site, minDist) {
      var placed = [], guard = 0;
      while (placed.length < count && guard++ < 800) {
        var i = rand.int(0, n - 1);
        var t = tiles[i];
        if (t.site || !pred(t)) continue;
        var ok = true;
        for (var q = 0; q < placed.length; q++)
          if (hexDist(i % w, Math.floor(i / w), placed[q] % w, Math.floor(placed[q] / w)) < (minDist || 3)) { ok = false; break; }
        if (!ok) continue;
        t.site = site;
        placed.push(i);
      }
      return placed;
    }

    placeOn(function (t) { return t.terrain !== "water" && t.terrain !== "glass"; }, 3, "vault", 6);
    placeOn(function (t) { return t.terrain !== "water"; }, 6, "cache", 3);
    placeOn(function (t) { return t.terrain === "ruin" || t.terrain === "crag"; }, 2, "reactor", 8);

    /* The Beacon: one tile, biased toward the middle of the map, on high or
     * ruined ground. The victory condition lives here. */
    var bestI = -1, bestS = -Infinity;
    for (var i = 0; i < n; i++) {
      var t = tiles[i];
      if (t.site || t.terrain === "water") continue;
      var c = i % w, r = Math.floor(i / w);
      var cd = Math.abs(c - w / 2) / w + Math.abs(r - h / 2) / h;
      var s = -cd * 4 + (t.terrain === "crag" ? 1.5 : 0) + (t.terrain === "ruin" ? 1.0 : 0) + rand() * 0.8;
      if (s > bestS) { bestS = s; bestI = i; }
    }
    tiles[bestI].site = "beacon";
    return bestI;
  }

  /* ---------------- factions ---------------- */
  function scoreCapitalTile(tiles, adj, i) {
    var t = tiles[i];
    if (!D.TERRAIN[t.terrain].habitable || t.site || t.rad > 0) return -Infinity;
    var s = (D.TERRAIN[t.terrain].yields.food || 0) * 2;
    var ns = adj[i];
    for (var k = 0; k < ns.length; k++) {
      var y = D.TERRAIN[tiles[ns[k]].terrain].yields;
      s += (y.food || 0) + (y.scrap || 0) * 0.5;
      if (tiles[ns[k]].rad > 0) s -= 1.5;
    }
    return s;
  }

  /* Initial diplomatic posture between personalities. */
  var REL_BASE = {
    builder: 5, trader: 10, hermit: 5, zealot: -5, warlord: -15, raider: -20
  };

  function makeFaction(id, def, isPlayer, rand, diff) {
    var res = U.deepClone(D.BALANCE.startRes);
    var mult = isPlayer ? D.DIFFICULTY[diff].playerRes : 1.0;
    U.each(res, function (v, k) { res[k] = Math.round(v * mult); });
    if (def.startRes) U.each(def.startRes, function (v, k) { res[k] = (res[k] || 0) + v; });
    return {
      id: id, key: def.key, name: def.name, color: def.color,
      leader: N.leader(rand, def.culture), title: def.title,
      personality: def.personality, isPlayer: !!isPlayer, alive: true,
      res: res, hope: 60, techs: [], research: null,
      rel: {}, atWar: {}, flags: {}, lastDeficit: false,
      eventCooldowns: {}, usedOnce: {},
      capital: -1,
      stats: { battlesWon: 0, battlesLost: 0, kills: 0, losses: 0,
               salvaged: 0, founded: 1, captured: 0, techsDone: 0 }
    };
  }

  function placeFactions(state, seed, playerKey, diff) {
    var rand = R.local(R.derive(seed, "factions"));
    var tiles = state.tiles, adj = state.adj, w = state.w;

    /* Player faction first in the array (id 0), then the rest. */
    var defs = [];
    for (var i = 0; i < D.FACTIONS.length; i++)
      if (D.FACTIONS[i].key === playerKey) defs.push(D.FACTIONS[i]);
    for (i = 0; i < D.FACTIONS.length; i++)
      if (D.FACTIONS[i].key !== playerKey) defs.push(D.FACTIONS[i]);

    /* Candidate capitals: best-scored tiles, far apart. */
    var scored = [];
    for (i = 0; i < tiles.length; i++) {
      var s = scoreCapitalTile(tiles, adj, i);
      if (s > -Infinity) scored.push({ i: i, s: s + rand() * 1.2 });
    }
    scored.sort(function (a, b) { return b.s - a.s; });

    var chosen = [];
    for (var k = 0; k < scored.length && chosen.length < defs.length; k++) {
      var cand = scored[k].i, ok = true;
      for (var q = 0; q < chosen.length; q++)
        if (hexDist(cand % w, Math.floor(cand / w), chosen[q] % w, Math.floor(chosen[q] / w)) < 7) { ok = false; break; }
      if (ok) chosen.push(cand);
    }
    /* Fallback if the map was too cramped for full spacing. */
    k = 0;
    while (chosen.length < defs.length && k < scored.length) {
      if (chosen.indexOf(scored[k].i) === -1) chosen.push(scored[k].i);
      k++;
    }

    var usedNames = [];
    for (i = 0; i < defs.length; i++) {
      var f = makeFaction(i, defs[i], i === 0, rand, diff);
      var cap = chosen[i];
      f.capital = cap;
      state.factions.push(f);

      var t = tiles[cap];
      t.owner = f.id;
      t.settlement = {
        name: N.settlement(rand, usedNames), pop: D.BALANCE.startPop,
        isCapital: true, buildings: [], queue: null, foundedTurn: 1
      };
      var ns = adj[cap];
      for (q = 0; q < ns.length; q++) {
        var nt = tiles[ns[q]];
        if (nt.terrain !== "water" && nt.owner === -1) nt.owner = f.id;
      }
      for (q = 0; q < defs[i].startUnits.length; q++)
        ASH.sim.spawnUnit(state, f.id, defs[i].startUnits[q], cap);
    }

    /* Initial relations. */
    for (i = 0; i < state.factions.length; i++) {
      for (q = 0; q < state.factions.length; q++) {
        if (i === q) continue;
        var a = state.factions[i], b = state.factions[q];
        a.rel[b.key] = U.clamp(REL_BASE[a.personality] + REL_BASE[b.personality] + rand.int(-6, 6), -60, 60);
        a.atWar[b.key] = false;
      }
    }
  }

  /* ---------------- top level ---------------- */
  function newGame(opts) {
    var seed = opts.seed | 0;
    var w = D.BALANCE.mapW, h = D.BALANCE.mapH;
    var g = genTerrain(seed, w, h);

    var tiles = [];
    var varR = R.local(R.derive(seed, "variants"));
    for (var i = 0; i < w * h; i++) {
      tiles.push({
        i: i, terrain: g.terrain[i], rad: g.rad[i],
        owner: -1, settlement: null, site: null,
        units: [], explored: false, variant: varR.int(0, 1e9)
      });
    }

    var state = {
      v: 1, seed: seed, rngState: R.derive(seed, "sim"),
      difficulty: opts.difficulty || "ash",
      turn: 1, w: w, h: h,
      tiles: tiles, adj: g.adj,
      factions: [], units: {}, nextUnitId: 1,
      storms: [], pendingEvents: [], log: [],
      beacon: { tile: -1, progress: 0, faction: -1 },
      over: null
    };

    state.beacon.tile = placeSites(seed, tiles, g.adj, w, h);
    placeFactions(state, seed, opts.playerKey || "hearth", state.difficulty);

    ASH.sim.recomputeVision(state);
    ASH.sim.log(state, "The year is 87 After. The land is " + ASH.sim.worldName(seed) + ". It owes you nothing.", "system");
    return state;
  }

  return {
    newGame: newGame, hexDist: hexDist, distT: distT,
    buildAdj: buildAdj, neighborsOf: neighborsOf, toCube: toCube
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = ASH;
