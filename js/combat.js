/* ASHFALL — combat.js
 * Battles between unit stacks on adjacent hexes. Attacks are resolved
 * immediately: a few rounds of weighted dice, casualties on both sides,
 * capture of ground and settlements when defenders break.
 */
"use strict";
var ASH = typeof ASH !== "undefined" ? ASH : {};

ASH.combat = (function () {
  var U = ASH.util, R = ASH.rng, S = ASH.sim;
  function D() { return ASH.data; }

  function stackOf(state, tileIdx) {
    var t = state.tiles[tileIdx], out = [];
    for (var i = 0; i < t.units.length; i++) out.push(state.units[t.units[i]]);
    return out;
  }

  /* Innate garrison: a settlement's people fight even with no warband home. */
  function garrisonStrength(state, tile) {
    if (!tile.settlement) return 0;
    var s = tile.settlement.pop * 0.35 + 1.5;
    if (tile.settlement.buildings.indexOf("barracks") !== -1) s += 2;
    return s;
  }

  function defenceMultiplier(state, tile) {
    var m = D().TERRAIN[tile.terrain].def;
    if (tile.settlement) {
      m *= 1.2;
      if (tile.settlement.buildings.indexOf("walls") !== -1) m *= 1.6;
    }
    return m;
  }

  function canAttack(state, fid, fromIdx, targetIdx) {
    if (state.adj[fromIdx].indexOf(targetIdx) === -1) return false;
    var atk = stackOf(state, fromIdx).filter(function (u) { return u.f === fid && u.moves > 0; });
    if (!atk.length) return false;
    var t = state.tiles[targetIdx];
    var defFid = t.units.length ? state.units[t.units[0]].f : (t.settlement ? t.owner : -1);
    if (defFid === -1 || defFid === fid) return false;
    if (D().TERRAIN[t.terrain].move === 0) return false;
    return defFid;
  }

  /* Resolve an assault from fromIdx onto targetIdx by faction fid.
   * Returns a report object for UI/log, or null if illegal. */
  function attack(state, fid, fromIdx, targetIdx) {
    var defFid = canAttack(state, fid, fromIdx, targetIdx);
    if (defFid === false) return null;

    var attacker = state.factions[fid];
    var defender = state.factions[defFid];
    if (!attacker.atWar[defender.key]) S.declareWar(state, attacker, defender);

    var tile = state.tiles[targetIdx];
    var atkUnits = stackOf(state, fromIdx).filter(function (u) { return u.f === fid && u.moves > 0; });
    var defUnits = stackOf(state, targetIdx);

    var defMult = defenceMultiplier(state, tile);
    var garrison = (tile.owner === defFid) ? garrisonStrength(state, tile) : 0;
    var rounds = D().BALANCE.battleRounds;
    var report = {
      attacker: fid, defender: defFid, tile: targetIdx, from: fromIdx,
      atkLossHp: 0, defLossHp: 0, atkDead: 0, defDead: 0,
      captured: false, settlement: tile.settlement ? tile.settlement.name : null,
      garrisonBroken: false
    };

    function alive(units) {
      return units.filter(function (u) { return state.units[u.id] && u.hp > 0; });
    }

    for (var round = 0; round < rounds; round++) {
      atkUnits = alive(atkUnits);
      defUnits = alive(defUnits);
      var atkStr = 0, defStr = garrison * defMult;
      for (var i = 0; i < atkUnits.length; i++)
        atkStr += S.unitAtk(state, atkUnits[i]) * (atkUnits[i].hp / 100);
      for (i = 0; i < defUnits.length; i++)
        defStr += S.unitDefence(state, defUnits[i]) * (defUnits[i].hp / 100) * defMult;
      if (atkStr <= 0 || (defStr <= 0 && !defUnits.length && garrison <= 0)) break;

      atkStr *= R.range(state, 0.85, 1.2);
      defStr *= R.range(state, 0.85, 1.2);
      var total = atkStr + defStr;
      if (total <= 0) break;

      /* damage dealt is proportional to the opponent's share of force */
      var dmgToDef = Math.round(26 * (atkStr / total) * 2);
      var dmgToAtk = Math.round(26 * (defStr / total) * 2);

      report.defLossHp += dealDamage(state, defUnits, dmgToDef, defender, report, "def");
      if (garrison > 0) {
        garrison = Math.max(0, garrison - dmgToDef * 0.05);
        if (garrison <= 0) report.garrisonBroken = true;
      }
      report.atkLossHp += dealDamage(state, atkUnits, dmgToAtk, attacker, report, "atk");

      atkUnits = alive(atkUnits);
      defUnits = alive(defUnits);
      if (!atkUnits.length || (!defUnits.length && garrison <= 0)) break;
    }

    /* spend the attackers' season */
    atkUnits = alive(atkUnits);
    for (i = 0; i < atkUnits.length; i++) atkUnits[i].moves = 0;

    var defendersGone = !alive(defUnits).length && garrison <= 0;
    if (defendersGone && atkUnits.length) {
      report.captured = true;
      captureTile(state, attacker, defender, tile, atkUnits[0]);
    }

    attacker.stats[report.captured ? "battlesWon" : (defendersGone ? "battlesWon" : "battlesLost")]++;
    defender.stats[defendersGone ? "battlesLost" : "battlesWon"]++;

    logBattle(state, attacker, defender, tile, report);
    S.recomputeVision(state);
    return report;
  }

  function dealDamage(state, units, dmg, faction, report, side) {
    if (!units.length || dmg <= 0) return 0;
    var dealt = 0;
    /* spread, weighted toward the front (first units soak more) */
    var share = dmg / units.length;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      var hit = Math.round(share * (i === 0 ? 1.4 : 1));
      var real = Math.min(u.hp, hit);
      u.hp -= real;
      dealt += real;
      if (u.hp <= 0) {
        report[side === "def" ? "defDead" : "atkDead"]++;
        faction.stats.losses++;
        S.removeUnit(state, u.id);
      }
    }
    return dealt;
  }

  function captureTile(state, attacker, defender, tile, occupier) {
    var wasCapital = tile.settlement && tile.settlement.isCapital;
    tile.owner = attacker.id;
    if (tile.settlement) {
      var s = tile.settlement;
      s.pop = Math.max(1, s.pop - Math.ceil(s.pop * 0.25)); // a quarter flee or fall
      s.isCapital = false;
      s.queue = null;
      attacker.stats.captured++;
      attacker.res.scrap += 5;
      attacker.hope = U.clamp(attacker.hope + 6, 0, 100);
      defender.hope = U.clamp(defender.hope - (wasCapital ? D().BALANCE.capitalFallHope : 8), 0, 100);
      /* claim the ring around a taken settlement */
      var ns = state.adj[tile.i];
      for (var k = 0; k < ns.length; k++) {
        var nt = state.tiles[ns[k]];
        if (nt.owner === defender.id && !nt.settlement) nt.owner = attacker.id;
      }
      if (wasCapital) {
        /* the court moves; a surviving settlement becomes the new capital */
        var rest = S.settlementsOf(state, defender.id);
        if (rest.length) {
          rest[0].settlement.isCapital = true;
          defender.capital = rest[0].i;
          S.log(state, defender.name + " fall back. Their banner now flies over " + rest[0].settlement.name + ", lower than before.", "war", defender.id);
        }
      }
    }
    /* the victors move in */
    if (occupier) {
      var from = state.tiles[occupier.tile];
      var idx = from.units.indexOf(occupier.id);
      if (idx !== -1) from.units.splice(idx, 1);
      occupier.tile = tile.i;
      tile.units.push(occupier.id);
    }
  }

  function logBattle(state, attacker, defender, tile, report) {
    var where = report.settlement ? report.settlement : D().TERRAIN[tile.terrain].name.toLowerCase();
    var line;
    if (report.captured && report.settlement) {
      line = attacker.name + " storm " + report.settlement + ". The gate is matchwood; the banner comes down; " + defender.name + " count their dead.";
    } else if (report.captured) {
      line = attacker.name + " sweep " + defender.name + " from the " + where + ".";
    } else if (report.atkDead > report.defDead) {
      line = attacker.name + " break against " + (report.settlement || "the " + where) + " and reel back, leaving " + report.atkDead + " warband" + (report.atkDead === 1 ? "" : "s") + " in the dust.";
    } else {
      line = "Blood in the " + where + ": " + attacker.name + " and " + defender.name + " trade losses and hate.";
    }
    S.log(state, line, "battle");
  }

  return { attack: attack, canAttack: canAttack, garrisonStrength: garrisonStrength,
           defenceMultiplier: defenceMultiplier, stackOf: stackOf };
})();

if (typeof module !== "undefined" && module.exports) module.exports = ASH;
