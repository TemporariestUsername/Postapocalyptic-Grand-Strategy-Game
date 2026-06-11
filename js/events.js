/* ASHFALL — events.js
 * The narrative event engine. Draws from the deck in data.js, gates by
 * condition/cooldown, applies declarative effects. The player resolves
 * events through the UI; AI factions resolve them by weighted choice.
 */
"use strict";
var ASH = typeof ASH !== "undefined" ? ASH : {};

ASH.events = (function () {
  var U = ASH.util, R = ASH.rng, S = ASH.sim;
  function D() { return ASH.data; }

  function eligible(state, f) {
    var out = [];
    var deck = D().EVENTS;
    for (var i = 0; i < deck.length; i++) {
      var ev = deck[i];
      if (f.usedOnce[ev.id]) continue;
      if ((f.eventCooldowns[ev.id] || 0) > state.turn) continue;
      if (ev.cond && !safeCond(ev, state, f)) continue;
      out.push(ev);
    }
    return out;
  }

  function safeCond(ev, state, f) {
    try { return !!ev.cond(state, f); }
    catch (e) { return false; }
  }

  function weightOf(ev, state, f) {
    var w = (typeof ev.weight === "function") ? ev.weight(state, f) : (ev.weight || 1);
    if (ev.harsh) w *= D().DIFFICULTY[state.difficulty].harsh;
    return Math.max(0, w);
  }

  /* Draw one event for the faction, or null. */
  function draw(state, f) {
    if (!R.chance(state, D().BALANCE.eventChance)) return null;
    var pool = eligible(state, f);
    if (!pool.length) return null;
    var total = 0, i;
    for (i = 0; i < pool.length; i++) total += weightOf(pool[i], state, f);
    if (total <= 0) return null;
    var roll = R.next(state) * total;
    for (i = 0; i < pool.length; i++) {
      roll -= weightOf(pool[i], state, f);
      if (roll <= 0) break;
    }
    var ev = pool[Math.min(i, pool.length - 1)];
    f.eventCooldowns[ev.id] = state.turn + (ev.cooldown || 8);
    if (ev.once) f.usedOnce[ev.id] = true;
    return ev;
  }

  /* Can the faction afford / satisfy a choice? */
  function choiceAvailable(state, f, choice) {
    if (choice.req) {
      if (choice.req.tech && !S.hasTech(f, choice.req.tech)) return false;
      if (choice.req.building && !D().helpers.hasBuilding(state, f, choice.req.building)) return false;
    }
    var fx = choice.effects || {};
    if (fx.res) {
      var ok = true;
      U.each(fx.res, function (v, k) {
        if (v < 0 && (f.res[k] || 0) + v < 0) ok = false;
      });
      if (!ok) return false;
    }
    return true;
  }

  /* Apply a choice's declarative effects. Returns lines describing concrete
   * outcomes (for the UI to show under the result prose). */
  function applyEffects(state, f, effects) {
    var fx = effects || {};
    var notes = [];
    if (fx.res) U.each(fx.res, function (v, k) {
      f.res[k] = Math.max(0, Math.round(((f.res[k] || 0) + v) * 10) / 10);
      notes.push(U.signed(v) + " " + resName(k));
    });
    if (fx.know) { f.res.know = Math.round((f.res.know + fx.know) * 10) / 10; notes.push(U.signed(fx.know) + " knowledge"); }
    if (fx.hope) { f.hope = U.clamp(f.hope + fx.hope, 0, 100); notes.push(U.signed(fx.hope) + " hope"); }
    if (fx.pop) {
      var setts = S.settlementsOf(state, f.id);
      if (setts.length) {
        var target = U.best(setts, function (t) { return fx.pop > 0 ? t.settlement.pop : -t.settlement.pop; });
        target.settlement.pop = Math.max(1, target.settlement.pop + fx.pop);
        notes.push(U.signed(fx.pop * 20) + " souls in " + target.settlement.name);
      }
    }
    if (fx.spawn) {
      for (var i = 0; i < (fx.spawn.count || 1); i++) {
        if (f.capital >= 0 && state.tiles[f.capital].owner === f.id)
          S.spawnUnit(state, f.id, fx.spawn.type, f.capital);
      }
      notes.push("+" + (fx.spawn.count || 1) + " " + D().UNITS[fx.spawn.type].name.toLowerCase());
    }
    if (fx.damageUnits) {
      var us = S.unitsOf(state, f.id);
      for (i = 0; i < Math.min(fx.damageUnits.count || 1, us.length); i++) {
        var u = us[us.length - 1 - i];
        u.hp = Math.max(1, u.hp - fx.damageUnits.amount);
      }
      if (us.length) notes.push("warbands weakened");
    }
    if (fx.rel) U.each(fx.rel, function (v, k) {
      S.relShift(state, f, k, v);
      notes.push(U.signed(v) + " standing with " + factionName(state, k));
    });
    if (fx.relAll !== undefined) {
      for (i = 0; i < state.factions.length; i++) {
        if (state.factions[i].id !== f.id) S.relShift(state, f, state.factions[i].key, fx.relAll);
      }
      notes.push(U.signed(fx.relAll) + " standing with all");
    }
    if (fx.tech) {
      if (f.research) {
        f.research.progress += fx.tech;
        notes.push("+" + fx.tech + " research");
      } else {
        f.res.know = Math.round((f.res.know + fx.tech) * 10) / 10;
        notes.push("+" + fx.tech + " knowledge");
      }
    }
    if (fx.flagged) f.flags[fx.flagged] = true;
    S.recomputeVision(state);
    return notes;
  }

  function resName(k) {
    return { food: "food", scrap: "scrap", fuel: "fuel", meds: "medicine", know: "knowledge" }[k] || k;
  }
  function factionName(state, key) {
    for (var i = 0; i < state.factions.length; i++)
      if (state.factions[i].key === key) return state.factions[i].name;
    return key;
  }

  /* Resolve for the player: returns a pending-event record for the UI. */
  function drawForPlayer(state) {
    var f = state.factions[0];
    if (!f || !f.alive) return null;
    var ev = draw(state, f);
    if (!ev) return null;
    /* Special-case: a purifier trivialises black rain. */
    if (ev.id === "blackrain" && D().helpers.hasBuilding(state, f, "purifier")) {
      S.log(state, ev.purifierNote, "good", f.id);
      return null;
    }
    return { id: ev.id };
  }

  function byId(id) {
    var deck = D().EVENTS;
    for (var i = 0; i < deck.length; i++) if (deck[i].id === id) return deck[i];
    return null;
  }

  /* Resolve the player's pending event with the chosen index. */
  function resolve(state, eventId, choiceIdx) {
    var ev = byId(eventId);
    var f = state.factions[0];
    if (!ev || !f) return null;
    var choice = ev.choices[choiceIdx];
    if (!choice || !choiceAvailable(state, f, choice)) return null;
    var notes = applyEffects(state, f, choice.effects);
    S.log(state, ev.title + " — " + choice.label, "event", f.id);
    return { result: choice.result, notes: notes };
  }

  /* AI factions quietly live through their own dramas. */
  function aiTick(state, f) {
    var ev = draw(state, f);
    if (!ev) return;
    var bestC = null, bestW = -1;
    for (var i = 0; i < ev.choices.length; i++) {
      var c = ev.choices[i];
      if (!choiceAvailable(state, f, c)) continue;
      var w = (c.aiScore || 1) * (0.75 + R.next(state) * 0.5);
      if (w > bestW) { bestW = w; bestC = c; }
    }
    if (bestC) applyEffects(state, f, bestC.effects);
  }

  return { draw: draw, drawForPlayer: drawForPlayer, resolve: resolve, byId: byId,
           aiTick: aiTick, applyEffects: applyEffects, choiceAvailable: choiceAvailable,
           eligible: eligible };
})();

if (typeof module !== "undefined" && module.exports) module.exports = ASH;
