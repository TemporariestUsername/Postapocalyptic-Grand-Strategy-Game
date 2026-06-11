/* ASHFALL — turn.js
 * The end-of-season pipeline: rivals act, storms walk, everyone eats or
 * doesn't, the Beacon ticks, victory and ruin are checked. Also save/load.
 */
"use strict";
var ASH = typeof ASH !== "undefined" ? ASH : {};

ASH.turn = (function () {
  var U = ASH.util, R = ASH.rng, S = ASH.sim;
  function D() { return ASH.data; }

  function seasonOf(state) { return D().SEASONS[(state.turn - 1) % 4]; }
  function yearOf(state) { return 87 + Math.floor((state.turn - 1) / 4); }

  /* ---------------- storms ---------------- */
  function stormTick(state) {
    var B = D().BALANCE;
    /* existing storms drift and fade */
    for (var i = state.storms.length - 1; i >= 0; i--) {
      var st = state.storms[i];
      st.ttl--;
      if (st.ttl <= 0) { state.storms.splice(i, 1); continue; }
      var ns = state.adj[st.tile];
      st.tile = ns[R.int(state, 0, ns.length - 1)];
    }
    /* new weather */
    var season = seasonOf(state);
    var chance = season.stormChance * D().DIFFICULTY[state.difficulty].harsh;
    if (R.chance(state, chance) && state.storms.length < 3) {
      var tile = R.int(state, 0, state.tiles.length - 1);
      if (state.tiles[tile].terrain !== "water") {
        state.storms.push({ tile: tile, r: R.int(state, 1, 2), ttl: R.int(state, 2, 4) });
        if (state.visible && state.visible[tile])
          S.log(state, "An ash storm comes down off the high wastes — a brown wall a mile tall, eating the horizon.", "bad");
      }
    }
    /* storms hurt whatever they cover */
    U.each(state.units, function (u) {
      if (S.stormAt(state, u.tile)) {
        u.hp -= B.stormDamage;
        if (u.hp <= 0) {
          var f = state.factions[u.f];
          f.stats.losses++;
          if (f.isPlayer) S.log(state, "A warband is lost in the storm. Searchers find only their flag, planted upright in the drift.", "bad", f.id);
          S.removeUnit(state, u.id);
        }
      }
    });
    for (i = 0; i < state.tiles.length; i++) {
      var t = state.tiles[i];
      if (t.settlement && S.stormAt(state, i) && t.owner >= 0) {
        var f2 = state.factions[t.owner];
        f2.res.food = Math.max(0, f2.res.food - B.stormFoodTax);
      }
    }
  }

  /* ---------------- elimination ---------------- */
  function checkEliminations(state) {
    for (var i = 0; i < state.factions.length; i++) {
      var f = state.factions[i];
      if (!f.alive) continue;
      var setts = S.settlementsOf(state, f.id);
      if (setts.length === 0) {
        f.alive = false;
        var us = S.unitsOf(state, f.id);
        for (var k = 0; k < us.length; k++) S.removeUnit(state, us[k].id);
        for (k = 0; k < state.tiles.length; k++)
          if (state.tiles[k].owner === f.id) state.tiles[k].owner = -1;
        S.log(state, f.name + " are no more. Their name joins the long list the wind keeps.", "war");
      }
    }
  }

  /* ---------------- the Beacon ---------------- */
  function beaconTick(state) {
    var b = state.beacon;
    if (b.faction < 0) return;
    var f = state.factions[b.faction];
    var tile = state.tiles[b.tile];
    if (!f.alive || tile.owner !== f.id) {
      b.faction = -1; b.progress = 0;
      S.log(state, "The Kindling fails — the scaffolds stand abandoned against the sky.", "bad");
      return;
    }
    var crewed = false;
    for (var i = 0; i < tile.units.length; i++)
      if (state.units[tile.units[i]].f === f.id) crewed = true;
    if (crewed) {
      b.progress++;
      var left = D().BEACON.turns - b.progress;
      if (f.isPlayer && left > 0)
        S.log(state, "The Kindling: stage " + b.progress + " of " + D().BEACON.turns + ". The spire hums a little louder.", "system", f.id);
      if (b.progress >= D().BEACON.turns) {
        gameOver(state, f, true, "beacon");
      }
    } else if (f.isPlayer) {
      S.log(state, "No crew on the Beacon — the Kindling waits. It has waited eighty years; it can wait for you.", "info", f.id);
    }
  }

  /* ---------------- endings ---------------- */
  function scoreOf(state, f) {
    var setts = S.settlementsOf(state, f.id);
    var pop = 0;
    for (var i = 0; i < setts.length; i++) pop += setts[i].settlement.pop;
    return setts.length * 15 + pop * 2 + f.techs.length * 10 +
           f.stats.battlesWon * 5 + f.stats.salvaged * 3 + state.turn;
  }

  function gameOver(state, f, win, kind) {
    if (state.over) return;
    state.over = {
      win: win, kind: kind, faction: f ? f.id : -1, turn: state.turn,
      year: yearOf(state), score: f ? scoreOf(state, f) + (win ? 100 : 0) : 0
    };
    var lines = {
      beacon: f ? f.name + " kindle the Beacon. After eighty years of static, the sky answers." : "",
      dominion: f ? "The wasteland has one name on its maps now: " + f.name + "." : "",
      lastman: f ? "Of all the banners raised since the Fall, only " + f.name + "'s still flies." : "",
      overrun: "Your last walls are down. The wind moves in.",
      collapse: "Hope gave out before the food did. Your people scatter into the grey.",
      conquered: "Your banner is carried off as a trophy. History will be written by someone else."
    };
    S.log(state, lines[kind] || "It ends.", win ? "good" : "bad");
  }

  function checkVictory(state) {
    if (state.over) return;
    var B = D().BALANCE;
    var player = state.factions[0];

    /* player ruin */
    if (!player.alive) { gameOver(state, player, false, "overrun"); return; }
    if (player.hope <= 0) {
      player.alive = false;
      gameOver(state, player, false, "collapse");
      return;
    }

    /* dominion or last-standing — for anyone */
    var aliveCount = 0, lastAlive = null;
    for (var i = 0; i < state.factions.length; i++) {
      var f = state.factions[i];
      if (!f.alive) continue;
      aliveCount++; lastAlive = f;
      var setts = S.settlementsOf(state, f.id).length;
      if (setts >= B.dominionMin && S.shareOfSettlements(state, f.id) >= B.dominionFrac) {
        gameOver(state, f, f.isPlayer, f.isPlayer ? "dominion" : "conquered");
        return;
      }
    }
    if (aliveCount === 1 && lastAlive) {
      gameOver(state, lastAlive, lastAlive.isPlayer, lastAlive.isPlayer ? "lastman" : "conquered");
    }
  }

  /* ---------------- end of season ---------------- */
  function endTurn(state) {
    if (state.over) return;
    var i, f;

    /* rivals act */
    for (i = 1; i < state.factions.length; i++) {
      f = state.factions[i];
      if (f.alive) ASH.ai.takeTurn(state, f);
    }

    /* the world acts */
    stormTick(state);
    for (i = 0; i < state.factions.length; i++) {
      f = state.factions[i];
      if (!f.alive) continue;
      S.radTick(state, f);
      S.healTick(state, f);
      S.economyTick(state, f);
    }

    checkEliminations(state);
    beaconTick(state);
    checkVictory(state);
    if (state.over) return;

    /* a new season */
    state.turn++;
    for (i = 0; i < state.factions.length; i++) {
      f = state.factions[i];
      if (f.alive) S.refreshMoves(state, f);
    }
    S.recomputeVision(state);

    var season = seasonOf(state);
    S.log(state, "— " + season.name + ", Year " + yearOf(state) + " After. " + season.banner, "season");

    /* the player's own drama */
    var ev = ASH.events.drawForPlayer(state);
    if (ev) state.pendingEvents.push(ev);

    checkVictory(state);
  }

  /* ---------------- save / load ---------------- */
  function serialize(state) {
    /* adj and visible are derived — strip them to keep saves lean */
    var copy = {};
    for (var k in state) {
      if (k === "adj" || k === "visible") continue;
      copy[k] = state[k];
    }
    return JSON.stringify(copy);
  }

  function deserialize(json) {
    var state = JSON.parse(json);
    if (!state || state.v !== 1) return null;
    state.adj = ASH.worldgen.buildAdj(state.w, state.h);
    S.recomputeVision(state);
    return state;
  }

  return { endTurn: endTurn, seasonOf: seasonOf, yearOf: yearOf, scoreOf: scoreOf,
           serialize: serialize, deserialize: deserialize, gameOver: gameOver,
           checkVictory: checkVictory };
})();

if (typeof module !== "undefined" && module.exports) module.exports = ASH;
