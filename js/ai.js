/* ASHFALL — ai.js
 * Rival faction brains. Each personality weighs expansion, industry, and
 * violence differently; all of them want to survive winter just like you.
 */
"use strict";
var ASH = typeof ASH !== "undefined" ? ASH : {};

ASH.ai = (function () {
  var U = ASH.util, R = ASH.rng, S = ASH.sim, C = ASH.combat;
  function D() { return ASH.data; }

  /* ---------------- research ---------------- */
  function pickResearch(state, f) {
    if (f.research) return;
    var prefs = S.factionDef(f).aiTech;
    for (var i = 0; i < prefs.length; i++) {
      if (S.canResearch(f, prefs[i])) { S.setResearch(state, f, prefs[i]); return; }
    }
  }

  /* ---------------- construction ---------------- */
  function buildPriorities(state, f) {
    var inc = S.factionIncome(state, f);
    var order = [];
    if (inc.net.food < 1.5) order.push("hydrofarm");
    if (inc.net.scrap < 1.5) order.push("scrapforge");
    if (inc.net.fuel < 0.3) order.push("still");
    if (f.personality === "warlord" || f.personality === "raider") {
      order.push("barracks", "walls", "scrapforge", "hydrofarm");
    } else if (f.personality === "hermit") {
      order.push("archive", "walls", "mast", "clinic");
    } else if (f.personality === "zealot") {
      order.push("clinic", "walls", "archive", "mast");
    } else if (f.personality === "trader") {
      order.push("still", "scrapforge", "mast", "walls");
    } else {
      order.push("hydrofarm", "walls", "clinic", "archive", "scrapforge");
    }
    order.push("purifier", "mast", "barracks", "archive", "still", "clinic");
    return order;
  }

  function tryBuild(state, f) {
    var setts = S.settlementsOf(state, f.id);
    if (!setts.length) return;
    var order = buildPriorities(state, f);
    for (var i = 0; i < setts.length; i++) {
      var t = setts[i];
      if (t.settlement.queue) continue;
      for (var k = 0; k < order.length; k++) {
        if (S.canBuild(state, f, t, order[k]) === true) {
          /* keep a war chest: don't spend below a floor that scales with caution */
          var floor = f.personality === "warlord" ? 8 : 14;
          if (f.res.scrap - (D().BUILDINGS[order[k]].cost.scrap || 0) < floor) break;
          S.startBuild(state, f, t, order[k]);
          break;
        }
      }
    }
  }

  /* ---------------- recruitment ---------------- */
  function desiredArmy(state, f) {
    var setts = S.settlementsOf(state, f.id).length;
    var base = 2 + setts;
    var aggro = S.factionDef(f).aiAggro * D().DIFFICULTY[state.difficulty].aiAggro;
    var atWar = false;
    U.each(f.atWar, function (v) { if (v) atWar = true; });
    if (atWar) base += 3;
    return Math.round(base * (0.8 + aggro));
  }

  function tryRecruit(state, f) {
    var want = desiredArmy(state, f);
    var have = S.unitsOf(state, f.id).length;
    if (have >= want) return;
    var setts = S.settlementsOf(state, f.id);
    var prefs = (f.personality === "warlord" || f.personality === "raider")
      ? ["veteran", "raider", "militia", "scav"]
      : (f.personality === "hermit" || f.personality === "builder")
        ? ["militia", "veteran", "scav", "raider"]
        : ["militia", "raider", "scav", "veteran"];
    for (var i = 0; i < setts.length && have < want; i++) {
      for (var k = 0; k < prefs.length; k++) {
        if (S.canRecruit(state, f, setts[i], prefs[k]) === true) {
          if (f.res.scrap - (D().UNITS[prefs[k]].cost.scrap || 0) < 6) break;
          S.recruit(state, f, setts[i], prefs[k]);
          have++;
          break;
        }
      }
    }
  }

  /* ---------------- expansion ---------------- */
  function scoreSettleSite(state, f, i) {
    var t = state.tiles[i];
    var ter = D().TERRAIN[t.terrain];
    if (!ter.habitable || t.settlement || t.site || t.rad > 0) return -Infinity;
    if (t.owner !== -1 && t.owner !== f.id) return -Infinity;
    for (var q = 0; q < state.tiles.length; q++)
      if (state.tiles[q].settlement && ASH.worldgen.distT(state, q, i) < 3) return -Infinity;
    var s = (ter.yields.food || 0) * 2 + (ter.yields.scrap || 0);
    var ns = state.adj[i];
    for (var k = 0; k < ns.length; k++) {
      var y = D().TERRAIN[state.tiles[ns[k]].terrain].yields;
      s += (y.food || 0) + (y.scrap || 0) * 0.5 + (y.fuel || 0) * 0.5;
      if (state.tiles[ns[k]].rad > 0) s -= 2;
    }
    s -= ASH.worldgen.distT(state, f.capital, i) * 0.35;
    return s;
  }

  function tryExpand(state, f) {
    var def = S.factionDef(f);
    var setts = S.settlementsOf(state, f.id);
    if (setts.length >= D().BALANCE.aiMaxSettlements) return;
    var hasReclaimer = false;
    U.each(state.units, function (u) { if (u.f === f.id && u.type === "reclaimer") hasReclaimer = true; });
    if (!hasReclaimer && R.chance(state, def.aiExpand * 0.35) && f.res.scrap > 24 && setts.length) {
      var home = U.best(setts, function (t) { return t.settlement.pop; });
      if (home && S.canRecruit(state, f, home, "reclaimer") === true)
        S.recruit(state, f, home, "reclaimer");
    }
  }

  /* ---------------- war & peace ---------------- */
  function considerWar(state, f) {
    var def = S.factionDef(f);
    var aggro = def.aiAggro * D().DIFFICULTY[state.difficulty].aiAggro;
    if (aggro <= 0.1) return;
    var myStr = S.rawStrength(state, f.id);
    for (var i = 0; i < state.factions.length; i++) {
      var o = state.factions[i];
      if (o.id === f.id || !o.alive || f.atWar[o.key]) continue;
      var rel = f.rel[o.key] || 0;
      if (rel > -10) continue;
      var theirStr = S.rawStrength(state, o.id);
      var neighbours = bordersWith(state, f.id, o.id);
      if (!neighbours) continue;
      var p = aggro * 0.12 * (myStr > theirStr * 1.35 ? 1 : 0.25) * (rel < -35 ? 1.6 : 1);
      if (R.chance(state, p)) {
        S.declareWar(state, f, o);
        return;
      }
    }
    /* sue for peace when it's going badly */
    U.each(f.atWar, function (atWar, key) {
      if (!atWar) return;
      var o = factionByKey(state, key);
      if (!o || !o.alive) { f.atWar[key] = false; return; }
      if (S.rawStrength(state, f.id) < S.rawStrength(state, o.id) * 0.55 && R.chance(state, 0.4)) {
        if (o.isPlayer) {
          state.pendingPeace = state.pendingPeace || [];
          if (state.pendingPeace.indexOf(f.id) === -1) state.pendingPeace.push(f.id);
        } else if (S.acceptsPeace(state, o, f)) {
          S.makePeace(state, f, o);
        }
      }
    });
  }

  function factionByKey(state, key) {
    for (var i = 0; i < state.factions.length; i++)
      if (state.factions[i].key === key) return state.factions[i];
    return null;
  }

  function bordersWith(state, fa, fb) {
    for (var i = 0; i < state.tiles.length; i++) {
      if (state.tiles[i].owner !== fa) continue;
      var ns = state.adj[i];
      for (var k = 0; k < ns.length; k++)
        if (state.tiles[ns[k]].owner === fb) return true;
    }
    return false;
  }

  /* ---------------- unit orders ---------------- */
  function nearestEnemyTarget(state, f, fromIdx) {
    var bestI = -1, bestD = Infinity;
    for (var i = 0; i < state.tiles.length; i++) {
      var t = state.tiles[i];
      var enemyHere = false;
      if (t.settlement && t.owner >= 0 && t.owner !== f.id && f.atWar[state.factions[t.owner].key]) enemyHere = true;
      if (t.units.length) {
        var uf = state.units[t.units[0]].f;
        if (uf !== f.id && f.atWar[state.factions[uf].key]) enemyHere = true;
      }
      if (!enemyHere) continue;
      var d = ASH.worldgen.distT(state, fromIdx, i);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    return bestI;
  }

  function stepToward(state, u, targetIdx) {
    /* walk through reachable tiles toward the target */
    var reach = S.reachable(state, u);
    var bestT = -1, bestD = ASH.worldgen.distT(state, u.tile, targetIdx), found = false;
    U.each(reach, function (cost, key) {
      var i = parseInt(key, 10);
      var d = ASH.worldgen.distT(state, i, targetIdx);
      if (d < bestD) { bestD = d; bestT = i; found = true; }
    });
    if (found) S.moveUnit(state, u.id, bestT);
    return found;
  }

  function unitOrders(state, f) {
    var units = S.unitsOf(state, f.id);
    var setts = S.settlementsOf(state, f.id);
    var atWarAny = false;
    U.each(f.atWar, function (v) { if (v) atWarAny = true; });

    /* keep a defender in each settlement; one per */
    var defended = {};
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      var t = state.tiles[u.tile];
      if (t.settlement && t.owner === f.id && !defended[u.tile] && u.type !== "reclaimer" && u.type !== "scav") {
        defended[u.tile] = true;
        u.role = "garrison";
      } else {
        u.role = "free";
      }
    }
    /* send a defender home if a settlement is bare and threatened */
    for (i = 0; i < setts.length; i++) {
      if (defended[setts[i].i]) continue;
      var danger = enemyNear(state, f, setts[i].i, 4);
      if (!danger) continue;
      var guard = U.best(units.filter(function (x) { return x.role === "free" && x.type !== "reclaimer"; }),
        function (x) { return -ASH.worldgen.distT(state, x.tile, setts[i].i); });
      if (guard) {
        if (guard.tile !== setts[i].i) stepToward(state, guard, setts[i].i);
        guard.role = "garrison";
        defended[setts[i].i] = true;
      }
    }

    for (i = 0; i < units.length; i++) {
      u = units[i];
      if (!state.units[u.id] || u.role === "garrison" || u.moves <= 0) continue;

      if (u.type === "reclaimer") {
        /* find the best site within ambition's reach and go there */
        if (S.canFound(state, u.id)) { S.found(state, u.id); continue; }
        var bestSite = -1, bestScore = 2;
        for (var q = 0; q < state.tiles.length; q++) {
          var sc = scoreSettleSite(state, f, q);
          if (sc > bestScore) { bestScore = sc; bestSite = q; }
        }
        if (bestSite >= 0) stepToward(state, u, bestSite);
        continue;
      }

      if (u.type === "scav") {
        /* salvage runs */
        if (S.canSalvage(state, u.id)) { S.salvage(state, u.id); continue; }
        var site = nearestSalvage(state, f, u.tile);
        if (site >= 0) { stepToward(state, u, site); if (S.canSalvage(state, u.id)) S.salvage(state, u.id); }
        else if (S.canClaim(state, u.id) && R.chance(state, 0.3)) S.claim(state, u.id);
        continue;
      }

      if (atWarAny) {
        var target = nearestEnemyTarget(state, f, u.tile);
        if (target >= 0) {
          /* attack if adjacent and it looks survivable; otherwise advance */
          if (state.adj[u.tile].indexOf(target) !== -1) {
            var their = defenderPower(state, target);
            var ours = stackPower(state, f.id, u.tile);
            if (ours > their * (f.personality === "warlord" ? 0.9 : 1.15)) {
              C.attack(state, f.id, u.tile, target);
            }
          } else {
            stepToward(state, u, target);
            if (state.adj[u.tile].indexOf(target) !== -1 && u.moves > 0) {
              their = defenderPower(state, target);
              ours = stackPower(state, f.id, u.tile);
              if (ours > their * 1.05) C.attack(state, f.id, u.tile, target);
            }
          }
          continue;
        }
      }

      /* peacetime: claim good border tiles, drift home */
      if (S.canClaim(state, u.id) && R.chance(state, 0.35)) { S.claim(state, u.id); continue; }
      if (S.canPillage(state, u.id)) { S.pillage(state, u.id); continue; }
      if (setts.length) {
        var home = setts[i % setts.length];
        if (ASH.worldgen.distT(state, u.tile, home.i) > 3) stepToward(state, u, home.i);
      }
    }
  }

  function enemyNear(state, f, tileIdx, range) {
    var foundEnemy = false;
    S.inRange(state, tileIdx, range, function (i) {
      var t = state.tiles[i];
      if (t.units.length) {
        var uf = state.units[t.units[0]].f;
        if (uf !== f.id && f.atWar[state.factions[uf].key]) foundEnemy = true;
      }
    });
    return foundEnemy;
  }

  function nearestSalvage(state, f, fromIdx) {
    var bestI = -1, bestD = Infinity;
    for (var i = 0; i < state.tiles.length; i++) {
      var t = state.tiles[i];
      if (!t.site) continue;
      var s = D().SITES[t.site];
      if (!s.salvage) continue;
      if (t.owner !== -1 && t.owner !== f.id) continue;
      var d = ASH.worldgen.distT(state, fromIdx, i);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    return bestI;
  }

  function stackPower(state, fid, tileIdx) {
    var t = state.tiles[tileIdx], p = 0;
    for (var i = 0; i < t.units.length; i++) {
      var u = state.units[t.units[i]];
      if (u.f === fid && u.moves > 0) p += S.unitAtk(state, u) * (u.hp / 100);
    }
    return p;
  }
  function defenderPower(state, tileIdx) {
    var t = state.tiles[tileIdx], p = 0;
    var mult = C.defenceMultiplier(state, t);
    for (var i = 0; i < t.units.length; i++) {
      var u = state.units[t.units[i]];
      p += S.unitDefence(state, u) * (u.hp / 100);
    }
    if (t.settlement && t.owner >= 0) p += C.garrisonStrength(state, t);
    return p * mult;
  }

  /* ---------------- the whole turn ---------------- */
  function takeTurn(state, f) {
    if (!f.alive) return;
    pickResearch(state, f);
    tryBuild(state, f);
    tryRecruit(state, f);
    tryExpand(state, f);
    considerWar(state, f);
    unitOrders(state, f);
    ASH.events.aiTick(state, f);
  }

  return { takeTurn: takeTurn, scoreSettleSite: scoreSettleSite,
           stackPower: stackPower, defenderPower: defenderPower,
           bordersWith: bordersWith };
})();

if (typeof module !== "undefined" && module.exports) module.exports = ASH;
