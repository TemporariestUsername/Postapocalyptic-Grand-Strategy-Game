/* ASHFALL — sim.js
 * The simulation core: units, movement, settlements, economy, technology,
 * diplomacy, vision, the Beacon. Operates on plain-data state only; every
 * random draw goes through the state's RNG stream. No DOM.
 */
"use strict";
var ASH = typeof ASH !== "undefined" ? ASH : {};

ASH.sim = (function () {
  var U = ASH.util, R = ASH.rng;
  function D() { return ASH.data; }

  /* ------------------------------------------------ logging ------- */
  function log(state, text, kind, fid) {
    state.log.push({ turn: state.turn, text: text, kind: kind || "info", fid: (fid === undefined ? -1 : fid) });
    if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
  }

  var WORLD_NAMES = ["the Scoria", "the Grey Reach", "the Cinderlands",
    "the Hollow March", "the Saltwild", "the Bone Meridian", "the Ashen Vale",
    "the Rust Expanse"];
  function worldName(seed) {
    return WORLD_NAMES[Math.abs(seed) % WORLD_NAMES.length];
  }

  /* ------------------------------------------------ lookups ------- */
  function factionDef(f) {
    var F = D().FACTIONS;
    for (var i = 0; i < F.length; i++) if (F[i].key === f.key) return F[i];
    return F[0];
  }
  function mods(f) { return factionDef(f).mods || {}; }
  function hasTech(f, key) { return f.techs.indexOf(key) !== -1; }

  function settlementsOf(state, fid) {
    var out = [];
    for (var i = 0; i < state.tiles.length; i++) {
      var t = state.tiles[i];
      if (t.settlement && t.owner === fid) out.push(t);
    }
    return out;
  }
  function unitsOf(state, fid) {
    var out = [];
    U.each(state.units, function (u) { if (u.f === fid) out.push(u); });
    return out;
  }
  function totalSettlements(state) {
    var n = 0;
    for (var i = 0; i < state.tiles.length; i++) if (state.tiles[i].settlement) n++;
    return n;
  }
  /* Units are plain data; derive stats through these helpers instead of
   * storing methods on them. */
  function unitDef(u) { return D().UNITS[u.type]; }
  function unitAtk(state, u) {
    var f = state.factions[u.f];
    var v = unitDef(u).atk;
    if (hasTech(f, "powder")) v *= 1.2;
    v *= (mods(f).atk || 1);
    return v;
  }
  function unitDefence(state, u) {
    var f = state.factions[u.f];
    var v = unitDef(u).def;
    if (hasTech(f, "powder")) v *= 1.2;
    v *= (mods(f).def || 1);
    return v;
  }
  /* strengthOf needs raw-ish numbers without state in scope */
  function rawStrength(state, fid) {
    var s = 0;
    U.each(state.units, function (u) {
      if (u.f !== fid) return;
      s += (unitAtk(state, u) + unitDefence(state, u)) * (u.hp / 100) / 2;
    });
    return s;
  }

  /* ------------------------------------------------ units ------- */
  function spawnUnit(state, fid, type, tileIdx) {
    var def = D().UNITS[type];
    if (!def) return null;
    var u = {
      id: state.nextUnitId++, f: fid, type: type,
      tile: tileIdx, hp: 100, moves: unitMoveMax(state, fid, type),
      name: null
    };
    state.units[u.id] = u;
    state.tiles[tileIdx].units.push(u.id);
    return u;
  }

  function unitMoveMax(state, fid, type) {
    var def = D().UNITS[type];
    var m = def.move;
    if (type === "raider" && hasTech(state.factions[fid], "combustion")) m += 1;
    return m;
  }

  function removeUnit(state, uid) {
    var u = state.units[uid];
    if (!u) return;
    var arr = state.tiles[u.tile].units;
    var ix = arr.indexOf(uid);
    if (ix !== -1) arr.splice(ix, 1);
    delete state.units[uid];
  }

  function moveCostInto(state, fid, tileIdx) {
    var t = state.tiles[tileIdx];
    var ter = D().TERRAIN[t.terrain];
    if (ter.move === 0) return Infinity;
    /* tiles holding foreign units or settlements can't be entered by moving */
    if (t.units.length && state.units[t.units[0]].f !== fid) return Infinity;
    if (t.settlement && t.owner !== fid && t.owner !== -1) return Infinity;
    return ter.move;
  }

  /* Dijkstra out to the unit's remaining moves. Returns {tileIdx: cost}. */
  function reachable(state, u) {
    var out = {}, frontier = [{ i: u.tile, c: 0 }];
    out[u.tile] = 0;
    while (frontier.length) {
      /* small frontier — linear extract-min is fine at this scale */
      var bi = 0;
      for (var k = 1; k < frontier.length; k++) if (frontier[k].c < frontier[bi].c) bi = k;
      var cur = frontier.splice(bi, 1)[0];
      var ns = state.adj[cur.i];
      for (k = 0; k < ns.length; k++) {
        var cost = moveCostInto(state, u.f, ns[k]);
        if (cost === Infinity) continue;
        var nc = cur.c + cost;
        if (nc > u.moves) continue;
        if (out[ns[k]] === undefined || nc < out[ns[k]]) {
          out[ns[k]] = nc;
          frontier.push({ i: ns[k], c: nc });
        }
      }
    }
    delete out[u.tile];
    return out;
  }

  function moveUnit(state, uid, destIdx) {
    var u = state.units[uid];
    if (!u) return false;
    var reach = reachable(state, u);
    var cost = reach[destIdx];
    if (cost === undefined) return false;
    var arr = state.tiles[u.tile].units;
    arr.splice(arr.indexOf(uid), 1);
    u.tile = destIdx;
    u.moves -= cost;
    state.tiles[destIdx].units.push(uid);
    recomputeVision(state);
    return true;
  }

  function disband(state, uid) {
    var u = state.units[uid];
    if (!u) return;
    var f = state.factions[u.f];
    var t = state.tiles[u.tile];
    if (t.settlement && t.owner === u.f) t.settlement.pop += 1; // they come home
    removeUnit(state, uid);
    recomputeVision(state);
    if (f.isPlayer) log(state, "A warband stands down and goes back to the fields.", "info", f.id);
  }

  /* ---- unit special actions ---- */
  function canSalvage(state, uid) {
    var u = state.units[uid];
    if (!u || !unitDef(u).can || !unitDef(u).can.salvage) return false;
    var t = state.tiles[u.tile];
    if (!t.site) return false;
    var site = D().SITES[t.site];
    if (!site || !site.salvage) return false;
    if (t.owner !== -1 && t.owner !== u.f) return false;
    return u.moves > 0;
  }
  function salvage(state, uid) {
    if (!canSalvage(state, uid)) return false;
    var u = state.units[uid];
    var t = state.tiles[u.tile];
    var f = state.factions[u.f];
    var site = D().SITES[t.site];
    var gained = [];
    U.each(site.salvage, function (v, k) {
      f.res[k] = (f.res[k] || 0) + v;
      gained.push(v + " " + k);
    });
    log(state, f.name + " break open the " + site.name.toLowerCase() + " — " + gained.join(", ") + ".", "good", f.id);
    f.hope = U.clamp(f.hope + D().BALANCE.salvageHope, 0, 100);
    f.stats.salvaged++;
    t.site = null;
    u.moves = 0;
    return true;
  }

  function canPillage(state, uid) {
    var u = state.units[uid];
    if (!u || !unitDef(u).can || !unitDef(u).can.pillage || u.moves <= 0) return false;
    var t = state.tiles[u.tile];
    if (t.owner === -1 || t.owner === u.f || t.settlement) return false;
    var f = state.factions[u.f];
    var victim = state.factions[t.owner];
    return !!f.atWar[victim.key];
  }
  function pillage(state, uid) {
    if (!canPillage(state, uid)) return false;
    var u = state.units[uid];
    var t = state.tiles[u.tile];
    var f = state.factions[u.f], victim = state.factions[t.owner];
    var loot = Math.min(D().BALANCE.pillageLoot, Math.max(0, victim.res.scrap));
    victim.res.scrap -= loot;
    f.res.scrap += loot + 2; // plus what burns off the land itself
    t.owner = u.f;
    victim.hope = U.clamp(victim.hope - 2, 0, 100);
    log(state, f.name + " put " + victim.name + "'s borderland to the torch and carry off " + (loot + 2) + " scrap.", "battle", f.id);
    u.moves = 0;
    return true;
  }

  function canClaim(state, uid) {
    var u = state.units[uid];
    if (!u || u.moves <= 0) return false;
    var t = state.tiles[u.tile];
    if (t.owner !== -1 || t.terrain === "water") return false;
    var f = state.factions[u.f];
    if (f.res.scrap < 2) return false;
    var ns = state.adj[u.tile];
    for (var k = 0; k < ns.length; k++)
      if (state.tiles[ns[k]].owner === u.f) return true;
    return false;
  }
  function claim(state, uid) {
    if (!canClaim(state, uid)) return false;
    var u = state.units[uid];
    var f = state.factions[u.f];
    f.res.scrap -= 2;
    state.tiles[u.tile].owner = u.f;
    u.moves = 0;
    recomputeVision(state);
    return true;
  }

  function canFound(state, uid) {
    var u = state.units[uid];
    if (!u || !unitDef(u).can || !unitDef(u).can.found || u.moves <= 0) return false;
    var f = state.factions[u.f];
    var t = state.tiles[u.tile];
    if (t.owner !== -1 && t.owner !== u.f) return false;
    if (t.settlement || t.site) return false;
    var ter = D().TERRAIN[t.terrain];
    var settleHostile = hasTech(f, "innoculants") || mods(f).radImmune;
    if (!ter.habitable && !(settleHostile && (t.terrain === "glass" || t.terrain === "seabed"))) return false;
    if (t.rad > 0 && !settleHostile) return false;
    var cap = f.isPlayer ? D().BALANCE.maxSettlements : D().BALANCE.aiMaxSettlements;
    if (settlementsOf(state, f.id).length >= cap) return false;
    /* no crowding: nothing within 2 hexes */
    for (var i = 0; i < state.tiles.length; i++) {
      if (state.tiles[i].settlement && ASH.worldgen.distT(state, i, u.tile) < 3) return false;
    }
    return true;
  }
  function found(state, uid, rand) {
    if (!canFound(state, uid)) return false;
    var u = state.units[uid];
    var f = state.factions[u.f];
    var t = state.tiles[u.tile];
    var nameRand = R.local(R.derive(state.seed, "settle" + state.nextUnitId + "t" + state.turn));
    var used = [];
    for (var i = 0; i < state.tiles.length; i++)
      if (state.tiles[i].settlement) used.push(state.tiles[i].settlement.name);
    t.settlement = {
      name: ASH.names.settlement(nameRand, used), pop: 3,
      isCapital: false, buildings: [], queue: null, foundedTurn: state.turn
    };
    t.owner = f.id;
    var ns = state.adj[t.i];
    for (var k = 0; k < ns.length; k++) {
      var nt = state.tiles[ns[k]];
      if (nt.owner === -1 && nt.terrain !== "water") nt.owner = f.id;
    }
    removeUnit(state, uid);
    f.stats.founded++;
    f.hope = U.clamp(f.hope + 3, 0, 100);
    log(state, f.name + " raise a new " + factionDef(f).settlementNoun + ": " + t.settlement.name + ". Smoke from its first fire climbs straight and hopeful.", "good", f.id);
    recomputeVision(state);
    return true;
  }

  /* ------------------------------------------------ settlements ------- */
  function yieldsOf(state, tile) {
    var B = D().BALANCE, T = D().TERRAIN;
    var f = state.factions[tile.owner];
    var s = tile.settlement;
    var y = { food: B.settlementBaseYield.food, scrap: B.settlementBaseYield.scrap, fuel: 0, meds: 0, know: 0 };
    var hasPurifier = s.buildings.indexOf("purifier") !== -1;

    function addTerrain(t, mult) {
      var ty = T[t.terrain].yields;
      U.each(ty, function (v, k) {
        var vv = v * mult;
        if (k === "food" && t.terrain === "fen" && hasPurifier) vv *= 2;
        y[k] += vv;
      });
      if (t.terrain === "water") y.food += B.fishFood * mult;
    }
    addTerrain(tile, 2);
    var ns = state.adj[tile.i];
    for (var k = 0; k < ns.length; k++) {
      var nt = state.tiles[ns[k]];
      if (nt.owner === tile.owner || nt.terrain === "water") addTerrain(nt, 1);
    }

    y.scrap += s.pop * B.laborScrapPerPop;
    for (k = 0; k < s.buildings.length; k++) {
      switch (s.buildings[k]) {
        case "hydrofarm": y.food += 3; break;
        case "scrapforge": y.scrap += 2.5; break;
        case "still": y.fuel += 1.5 + (hasTech(f, "combustion") ? 1 : 0); break;
        case "clinic": y.meds += 1; break;
        case "archive": y.know += 2 + (hasTech(f, "crypto") ? 1 : 0); break;
        case "mast": y.know += 0.5; break;
        case "purifier": y.meds += 1; break;
      }
    }
    if (hasTech(f, "seedvaults")) y.food += 1;
    if (hasTech(f, "cleanwater")) y.meds += 0.5;
    return y;
  }

  /* Faction income summary: {prod:{}, upkeep:{}, net:{}} */
  function factionIncome(state, f) {
    var B = D().BALANCE;
    var season = D().SEASONS[(state.turn - 1) % 4];
    var m = mods(f);
    var prod = { food: 0, scrap: 0, fuel: 0, meds: 0, know: 0 };
    var setts = settlementsOf(state, f.id);
    for (var i = 0; i < setts.length; i++) {
      var y = yieldsOf(state, setts[i]);
      U.each(y, function (v, k) { prod[k] += v; });
    }
    for (i = 0; i < state.tiles.length; i++) {
      var t = state.tiles[i];
      if (t.owner === f.id && t.site && D().SITES[t.site].perTurn)
        U.each(D().SITES[t.site].perTurn, function (v, k) { prod[k] += v; });
    }
    prod.food *= (m.food || 1) * season.foodMult;
    prod.scrap *= (m.scrap || 1);
    prod.fuel *= (m.fuel || 1);
    prod.know *= (m.know || 1);
    if (hasTech(f, "tools")) prod.scrap *= 1.2;
    if (!f.isPlayer) {
      var aiMult = D().DIFFICULTY[state.difficulty].aiYield;
      U.each(prod, function (v, k) { prod[k] = v * aiMult; });
    }

    var upkeep = { food: 0, scrap: 0, fuel: 0, meds: 0, know: 0 };
    var pop = 0;
    for (i = 0; i < setts.length; i++) pop += setts[i].settlement.pop;
    upkeep.food = pop * B.eatPerPop;
    U.each(state.units, function (u) {
      if (u.f !== f.id) return;
      var up = D().UNITS[u.type].upkeep || {};
      U.each(up, function (v, k) { upkeep[k] += v; });
    });

    var net = {};
    U.each(prod, function (v, k) { net[k] = v - upkeep[k]; });
    return { prod: prod, upkeep: upkeep, net: net, pop: pop };
  }

  /* ---- construction ---- */
  function canBuild(state, f, tile, key) {
    var b = D().BUILDINGS[key];
    var s = tile.settlement;
    if (!b || !s || tile.owner !== f.id) return "no";
    if (s.buildings.indexOf(key) !== -1) return "Already standing.";
    if (s.queue) return "The crews are busy.";
    if (s.buildings.length >= D().BALANCE.maxBuildings) return "No room inside the walls.";
    var costs = b.cost;
    if ((costs.scrap || 0) > f.res.scrap || (costs.fuel || 0) > f.res.fuel) return "Not enough materials.";
    return true;
  }
  function startBuild(state, f, tile, key) {
    if (canBuild(state, f, tile, key) !== true) return false;
    var b = D().BUILDINGS[key];
    f.res.scrap -= (b.cost.scrap || 0);
    f.res.fuel -= (b.cost.fuel || 0);
    var turns = b.turns - (hasTech(f, "arcforge") ? 1 : 0);
    tile.settlement.queue = { key: key, left: Math.max(1, turns) };
    return true;
  }

  /* ---- recruitment ---- */
  function canRecruit(state, f, tile, type) {
    var def = D().UNITS[type];
    var s = tile.settlement;
    if (!def || !s || tile.owner !== f.id) return "no";
    if (def.needsBuilding && s.buildings.indexOf(def.needsBuilding) === -1)
      return "Needs a " + D().BUILDINGS[def.needsBuilding].name + ".";
    if (s.pop <= def.popCost + 1) return "The " + (s.isCapital ? "capital" : "settlement") + " can't spare the people.";
    if ((def.cost.scrap || 0) > f.res.scrap || (def.cost.fuel || 0) > f.res.fuel) return "Not enough materials.";
    return true;
  }
  function recruit(state, f, tile, type) {
    if (canRecruit(state, f, tile, type) !== true) return null;
    var def = D().UNITS[type];
    f.res.scrap -= (def.cost.scrap || 0);
    f.res.fuel -= (def.cost.fuel || 0);
    tile.settlement.pop -= def.popCost;
    var u = spawnUnit(state, f.id, type, tile.i);
    u.moves = 0; // mustering takes the season
    recomputeVision(state);
    return u;
  }

  /* ------------------------------------------------ technology ------- */
  function canResearch(f, key) {
    var T = D().TECHS;
    for (var i = 0; i < T.length; i++) {
      if (T[i].key !== key) continue;
      if (hasTech(f, key)) return false;
      if (T[i].prereq && !hasTech(f, T[i].prereq)) return false;
      return true;
    }
    return false;
  }
  function setResearch(state, f, key) {
    if (!canResearch(f, key)) return false;
    var keep = (f.research && f.research.key === key) ? f.research.progress : 0;
    f.research = { key: key, progress: keep };
    return true;
  }
  function techByKey(key) {
    var T = D().TECHS;
    for (var i = 0; i < T.length; i++) if (T[i].key === key) return T[i];
    return null;
  }

  /* ------------------------------------------------ diplomacy ------- */
  function declareWar(state, aggressor, defender) {
    if (aggressor.atWar[defender.key]) return;
    aggressor.atWar[defender.key] = true;
    defender.atWar[aggressor.key] = true;
    aggressor.rel[defender.key] = U.clamp((aggressor.rel[defender.key] || 0) - 30, -100, 100);
    defender.rel[aggressor.key] = U.clamp((defender.rel[aggressor.key] || 0) - 30, -100, 100);
    log(state, aggressor.name + " declare war on " + defender.name + ". Somewhere, a bell that survived the Fall is rung for the old reason.", "war");
  }
  function makePeace(state, a, b) {
    a.atWar[b.key] = false;
    b.atWar[a.key] = false;
    a.rel[b.key] = Math.max(a.rel[b.key] || 0, -10);
    b.rel[a.key] = Math.max(b.rel[a.key] || 0, -10);
    log(state, a.name + " and " + b.name + " bury the hatchet — shallowly, and where both can find it.", "system");
  }
  /* Would `f` accept peace offered by `other`? */
  function acceptsPeace(state, f, other) {
    if (!f.atWar[other.key]) return false;
    var mine = rawStrength(state, f.id), theirs = rawStrength(state, other.id);
    if (mine < theirs * 0.9) return true;
    if ((f.rel[other.key] || 0) > 10) return true;
    if (f.hope < 30) return true;
    return false;
  }
  function relShift(state, f, otherKey, d) {
    f.rel[otherKey] = U.clamp((f.rel[otherKey] || 0) + d, -100, 100);
    /* feelings are usually mutual in the wastes */
    for (var i = 0; i < state.factions.length; i++) {
      var o = state.factions[i];
      if (o.key === otherKey) o.rel[f.key] = U.clamp((o.rel[f.key] || 0) + Math.round(d * 0.8), -100, 100);
    }
  }

  /* ------------------------------------------------ market ------- */
  var TRADE = {
    sell: { food: 0.6, fuel: 1.2, meds: 1.5 },  // scrap gained per unit sold
    buy: { food: 1.0, fuel: 2.0, meds: 2.2 }    // scrap paid per unit bought
  };
  function tradeRate(f, dir, res) {
    var r = TRADE[dir][res];
    if (!r) return 0;
    if (mods(f).trade) r = dir === "sell" ? r * 1.25 : r * 0.8;
    return r;
  }
  function trade(state, f, dir, res, amount) {
    var rate = tradeRate(f, dir, res);
    if (!rate || amount <= 0) return false;
    if (dir === "sell") {
      if (f.res[res] < amount) return false;
      f.res[res] -= amount;
      f.res.scrap += amount * rate;
    } else {
      var cost = amount * rate;
      if (f.res.scrap < cost) return false;
      f.res.scrap -= cost;
      f.res[res] += amount;
    }
    f.res.scrap = Math.round(f.res.scrap * 10) / 10;
    return true;
  }

  /* ------------------------------------------------ the Beacon ------- */
  function canKindle(state, f) {
    var B = D().BEACON;
    if (!hasTech(f, B.tech)) return "Research " + techByKey(B.tech).name + " first.";
    var bt = state.tiles[state.beacon.tile];
    if (bt.owner !== f.id) return "The Beacon must stand on your soil — claim its hex.";
    if (state.beacon.faction === f.id) return "The kindling is already under way.";
    if (f.res.scrap < B.cost.scrap || f.res.fuel < B.cost.fuel) return "It will take " + B.cost.scrap + " scrap and " + B.cost.fuel + " fuel.";
    return true;
  }
  function startKindle(state, f) {
    if (canKindle(state, f) !== true) return false;
    var B = D().BEACON;
    f.res.scrap -= B.cost.scrap;
    f.res.fuel -= B.cost.fuel;
    state.beacon.faction = f.id;
    state.beacon.progress = 0;
    log(state, f.name + " begin the Kindling. Scaffolds climb the dead spire; the wasteland holds its breath.", "system", f.id);
    return true;
  }

  /* ------------------------------------------------ vision ------- */
  function inRange(state, center, range, fn) {
    /* BFS ring walk — cheap at our radii */
    var seen = {}, frontier = [center], depth = 0;
    seen[center] = true;
    fn(center);
    while (depth < range) {
      var next = [];
      for (var i = 0; i < frontier.length; i++) {
        var ns = state.adj[frontier[i]];
        for (var k = 0; k < ns.length; k++) {
          if (!seen[ns[k]]) { seen[ns[k]] = true; next.push(ns[k]); fn(ns[k]); }
        }
      }
      frontier = next;
      depth++;
    }
  }

  function recomputeVision(state) {
    var n = state.tiles.length;
    var vis = new Array(n);
    for (var i = 0; i < n; i++) vis[i] = 0;
    var player = state.factions[0];
    if (!player) { state.visible = vis; return; }
    var bonus = hasTech(player, "signal") ? 1 : 0;
    function mark(i) { vis[i] = 1; state.tiles[i].explored = true; }
    for (i = 0; i < n; i++) {
      var t = state.tiles[i];
      if (t.owner === 0 && t.settlement) {
        var r = 3 + (t.settlement.buildings.indexOf("mast") !== -1 ? 2 : 0);
        inRange(state, i, r, mark);
      } else if (t.owner === 0) {
        inRange(state, i, 1, mark);
      }
    }
    U.each(state.units, function (u) {
      if (u.f !== 0) return;
      inRange(state, u.tile, (D().UNITS[u.type].vision || 2) + bonus, mark);
    });
    /* Signal Discipline: rival capitals stand revealed */
    if (bonus) {
      for (i = 1; i < state.factions.length; i++) {
        var f2 = state.factions[i];
        if (f2.alive && f2.capital >= 0) state.tiles[f2.capital].explored = true;
      }
    }
    state.visible = vis;
  }

  /* ------------------------------------------------ per-faction season tick ------- */
  function economyTick(state, f) {
    var B = D().BALANCE;
    var inc = factionIncome(state, f);
    var setts = settlementsOf(state, f.id);

    U.each(inc.net, function (v, k) { f.res[k] = Math.round((f.res[k] + v) * 10) / 10; });

    /* deficits */
    var starving = f.res.food < 0;
    var broke = f.res.scrap < 0 || f.res.fuel < 0;
    if (starving) {
      f.res.food = 0;
      f.hope = U.clamp(f.hope - B.starvationHopeHit, 0, 100);
      var worst = U.best(setts, function (t) { return t.settlement.pop; });
      if (worst && worst.settlement.pop > 1) {
        worst.settlement.pop -= B.starvationPopHit;
        if (f.isPlayer) log(state, "The stores run dry. In " + worst.settlement.name + ", the burying-ground gains " + (B.starvationPopHit * 20) + " names. Hope gutters.", "bad", f.id);
      } else if (f.isPlayer) {
        log(state, "Hunger walks your streets like it owns them.", "bad", f.id);
      }
    }
    if (broke) {
      f.res.scrap = Math.max(0, f.res.scrap);
      f.res.fuel = Math.max(0, f.res.fuel);
      f.lastDeficit = true;
      var us = unitsOf(state, f.id);
      for (var i = 0; i < us.length; i++) us[i].hp = Math.max(5, us[i].hp - B.deficitHpHit);
      f.hope = U.clamp(f.hope - 2, 0, 100);
      if (f.isPlayer && us.length) log(state, "Unpaid and under-oiled, your warbands fray at the edges.", "bad", f.id);
    } else {
      f.lastDeficit = false;
    }
    U.each(f.res, function (v, k) { if (f.res[k] < 0) f.res[k] = 0; });

    /* growth */
    if (!starving && f.res.food >= B.growthFood) {
      var gMult = mods(f).growth || 1;
      for (i = 0; i < setts.length; i++) {
        if (R.chance(state, B.growthChance * gMult / Math.max(1, setts.length))) {
          setts[i].settlement.pop += 1;
          if (f.isPlayer) log(state, setts[i].settlement.name + " grows: new hands, new mouths, new reasons.", "good", f.id);
        }
      }
    }

    /* hope drift */
    var wars = 0;
    U.each(f.atWar, function (v) { if (v) wars++; });
    if (!starving && !broke) {
      var regen = B.hopeRegen + (mods(f).hopeRegen || 0);
      f.hope = U.clamp(f.hope + regen - wars * B.warHopeDrag, 0, 100);
    } else {
      f.hope = U.clamp(f.hope - wars * B.warHopeDrag, 0, 100);
    }
    var floor = mods(f).hopeFloor || 0;
    if (floor && setts.length > 0 && f.hope < floor) f.hope = floor;

    /* construction */
    for (i = 0; i < setts.length; i++) {
      var s = setts[i].settlement;
      if (s.queue) {
        s.queue.left--;
        if (s.queue.left <= 0) {
          s.buildings.push(s.queue.key);
          if (f.isPlayer) log(state, "The " + D().BUILDINGS[s.queue.key].name + " in " + s.name + " stands finished. " + D().BUILDINGS[s.queue.key].blurb, "good", f.id);
          if (s.queue.key === "walls") f.hope = U.clamp(f.hope + 2, 0, 100);
          if (s.queue.key === "mast") f.hope = U.clamp(f.hope + 3, 0, 100);
          s.queue = null;
        }
      }
    }

    /* research */
    if (f.research) {
      f.research.progress += Math.max(0, inc.net.know > 0 ? inc.net.know : inc.prod.know);
      var tech = techByKey(f.research.key);
      if (tech && f.research.progress >= tech.cost) {
        f.techs.push(tech.key);
        f.stats.techsDone++;
        f.research = null;
        if (tech.key === "cleanwater") f.hope = U.clamp(f.hope + 5, 0, 100);
        if (f.isPlayer) log(state, "Remembrance: " + tech.name + ". " + tech.blurb, "good", f.id);
        else log(state, f.name + " have remembered something the world forgot.", "system", f.id);
      }
    }
  }

  function healTick(state, f) {
    var B = D().BALANCE;
    var us = unitsOf(state, f.id);
    for (var i = 0; i < us.length; i++) {
      var u = us[i];
      var t = state.tiles[u.tile];
      if (t.owner !== f.id || u.hp >= 100) continue;
      var inStorm = stormAt(state, u.tile);
      if (inStorm) continue;
      var heal = B.healPerTurn;
      if (hasTech(f, "fieldmed")) heal *= 2;
      if (t.settlement && t.settlement.buildings.indexOf("clinic") !== -1) heal += 5;
      if (f.res.meds >= 0.1) { f.res.meds = Math.round((f.res.meds - 0.1) * 10) / 10; }
      else heal = Math.floor(heal / 2);
      u.hp = Math.min(100, u.hp + heal);
    }
  }

  function radTick(state, f) {
    var B = D().BALANCE;
    if (mods(f).radImmune || hasTech(f, "innoculants")) return;
    var resist = mods(f).radResist || 1;
    var us = unitsOf(state, f.id);
    for (var i = 0; i < us.length; i++) {
      var u = us[i];
      var t = state.tiles[u.tile];
      if (t.rad > 0) {
        u.hp -= Math.round(B.radDamage * (t.rad / 2) * resist);
        if (u.hp <= 0) {
          if (f.isPlayer) log(state, "A warband dies coughing light in the glasslands. The glass keeps what it takes.", "bad", f.id);
          f.stats.losses++;
          removeUnit(state, u.id);
        }
      }
    }
  }

  function stormAt(state, tileIdx) {
    for (var i = 0; i < state.storms.length; i++) {
      if (ASH.worldgen.distT(state, state.storms[i].tile, tileIdx) <= state.storms[i].r) return true;
    }
    return false;
  }

  function refreshMoves(state, f) {
    var us = unitsOf(state, f.id);
    for (var i = 0; i < us.length; i++) {
      var u = us[i];
      u.moves = unitMoveMax(state, f.id, u.type);
      if (stormAt(state, u.tile)) u.moves = Math.max(1, u.moves - 1);
    }
  }

  /* victory helpers */
  function shareOfSettlements(state, fid) {
    var total = totalSettlements(state);
    if (!total) return 0;
    return settlementsOf(state, fid).length / total;
  }

  return {
    log: log, worldName: worldName, factionDef: factionDef, mods: mods, hasTech: hasTech,
    settlementsOf: settlementsOf, unitsOf: unitsOf, totalSettlements: totalSettlements,
    rawStrength: rawStrength, unitDef: unitDef, unitAtk: unitAtk, unitDefence: unitDefence,
    spawnUnit: spawnUnit, removeUnit: removeUnit, reachable: reachable, moveUnit: moveUnit,
    moveCostInto: moveCostInto, disband: disband,
    canSalvage: canSalvage, salvage: salvage, canPillage: canPillage, pillage: pillage,
    canClaim: canClaim, claim: claim, canFound: canFound, found: found,
    yieldsOf: yieldsOf, factionIncome: factionIncome,
    canBuild: canBuild, startBuild: startBuild, canRecruit: canRecruit, recruit: recruit,
    canResearch: canResearch, setResearch: setResearch, techByKey: techByKey,
    declareWar: declareWar, makePeace: makePeace, acceptsPeace: acceptsPeace, relShift: relShift,
    tradeRate: tradeRate, trade: trade,
    canKindle: canKindle, startKindle: startKindle,
    recomputeVision: recomputeVision, inRange: inRange,
    economyTick: economyTick, healTick: healTick, radTick: radTick,
    stormAt: stormAt, refreshMoves: refreshMoves, shareOfSettlements: shareOfSettlements,
    unitMoveMax: unitMoveMax
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = ASH;
