/* ASHFALL — ui.js
 * The DOM chrome around the map: top bar, side panel, log, modals, toasts,
 * tooltips, the season banner. Renders from the controller in main.js and
 * calls back into it for every action.
 */
"use strict";
var ASH = typeof ASH !== "undefined" ? ASH : {};

ASH.ui = (function () {
  var U = ASH.util, S = ASH.sim;
  function D() { return ASH.data; }
  var ctrl = null;
  var $ = function (id) { return document.getElementById(id); };

  var RES_LABELS = { food: "FOOD", scrap: "SCRP", fuel: "FUEL", meds: "MEDS", know: "KNOW" };
  var RES_ORDER = ["food", "scrap", "fuel", "meds", "know"];

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* ============================ top bar ============================ */
  function renderTop() {
    var st = ctrl.state;
    var f = st.factions[0];
    var inc = S.factionIncome(st, f);
    var html = "";
    RES_ORDER.forEach(function (k) {
      var net = inc.net[k];
      var warn = (k === "food" && net < 0) ? " res-warn" : "";
      html += '<div class="res' + warn + '" data-tip="' + resTip(k, inc) + '">' +
        '<span class="res-label res-' + k + '">' + RES_LABELS[k] + '</span>' +
        '<span class="res-val">' + Math.floor(f.res[k]) + '</span>' +
        '<span class="res-net ' + (net >= 0 ? "pos" : "neg") + '">' + U.signed(net) + '</span></div>';
    });
    $("resources").innerHTML = html;

    var hopeCls = f.hope > 55 ? "good" : (f.hope > 25 ? "mid" : "bad");
    $("top-hope").innerHTML =
      '<div class="hope-label" data-tip="Hope is your people\'s will to continue. At zero, the run ends.">HOPE</div>' +
      '<div class="hope-bar"><div class="hope-fill ' + hopeCls + '" style="width:' + f.hope + '%"></div></div>' +
      '<div class="hope-num">' + Math.round(f.hope) + '</div>';

    var season = ASH.turn.seasonOf(st);
    $("top-season").innerHTML =
      '<div class="season-name">' + season.name.toUpperCase() + '</div>' +
      '<div class="season-year">Year ' + ASH.turn.yearOf(st) + ' After</div>';

    $("top-fname").textContent = f.name;
    $("top-leader").textContent = f.leader;
    var sc = $("top-sigil");
    var c = sc.getContext("2d");
    c.clearRect(0, 0, sc.width, sc.height);
    ASH.render.drawSigil(c, f.key, 14, 14, 10, f.color);
  }

  function resTip(k, inc) {
    var names = { food: "Food — your people eat it every season. Run out and they starve.",
      scrap: "Scrap — currency, construction, upkeep. The wasteland's bones.",
      fuel: "Fuel — engines, stills, the Beacon. Hard to come by.",
      meds: "Medicine — heals warbands, answers plagues.",
      know: "Knowledge — drives Remembrance research." };
    return esc(names[k] + " (" + U.fmt1(inc.prod[k]) + " in, " + U.fmt1(inc.upkeep[k]) + " out)");
  }

  /* ============================ side panel ============================ */
  function renderSide() {
    var st = ctrl.state;
    var sideEl = $("side-panel");
    var i = ctrl.sel.tile;
    if (i < 0) { sideEl.innerHTML = overviewHtml(); wireOverview(sideEl); return; }
    var t = st.tiles[i];
    var html = tileHeaderHtml(t);
    if (t.settlement && t.owner === 0) html += settlementHtml(t);
    else if (t.settlement && t.explored) html += foreignSettlementHtml(t);
    if (t.site === "beacon") html += beaconHtml(t);
    html += unitsHtml(t);
    sideEl.innerHTML = html;
    wireSide(sideEl, t);
  }

  function tileHeaderHtml(t) {
    var st = ctrl.state;
    if (!t.explored) return '<div class="panel-block"><div class="panel-title">UNCHARTED</div><div class="muted">The maps say nothing. The maps are honest.</div></div>';
    var ter = D().TERRAIN[t.terrain];
    var ownerName = t.owner >= 0 ? st.factions[t.owner].name : "No one";
    var ownerCol = t.owner >= 0 ? st.factions[t.owner].color : "#777";
    var h = '<div class="panel-block">' +
      '<div class="panel-title">' + ter.name.toUpperCase() + '</div>' +
      '<div class="flavor">' + esc(ter.blurb) + '</div>' +
      '<div class="kv"><span>Held by</span><b style="color:' + ownerCol + '">' + esc(ownerName) + '</b></div>';
    if (t.rad > 0) h += '<div class="kv warn"><span>Radiation</span><b>' + "▲".repeat(t.rad) + '</b></div>';
    if (S.stormAt(st, t.i)) h += '<div class="kv warn"><span>Weather</span><b>ASH STORM</b></div>';
    if (t.site && t.site !== "beacon") {
      var site = D().SITES[t.site];
      h += '<div class="kv"><span>Site</span><b>' + esc(site.name) + '</b></div><div class="flavor">' + esc(site.blurb) + '</div>';
    }
    h += '</div>';
    return h;
  }

  function settlementHtml(t) {
    var st = ctrl.state, f = st.factions[0];
    var s = t.settlement;
    var y = S.yieldsOf(st, t);
    var h = '<div class="panel-block">' +
      '<div class="panel-title set-name">' + esc(s.name) + (s.isCapital ? ' <span class="capital-mark">✦ CAPITAL</span>' : '') + '</div>' +
      '<div class="kv"><span>Souls</span><b>' + (s.pop * 20) + '</b></div>' +
      '<div class="kv"><span>Yields</span><b>' + yieldStr(y) + '</b></div>';
    /* buildings */
    h += '<div class="sub-title">STRUCTURES (' + s.buildings.length + '/' + S.maxBuildingsFor(f) + ')</div>';
    if (!s.buildings.length) h += '<div class="muted">Bare ground and intentions.</div>';
    s.buildings.forEach(function (bk) {
      var b = D().BUILDINGS[bk];
      h += '<div class="b-row" data-tip="' + esc(b.blurb) + '"><b>' + b.name + '</b><span class="muted">' + esc(b.effectDesc) + '</span></div>';
    });
    if (s.queue) {
      var b2 = D().BUILDINGS[s.queue.key];
      h += '<div class="b-row building"><b>' + b2.name + '</b><span>' + s.queue.left + ' season' + (s.queue.left > 1 ? 's' : '') + ' left</span></div>';
    }
    /* build menu — other banners' signature works are not offered */
    h += '<div class="sub-title">BUILD</div><div class="btn-grid">';
    U.each(D().BUILDINGS, function (b, key) {
      if (s.buildings.indexOf(key) !== -1) return;
      if (b.faction && b.faction !== f.key) return;
      var can = S.canBuild(st, f, t, key);
      var dis = can !== true ? ' disabled data-why="' + esc(can) + '"' : '';
      h += '<button class="act build-btn' + (b.faction ? ' unique' : '') + '" data-key="' + key + '"' + dis +
        ' data-tip="' + esc(b.blurb + " — " + b.effectDesc) + '">' +
        b.name + '<span class="cost">' + costStr(b.cost) + ' · ' + b.turns + 's</span></button>';
    });
    h += '</div>';
    /* recruit menu */
    h += '<div class="sub-title">MUSTER</div><div class="btn-grid">';
    U.each(D().UNITS, function (u, key) {
      if (u.faction && u.faction !== f.key) return;
      var can = S.canRecruit(st, f, t, key);
      var dis = can !== true ? ' disabled data-why="' + esc(can) + '"' : '';
      h += '<button class="act recruit-btn' + (u.faction ? ' unique' : '') + '" data-key="' + key + '"' + dis +
        ' data-tip="' + esc(u.blurb) + '">' + u.name +
        '<span class="cost">' + costStr(u.cost) + ' · ' + u.popCost * 20 + ' souls</span></button>';
    });
    h += '</div></div>';
    return h;
  }

  function foreignSettlementHtml(t) {
    var st = ctrl.state;
    var s = t.settlement;
    var f = st.factions[t.owner];
    return '<div class="panel-block"><div class="panel-title" style="color:' + f.color + '">' +
      esc(s.name) + (s.isCapital ? ' ✦' : '') + '</div>' +
      '<div class="kv"><span>Souls</span><b>' + (s.pop * 20) + '</b></div>' +
      '<div class="muted">' + esc(f.name) + " hold this ground." + '</div></div>';
  }

  function beaconHtml(t) {
    var st = ctrl.state, f = st.factions[0];
    var b = st.beacon;
    var h = '<div class="panel-block beacon-block"><div class="panel-title">THE BEACON</div>' +
      '<div class="flavor">' + esc(D().SITES.beacon.blurb) + '</div>';
    if (b.faction === 0) {
      h += '<div class="kv"><span>The Kindling</span><b>' + b.progress + ' / ' + D().BEACON.turns + '</b></div>' +
        '<div class="muted">Keep a warband on this hex each season. Guard it with everything.</div>';
    } else {
      var can = S.canKindle(st, f);
      if (can === true) {
        h += '<button class="act primary" id="btn-kindle">BEGIN THE KINDLING<span class="cost">' + costStr(D().BEACON.cost) + ' · ' + D().BEACON.turns + ' seasons crewed</span></button>';
      } else {
        h += '<div class="kv warn"><span>Status</span><b>SILENT</b></div><div class="muted">' + esc(can) + '</div>';
      }
    }
    h += '</div>';
    return h;
  }

  function unitsHtml(t) {
    var st = ctrl.state;
    if (!t.units.length || (st.visible && !st.visible[t.i] && t.owner !== 0)) return "";
    var h = '<div class="panel-block"><div class="sub-title">WARBANDS HERE</div>';
    for (var k = 0; k < t.units.length; k++) {
      var u = st.units[t.units[k]];
      if (!u) continue;
      var f = st.factions[u.f];
      var def = D().UNITS[u.type];
      var mine = u.f === 0;
      var selCls = ctrl.sel.units.indexOf(u.id) !== -1 ? " selected" : "";
      h += '<div class="unit-card' + selCls + '" data-uid="' + u.id + '">' +
        '<div class="unit-head"><b style="color:' + f.color + '">' + def.name + '</b>' +
        '<span class="muted">' + (mine ? (u.moves > 0 ? u.moves + " mv" : "spent") : esc(f.name)) + '</span></div>' +
        '<div class="hp-bar"><div style="width:' + u.hp + '%"></div></div>';
      if (mine && ctrl.sel.units.indexOf(u.id) !== -1) {
        h += '<div class="unit-actions">';
        if (S.canSalvage(st, u.id)) h += '<button class="act small u-act" data-act="salvage" data-uid="' + u.id + '">SALVAGE</button>';
        if (S.canPillage(st, u.id)) h += '<button class="act small u-act" data-act="pillage" data-uid="' + u.id + '">PILLAGE</button>';
        if (S.canClaim(st, u.id)) h += '<button class="act small u-act" data-act="claim" data-uid="' + u.id + '" data-tip="Claim this hex for your people (2 scrap, ends the warband\'s season).">CLAIM HEX</button>';
        if (S.canFound(st, u.id)) h += '<button class="act small primary u-act" data-act="found" data-uid="' + u.id + '">FOUND SETTLEMENT</button>';
        h += '<button class="act small dim u-act" data-act="disband" data-uid="' + u.id + '">DISBAND</button>';
        h += '</div>';
      }
      h += '</div>';
    }
    h += '<div class="muted hint">Click a lit hex to march. Red-ringed hexes: attack.</div></div>';
    return h;
  }

  function overviewHtml() {
    var st = ctrl.state, f = st.factions[0];
    var setts = S.settlementsOf(st, 0);
    var units = S.unitsOf(st, 0);
    var share = Math.round(S.shareOfSettlements(st, 0) * 100);
    var h = '<div class="panel-block"><div class="panel-title">' + esc(f.name.toUpperCase()) + '</div>' +
      '<div class="flavor">' + esc(S.factionDef(f).blurb) + '</div>' +
      '<div class="kv"><span>' + esc(f.title) + '</span><b>' + esc(f.leader) + '</b></div>' +
      '<div class="kv"><span>Settlements</span><b>' + setts.length + ' (' + share + '% of the living world)</b></div>' +
      '<div class="kv"><span>Warbands</span><b>' + units.length + '</b></div>';
    if (f.research) {
      var tech = S.techByKey(f.research.key);
      h += '<div class="kv"><span>Researching</span><b>' + tech.name + ' ' + Math.floor(f.research.progress) + '/' + S.techCostFor(f, tech) + '</b></div>';
    } else {
      h += '<div class="kv warn"><span>Researching</span><b>NOTHING — open Remembrance</b></div>';
    }
    /* the ways of your people */
    var uniques = S.factionDef(f).uniques || [];
    if (uniques.length) {
      h += '<div class="sub-title">THE WAYS OF YOUR PEOPLE</div>';
      uniques.forEach(function (u) {
        h += '<div class="doc-line">' + esc(u) + '</div>';
      });
    }
    if (S.mods(f).sermon) {
      var can = S.canSermon(st, f);
      var dis = can !== true ? ' disabled data-why="' + esc(can) + '"' : '';
      h += '<button class="act primary" id="btn-sermon"' + dis +
        ' data-tip="The Bright Procession: spend ' + D().BALANCE.sermonFood + ' food, gain +' + D().BALANCE.sermonHope + ' hope. Once every ' + D().BALANCE.sermonCooldown + ' seasons.">HOLD SERMON' +
        '<span class="cost">' + D().BALANCE.sermonFood + ' food → +' + D().BALANCE.sermonHope + ' hope</span></button>';
    }
    h += '<div class="sub-title">HOLDINGS</div>';
    setts.forEach(function (t) {
      h += '<div class="b-row link set-link" data-tile="' + t.i + '"><b>' + esc(t.settlement.name) + (t.settlement.isCapital ? ' ✦' : '') + '</b>' +
        '<span class="muted">' + (t.settlement.pop * 20) + ' souls' + (t.settlement.queue ? ' · building' : '') + '</span></div>';
    });
    h += '<div class="sub-title">DOMINION</div><div class="muted">Hold ' + Math.round(D().BALANCE.dominionFrac * 100) +
      '% of all settlements (at least ' + D().BALANCE.dominionMin + '), or kindle the Beacon, or outlast everyone.</div>';
    h += '</div>';
    return h;
  }

  function wireOverview(root) {
    root.querySelectorAll(".set-link").forEach(function (el) {
      el.addEventListener("click", function () {
        var i = parseInt(el.getAttribute("data-tile"), 10);
        ctrl.selectTile(i);
        ASH.render.centerOn(i);
        ASH.audio.sfx("click");
      });
    });
    var sermonBtn = root.querySelector("#btn-sermon");
    if (sermonBtn) sermonBtn.addEventListener("click", function () { ctrl.sermon(); });
  }

  function wireSide(root, t) {
    root.querySelectorAll(".build-btn").forEach(function (el) {
      el.addEventListener("click", function () { ctrl.build(t.i, el.getAttribute("data-key")); });
    });
    root.querySelectorAll(".recruit-btn").forEach(function (el) {
      el.addEventListener("click", function () { ctrl.recruitU(t.i, el.getAttribute("data-key")); });
    });
    root.querySelectorAll(".unit-card").forEach(function (el) {
      el.addEventListener("click", function (e) {
        if (e.target.classList.contains("u-act")) return;
        ctrl.toggleUnit(parseInt(el.getAttribute("data-uid"), 10));
      });
    });
    root.querySelectorAll(".u-act").forEach(function (el) {
      el.addEventListener("click", function () {
        ctrl.unitAction(parseInt(el.getAttribute("data-uid"), 10), el.getAttribute("data-act"));
      });
    });
    var kindle = root.querySelector("#btn-kindle");
    if (kindle) kindle.addEventListener("click", function () { ctrl.kindle(); });
  }

  function yieldStr(y) {
    var parts = [];
    RES_ORDER.forEach(function (k) { if (y[k] > 0.05) parts.push(U.fmt1(y[k]) + " " + k); });
    return parts.join(", ");
  }
  function costStr(cost) {
    var parts = [];
    U.each(cost, function (v, k) { parts.push(v + " " + k); });
    return parts.join(", ");
  }

  /* ============================ log ============================ */
  var lastLogLen = 0;
  function renderLog(force) {
    var st = ctrl.state;
    if (!force && st.log.length === lastLogLen) return;
    lastLogLen = st.log.length;
    var el = $("log-entries");
    var html = "";
    var start = Math.max(0, st.log.length - 80);
    for (var i = start; i < st.log.length; i++) {
      var e = st.log[i];
      html += '<div class="log-line log-' + e.kind + '"><span class="log-turn">' + e.turn + '</span>' + esc(e.text) + '</div>';
    }
    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
  }

  /* ============================ toasts & banner ============================ */
  function toast(text, kind) {
    var root = $("toasts");
    var el = document.createElement("div");
    el.className = "toast toast-" + (kind || "info");
    el.textContent = text;
    root.appendChild(el);
    setTimeout(function () { el.classList.add("show"); }, 16);
    setTimeout(function () {
      el.classList.remove("show");
      setTimeout(function () { el.remove(); }, 500);
    }, 3600);
  }

  function seasonBanner() {
    var st = ctrl.state;
    var season = ASH.turn.seasonOf(st);
    var el = $("season-banner");
    el.innerHTML = '<div class="sb-name">' + season.name.toUpperCase() + '</div>' +
      '<div class="sb-year">Year ' + ASH.turn.yearOf(st) + ' After</div>' +
      '<div class="sb-line">' + esc(season.banner) + '</div>';
    el.classList.remove("hidden");
    el.classList.remove("animate");
    void el.offsetWidth; /* restart animation */
    el.classList.add("animate");
    setTimeout(function () { el.classList.add("hidden"); }, 3500);
  }

  /* ============================ modal manager ============================ */
  function modal(html, opts) {
    var root = $("modal-root");
    root.innerHTML = '<div class="modal-veil"></div><div class="modal' + (opts && opts.wide ? " wide" : "") + '">' + html + '</div>';
    root.classList.remove("hidden");
    if (!opts || !opts.noClose) {
      root.querySelector(".modal-veil").addEventListener("click", closeModal);
    }
    return root.querySelector(".modal");
  }
  function closeModal() {
    $("modal-root").classList.add("hidden");
    $("modal-root").innerHTML = "";
    if (ctrl) ctrl.onModalClosed();
  }
  function modalOpen() { return !$("modal-root").classList.contains("hidden"); }

  /* ---- event modal ---- */
  function showEvent(pe) {
    var st = ctrl.state, f = st.factions[0];
    var ev = ASH.events.byId(pe.id);
    if (!ev) { ctrl.onModalClosed(); return; }
    ASH.audio.stinger("event");
    var h = '<div class="ev-kicker">' + ASH.turn.seasonOf(st).name + ', Year ' + ASH.turn.yearOf(st) + '</div>' +
      '<h2 class="ev-title">' + esc(ev.title) + '</h2>' +
      '<div class="ev-text">' + esc(ev.text) + '</div><div class="ev-choices">';
    ev.choices.forEach(function (c, idx) {
      var ok = ASH.events.choiceAvailable(st, f, c);
      h += '<button class="ev-choice" data-idx="' + idx + '"' + (ok ? '' : ' disabled') + '>' +
        esc(c.label) + (ok ? '' : ' <span class="cost">(beyond your means)</span>') + '</button>';
    });
    h += '</div>';
    var m = modal(h, { noClose: true });
    m.querySelectorAll(".ev-choice").forEach(function (el) {
      el.addEventListener("click", function () {
        var idx = parseInt(el.getAttribute("data-idx"), 10);
        var out = ASH.events.resolve(st, ev.id, idx);
        ASH.audio.sfx("click");
        if (!out) { closeModal(); return; }
        showEventResult(ev, out);
      });
    });
  }

  function showEventResult(ev, out) {
    var h = '<h2 class="ev-title">' + esc(ev.title) + '</h2>' +
      '<div class="ev-text result">' + esc(out.result) + '</div>';
    if (out.notes.length) h += '<div class="ev-notes">' + out.notes.map(esc).join(" · ") + '</div>';
    h += '<button class="act primary" id="ev-ok">SO IT GOES</button>';
    var m = modal(h, { noClose: true });
    m.querySelector("#ev-ok").addEventListener("click", function () {
      ASH.audio.sfx("click");
      ctrl.refresh();
      closeModal();
    });
  }

  /* ---- tech modal ---- */
  function showTech() {
    var st = ctrl.state, f = st.factions[0];
    var branches = { Survival: [], Industry: [], Signal: [] };
    D().TECHS.forEach(function (t) { branches[t.branch].push(t); });
    var h = '<h2>REMEMBRANCE</h2><div class="muted center">What the old world knew, the new world can learn again.</div>';
    if (f.research) {
      var cur = S.techByKey(f.research.key);
      var curCost = S.techCostFor(f, cur);
      var pct = Math.min(100, Math.round(f.research.progress / curCost * 100));
      h += '<div class="research-now">Recovering <b>' + cur.name + '</b><div class="hp-bar wide"><div style="width:' + pct + '%"></div></div>' + Math.floor(f.research.progress) + ' / ' + curCost + '</div>';
    }
    h += '<div class="tech-cols">';
    U.each(branches, function (list, name) {
      h += '<div class="tech-col"><div class="tech-branch">' + name.toUpperCase() + '</div>';
      list.forEach(function (t) {
        var done = S.hasTech(f, t.key);
        var avail = S.canResearch(f, t.key);
        var current = f.research && f.research.key === t.key;
        var cls = done ? "done" : (current ? "current" : (avail ? "avail" : "locked"));
        h += '<div class="tech-card ' + cls + '" data-key="' + t.key + '" data-tip="' + esc(t.blurb) + '">' +
          '<div class="tech-name">' + t.name + '</div>' +
          '<div class="tech-eff">' + esc(t.effectDesc) + '</div>' +
          '<div class="tech-cost">' + (done ? "REMEMBERED" : (current ? "IN PROGRESS" : S.techCostFor(f, t) + " knowledge")) + '</div></div>';
      });
      h += '</div>';
    });
    h += '</div><button class="act" id="m-close">CLOSE</button>';
    var m = modal(h, { wide: true });
    m.querySelectorAll(".tech-card.avail").forEach(function (el) {
      el.addEventListener("click", function () {
        ctrl.research(el.getAttribute("data-key"));
        closeModal();
        showTech();
      });
    });
    m.querySelector("#m-close").addEventListener("click", closeModal);
  }

  /* ---- factions modal ---- */
  function showFactions() {
    var st = ctrl.state, f = st.factions[0];
    var h = '<h2>THE OTHER BANNERS</h2><div class="fac-list">';
    for (var i = 1; i < st.factions.length; i++) {
      var o = st.factions[i];
      var rel = f.rel[o.key] || 0;
      var war = f.atWar[o.key];
      var relCls = war ? "war" : (rel > 15 ? "good" : (rel < -15 ? "bad" : "mid"));
      h += '<div class="fac-row' + (o.alive ? '' : ' dead') + '">' +
        '<canvas class="fac-sigil" width="36" height="36" data-key="' + o.key + '" data-color="' + o.color + '"></canvas>' +
        '<div class="fac-info"><b style="color:' + o.color + '">' + esc(o.name) + '</b>' +
        '<span class="muted">' + esc(o.title) + ' ' + esc(o.leader) + ' · ' + o.personality + (o.alive ? '' : ' · GONE') + '</span>' +
        '<span class="muted small">' + esc(S.factionDef(o).doctrine) + '</span></div>';
      if (o.alive) {
        h += '<div class="fac-rel ' + relCls + '">' + (war ? "AT WAR" : "standing " + rel) + '</div><div class="fac-actions">';
        if (war) h += '<button class="act small" data-peace="' + o.id + '">SUE FOR PEACE</button>';
        else h += '<button class="act small dim" data-war="' + o.id + '">DECLARE WAR</button>';
        h += '</div>';
      }
      h += '</div>';
    }
    h += '</div><button class="act" id="m-close">CLOSE</button>';
    var m = modal(h, { wide: true });
    m.querySelectorAll(".fac-sigil").forEach(function (cv) {
      ASH.render.drawSigil(cv.getContext("2d"), cv.getAttribute("data-key"), 18, 18, 13, cv.getAttribute("data-color"));
    });
    m.querySelectorAll("[data-war]").forEach(function (el) {
      el.addEventListener("click", function () { ctrl.declareWarOn(parseInt(el.getAttribute("data-war"), 10)); closeModal(); showFactions(); });
    });
    m.querySelectorAll("[data-peace]").forEach(function (el) {
      el.addEventListener("click", function () { ctrl.offerPeace(parseInt(el.getAttribute("data-peace"), 10)); closeModal(); showFactions(); });
    });
    m.querySelector("#m-close").addEventListener("click", closeModal);
  }

  /* ---- market modal ---- */
  function showMarket() {
    var st = ctrl.state, f = st.factions[0];
    var h = '<h2>THE MARKET</h2><div class="muted center">Caravan brokers buy and sell for scrap' +
      (S.mods(f).trade ? " — and you know all their route-mistresses by name." : ".") + '</div><div class="market">';
    ["food", "fuel", "meds"].forEach(function (k) {
      var sellR = S.tradeRate(f, "sell", k), buyR = S.tradeRate(f, "buy", k);
      h += '<div class="mk-row"><b class="res-' + k + '">' + RES_LABELS[k] + '</b>' +
        '<span class="muted">have ' + Math.floor(f.res[k]) + '</span>' +
        '<button class="act small" data-dir="sell" data-res="' + k + '">SELL 5 → ' + U.fmt1(sellR * 5) + ' scrap</button>' +
        '<button class="act small" data-dir="buy" data-res="' + k + '">BUY 5 ← ' + U.fmt1(buyR * 5) + ' scrap</button></div>';
    });
    h += '</div><div class="kv center"><span>Scrap on hand</span><b id="mk-scrap">' + Math.floor(f.res.scrap) + '</b></div>' +
      '<button class="act" id="m-close">CLOSE</button>';
    var m = modal(h);
    m.querySelectorAll("[data-dir]").forEach(function (el) {
      el.addEventListener("click", function () {
        ctrl.tradeDo(el.getAttribute("data-dir"), el.getAttribute("data-res"), 5);
        closeModal(); showMarket();
      });
    });
    m.querySelector("#m-close").addEventListener("click", closeModal);
  }

  /* ---- peace offer ---- */
  function showPeaceOffer(fid) {
    var st = ctrl.state;
    var o = st.factions[fid];
    if (!o || !o.alive || !o.atWar[st.factions[0].key]) { ctrl.onModalClosed(); return; }
    var h = '<h2>AN ENVOY UNDER GREY FLAG</h2>' +
      '<div class="ev-text">' + esc(o.name) + ' have had enough. Their envoy stands at your gate with empty hands and a hard-won offer: peace, borders as they lie, grudges banked but not forgotten.</div>' +
      '<div class="ev-choices">' +
      '<button class="ev-choice" id="p-accept">Take the peace. Winter is enemy enough.</button>' +
      '<button class="ev-choice" id="p-refuse">Send the envoy back. This ends when it\'s finished.</button></div>';
    var m = modal(h, { noClose: true });
    m.querySelector("#p-accept").addEventListener("click", function () {
      S.makePeace(st, st.factions[0], o);
      ASH.audio.sfx("click"); ASH.audio.updateMood(st);
      ctrl.refresh(); closeModal();
    });
    m.querySelector("#p-refuse").addEventListener("click", function () {
      S.relShift(st, st.factions[0], o.key, -10);
      ASH.audio.sfx("click");
      ctrl.refresh(); closeModal();
    });
  }

  /* ---- settings ---- */
  function showSettings() {
    var vols = ASH.audio.getVolumes();
    var h = '<h2>SETTINGS</h2>' +
      '<div class="set-row"><span>Music</span><input type="range" id="s-music" min="0" max="100" value="' + Math.round(vols.music * 100) + '"></div>' +
      '<div class="set-row"><span>Effects</span><input type="range" id="s-sfx" min="0" max="100" value="' + Math.round(vols.sfx * 100) + '"></div>' +
      '<div class="set-row"><span>Mute all</span><button class="act small" id="s-mute">' + (ASH.audio.isMuted() ? "UNMUTE" : "MUTE") + '</button></div>' +
      '<div class="set-row"><span>Film grain</span><button class="act small" id="s-grain">TOGGLE</button></div>' +
      '<hr><div class="set-row"><button class="act small" id="s-save">SAVE GAME</button>' +
      '<button class="act small dim" id="s-quit">ABANDON TO TITLE</button></div>' +
      '<div class="muted center">Seed ' + ctrl.state.seed + ' · autosaves every season</div>' +
      '<button class="act" id="m-close">CLOSE</button>';
    var m = modal(h);
    function vol() {
      ASH.audio.setVolumes(
        parseInt(m.querySelector("#s-music").value, 10) / 100,
        parseInt(m.querySelector("#s-sfx").value, 10) / 100);
    }
    m.querySelector("#s-music").addEventListener("input", vol);
    m.querySelector("#s-sfx").addEventListener("input", vol);
    m.querySelector("#s-mute").addEventListener("click", function () {
      ASH.audio.setMuted(!ASH.audio.isMuted());
      this.textContent = ASH.audio.isMuted() ? "UNMUTE" : "MUTE";
    });
    m.querySelector("#s-grain").addEventListener("click", function () {
      ctrl.grain = !ctrl.grain;
      ASH.render.setGrain(ctrl.grain);
    });
    m.querySelector("#s-save").addEventListener("click", function () { ctrl.saveNow(); toast("Saved. The ledger remembers.", "good"); });
    m.querySelector("#s-quit").addEventListener("click", function () { closeModal(); ctrl.quitToTitle(); });
    m.querySelector("#m-close").addEventListener("click", closeModal);
  }

  /* ---- help ---- */
  function showHelp() {
    var h = '<h2>HOW TO SURVIVE</h2><div class="help-text">' +
      '<p><b>One turn is one season.</b> Every season your people eat. Watch the FOOD net number in the top bar like it owes you money — in the Long Dark, it will lie to you.</p>' +
      '<p><b>Click your settlement</b> to build structures and muster warbands. Click a warband, then a lit hex to march; a red-ringed hex to attack. Warbands on neutral hexes can <b>claim</b> land; Scavengers can <b>salvage</b> ruins, vaults, caches.</p>' +
      '<p><b>Reclaimer Crews found new settlements</b> — your tax base, your recruiting pool, your victory condition. Guard them; they cannot fight.</p>' +
      '<p><b>Hope</b> is a resource like any other, except when it runs out your story does. Feasts, victories, and clean water raise it. Hunger, war, and hard choices spend it.</p>' +
      '<p><b>Remembrance</b> (research) needs knowledge: build Archives, salvage ruins, listen to strangers.</p>' +
      '<p><b>Three roads out:</b> hold ' + Math.round(D().BALANCE.dominionFrac * 100) + '% of the world\'s settlements · kindle the Beacon (Signal branch) · outlive everyone else.</p>' +
      '<p class="muted">Shortcuts: <b>Enter</b> end season · <b>Esc</b> deselect/close · <b>Space</b> home · <b>M</b> mute · arrows/drag pan · wheel zoom.</p>' +
      '</div><button class="act" id="m-close">INTO THE ASH</button>';
    var m = modal(h, { wide: true });
    m.querySelector("#m-close").addEventListener("click", closeModal);
  }

  /* ---- game over ---- */
  function showGameOver() {
    var st = ctrl.state;
    var o = st.over;
    var f = st.factions[0];
    ASH.audio.stinger(o.win ? "victory" : "defeat");
    var titles = {
      beacon: "THE SKY ANSWERS", dominion: "DOMINION", lastman: "LAST BANNER STANDING",
      overrun: "THE WALLS COME DOWN", collapse: "THE LONG QUIET", conquered: "ANOTHER'S WORLD"
    };
    var prose = {
      beacon: "On the sixth night the Beacon takes the fire and throws it at the clouds. Static parts like a curtain. A voice — accented, tired, human — asks who you are. You tell it. Far away, someone writes your name down in a world that is going to need maps again.",
      dominion: "There is no one left to fight that matters. Roads knit stead to stead; caravans pay your tolls; children are born who will never remember the wars, only the harvests. The wasteland is still the wasteland — but it has a capital now, and the capital has your name on the gate.",
      lastman: "You did not set out to be the last. But the ash takes the proud and the careful alike, and this morning, for a thousand miles, every fire that burns is yours. Build well. There is no one left to learn from your mistakes but everyone after.",
      overrun: "It ends the way the elders always said it would: smoke on the horizon that turns out to be yours. The survivors scatter into the grey with what they can carry. Somewhere, years from now, a stranger will sing a song with your stead's name in it and not know what it meant.",
      collapse: "No army did this. The stores were never quite empty; the walls never fell. People just stopped believing tomorrow was worth the cold, and one morning the gates stood open and nobody minded the watch. The wind moves in. It was always going to be the wind.",
      conquered: "The world got smaller while you were surviving in it, and the name it answers to now is not yours. Your people endure — people do — paying another banner's tithes, singing another banner's songs, remembering."
    };
    var h = '<div class="go-kicker">' + (o.win ? "VICTORY" : "THE END") + ' — YEAR ' + o.year + ' AFTER</div>' +
      '<h2 class="go-title">' + titles[o.kind] + '</h2>' +
      '<div class="ev-text">' + prose[o.kind] + '</div>' +
      '<div class="go-stats">' +
      stat("Seasons endured", st.turn) +
      stat("Settlements", S.settlementsOf(st, 0).length) +
      stat("Battles won", f.stats.battlesWon) +
      stat("Ruins salvaged", f.stats.salvaged) +
      stat("Remembrances", f.techs.length) +
      stat("LEGACY", o.score) +
      '</div>' +
      '<div class="ev-choices"><button class="ev-choice" id="go-again">BEGIN AGAIN — THE ASH KEEPS NO SCORE</button>' +
      '<button class="ev-choice" id="go-title">RETURN TO TITLE</button></div>';
    var m = modal(h, { noClose: true });
    m.querySelector("#go-again").addEventListener("click", function () { closeModal(); ctrl.restartSameSetup(); });
    m.querySelector("#go-title").addEventListener("click", function () { closeModal(); ctrl.quitToTitle(); });
  }
  function stat(k, v) { return '<div class="go-stat"><span>' + k + '</span><b>' + v + '</b></div>'; }

  /* ============================ tooltip ============================ */
  function initTooltip() {
    var tipEl = $("tooltip");
    document.addEventListener("mousemove", function (e) {
      var tgt = e.target.closest ? e.target.closest("[data-tip]") : null;
      var why = e.target.closest ? e.target.closest("[data-why]") : null;
      var text = tgt ? tgt.getAttribute("data-tip") : (why ? why.getAttribute("data-why") : null);
      if (!text) { tipEl.classList.add("hidden"); return; }
      tipEl.textContent = text;
      tipEl.classList.remove("hidden");
      var x = Math.min(e.clientX + 14, window.innerWidth - tipEl.offsetWidth - 8);
      var y = Math.min(e.clientY + 16, window.innerHeight - tipEl.offsetHeight - 8);
      tipEl.style.left = x + "px";
      tipEl.style.top = y + "px";
    });
  }

  /* map hover tooltip content */
  function mapTooltip(i) {
    var st = ctrl.state;
    if (i < 0) return null;
    var t = st.tiles[i];
    if (!t.explored) return "Uncharted ground.";
    var ter = D().TERRAIN[t.terrain];
    var bits = [ter.name];
    if (t.owner >= 0) bits.push(st.factions[t.owner].name);
    if (t.settlement) bits.push(t.settlement.name + " · " + t.settlement.pop * 20 + " souls");
    if (t.site) bits.push(D().SITES[t.site].name);
    if (t.rad) bits.push("RAD " + "▲".repeat(t.rad));
    if (S.stormAt(st, i)) bits.push("STORM");
    var ys = [];
    U.each(ter.yields, function (v, k) { if (v) ys.push(v + " " + k); });
    if (ys.length) bits.push(ys.join(", "));
    return bits.join("  ·  ");
  }

  function attach(c) {
    ctrl = c;
    initTooltip();
    $("btn-tech").addEventListener("click", function () { ASH.audio.sfx("click"); showTech(); });
    $("btn-factions").addEventListener("click", function () { ASH.audio.sfx("click"); showFactions(); });
    $("btn-market").addEventListener("click", function () { ASH.audio.sfx("click"); showMarket(); });
    $("btn-settings").addEventListener("click", function () { ASH.audio.sfx("click"); showSettings(); });
    $("btn-help").addEventListener("click", function () { ASH.audio.sfx("click"); showHelp(); });
    $("btn-endturn").addEventListener("click", function () { ctrl.endTurn(); });
  }

  function refresh() {
    renderTop();
    renderSide();
    renderLog();
  }

  return { attach: attach, refresh: refresh, renderLog: renderLog, toast: toast,
           seasonBanner: seasonBanner, showEvent: showEvent, showTech: showTech,
           showFactions: showFactions, showMarket: showMarket, showSettings: showSettings,
           showHelp: showHelp, showGameOver: showGameOver, showPeaceOffer: showPeaceOffer,
           modalOpen: modalOpen, closeModal: closeModal, mapTooltip: mapTooltip };
})();

if (typeof module !== "undefined" && module.exports) module.exports = ASH;
