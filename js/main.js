/* ASHFALL — main.js
 * Boot, screens (title / setup / game), input, the frame loop, and the
 * controller object that the UI calls into. Glue, in other words.
 */
"use strict";
var ASH = typeof ASH !== "undefined" ? ASH : {};

(function () {
  var U = ASH.util, S = ASH.sim;
  var $ = function (id) { return document.getElementById(id); };
  var SAVE_KEY = "ashfall.save.v1";

  var ctrl = {
    state: null,
    sel: { tile: -1, units: [], reach: null, attackable: [] },
    grain: true,
    setup: { playerKey: "hearth", difficulty: "ash", seedText: "" },
    screen: "title",

    /* ---------- selection ---------- */
    clearSel: function () {
      ctrl.sel.tile = -1; ctrl.sel.units = []; ctrl.sel.reach = null; ctrl.sel.attackable = [];
      ASH.ui.refresh();
    },
    selectTile: function (i) {
      ctrl.sel.tile = i;
      ctrl.sel.units = [];
      var t = ctrl.state.tiles[i];
      for (var k = 0; k < t.units.length; k++) {
        var u = ctrl.state.units[t.units[k]];
        if (u && u.f === 0 && u.moves > 0) ctrl.sel.units.push(u.id);
      }
      ctrl.computeMobility();
      ASH.audio.sfx(ctrl.sel.units.length ? "select" : "click");
      ASH.ui.refresh();
    },
    toggleUnit: function (uid) {
      var ix = ctrl.sel.units.indexOf(uid);
      if (ix === -1) {
        var u = ctrl.state.units[uid];
        if (!u || u.f !== 0) return;
        ctrl.sel.units.push(uid);
      } else ctrl.sel.units.splice(ix, 1);
      ctrl.computeMobility();
      ASH.audio.sfx("click");
      ASH.ui.refresh();
    },
    computeMobility: function () {
      var st = ctrl.state;
      ctrl.sel.reach = null;
      ctrl.sel.attackable = [];
      if (!ctrl.sel.units.length) return;
      /* tiles every selected unit can reach */
      var inter = null;
      ctrl.sel.units.forEach(function (uid) {
        var u = st.units[uid];
        if (!u || u.moves <= 0) return;
        var r = S.reachable(st, u);
        if (inter === null) inter = r;
        else {
          var merged = {};
          U.each(inter, function (v, k) { if (r[k] !== undefined) merged[k] = Math.max(v, r[k]); });
          inter = merged;
        }
      });
      ctrl.sel.reach = inter || {};
      /* adjacent attack targets */
      if (ctrl.sel.tile >= 0) {
        var ns = st.adj[ctrl.sel.tile];
        for (var k = 0; k < ns.length; k++) {
          if (ASH.combat.canAttack(st, 0, ctrl.sel.tile, ns[k]) !== false) ctrl.sel.attackable.push(ns[k]);
        }
      }
    },

    /* ---------- map actions ---------- */
    moveTo: function (dest) {
      var st = ctrl.state;
      var moved = false;
      ctrl.sel.units.slice().forEach(function (uid) {
        var u = st.units[uid];
        if (u && S.moveUnit(st, uid, dest)) moved = true;
      });
      if (moved) {
        ASH.audio.sfx("move");
        ctrl.selectTile(dest);
        ASH.render.markDirty();
      }
      return moved;
    },
    attack: function (target) {
      var st = ctrl.state;
      var defFid = ASH.combat.canAttack(st, 0, ctrl.sel.tile, target);
      if (defFid === false) return;
      var defender = st.factions[defFid];
      var wasAtWar = st.factions[0].atWar[defender.key];
      var rep = ASH.combat.attack(st, 0, ctrl.sel.tile, target);
      if (!rep) return;
      ASH.audio.sfx("attack");
      ASH.audio.stinger("battle");
      ASH.render.addFlash(target);
      ASH.render.addFloat(target, "-" + rep.defLossHp, "#e8a07a");
      if (rep.atkLossHp > 0) ASH.render.addFloat(ctrl.sel.tile, "-" + rep.atkLossHp, "#c25a4a");
      if (!wasAtWar) {
        ASH.ui.toast("WAR with " + defender.name + ".", "war");
        ASH.audio.stinger("war");
      }
      if (rep.captured) {
        ASH.ui.toast(rep.settlement ? rep.settlement + " is taken." : "Ground taken.", "good");
        ctrl.selectTile(target);
      } else {
        ctrl.selectTile(ctrl.sel.tile);
      }
      ASH.render.markDirty();
      ASH.audio.updateMood(st);
      ctrl.checkOver();
      ASH.ui.refresh();
    },

    /* ---------- settlement actions ---------- */
    build: function (tileIdx, key) {
      var st = ctrl.state;
      if (S.startBuild(st, st.factions[0], st.tiles[tileIdx], key)) {
        ASH.audio.sfx("build");
        ASH.ui.toast(ASH.data.BUILDINGS[key].name + " under construction.", "info");
      } else ASH.audio.sfx("error");
      ASH.ui.refresh();
    },
    recruitU: function (tileIdx, type) {
      var st = ctrl.state;
      var u = S.recruit(st, st.factions[0], st.tiles[tileIdx], type);
      if (u) {
        ASH.audio.sfx("recruit");
        ASH.ui.toast(ASH.data.UNITS[type].name + " mustered — ready next season.", "info");
        ASH.render.markDirty();
      } else ASH.audio.sfx("error");
      ASH.ui.refresh();
    },
    research: function (key) {
      var st = ctrl.state;
      if (S.setResearch(st, st.factions[0], key)) {
        ASH.audio.sfx("research");
        ASH.ui.toast("The readers begin on " + S.techByKey(key).name + ".", "info");
      }
      ASH.ui.refresh();
    },
    unitAction: function (uid, act) {
      var st = ctrl.state;
      var ok = false;
      if (act === "salvage") { ok = S.salvage(st, uid); if (ok) ASH.audio.sfx("salvage"); }
      else if (act === "pillage") { ok = S.pillage(st, uid); if (ok) { ASH.audio.sfx("attack"); ASH.render.addFlash(st.units[uid] ? st.units[uid].tile : ctrl.sel.tile); } }
      else if (act === "claim") { ok = S.claim(st, uid); if (ok) ASH.audio.sfx("claim"); }
      else if (act === "found") {
        var tile = st.units[uid].tile;
        ok = S.found(st, uid);
        if (ok) { ASH.audio.sfx("found"); ASH.ui.toast("A new settlement rises.", "good"); ctrl.selectTile(tile); }
      }
      else if (act === "disband") { S.disband(st, uid); ok = true; ASH.audio.sfx("click"); }
      if (!ok && act !== "disband") ASH.audio.sfx("error");
      ctrl.computeMobility();
      ASH.render.markDirty();
      ASH.ui.refresh();
    },
    kindle: function () {
      var st = ctrl.state;
      if (S.startKindle(st, st.factions[0])) {
        ASH.audio.sfx("research");
        ASH.ui.toast("The Kindling begins. Hold the spire.", "good");
      } else ASH.audio.sfx("error");
      ASH.ui.refresh();
    },
    tradeDo: function (dir, res, amt) {
      var st = ctrl.state;
      if (S.trade(st, st.factions[0], dir, res, amt)) ASH.audio.sfx("coin");
      else ASH.audio.sfx("error");
      ASH.ui.refresh();
    },

    /* ---------- diplomacy ---------- */
    declareWarOn: function (fid) {
      var st = ctrl.state;
      S.declareWar(st, st.factions[0], st.factions[fid]);
      ASH.audio.stinger("war");
      ASH.audio.updateMood(st);
      ASH.ui.toast("WAR with " + st.factions[fid].name + ".", "war");
      ASH.ui.refresh();
    },
    offerPeace: function (fid) {
      var st = ctrl.state;
      var o = st.factions[fid];
      if (S.acceptsPeace(st, o, st.factions[0])) {
        S.makePeace(st, st.factions[0], o);
        ASH.audio.updateMood(st);
        ASH.ui.toast(o.name + " accept. The roads breathe again.", "good");
      } else {
        ASH.ui.toast(o.name + " refuse. They like their odds.", "bad");
      }
      ASH.ui.refresh();
    },

    /* ---------- turn ---------- */
    busy: false,
    endTurn: function () {
      if (ctrl.busy || ctrl.state.over || ASH.ui.modalOpen()) return;
      ctrl.busy = true;
      ASH.audio.sfx("endturn");
      var btn = $("btn-endturn");
      btn.classList.add("working");
      setTimeout(function () {
        ASH.turn.endTurn(ctrl.state);
        ctrl.sel.units = [];
        ctrl.sel.reach = null;
        ctrl.sel.attackable = [];
        ctrl.computeMobility();
        ASH.render.markDirty();
        ASH.ui.refresh();
        ASH.ui.seasonBanner();
        ASH.audio.stinger("season");
        ASH.audio.updateMood(ctrl.state);
        ctrl.autosave();
        btn.classList.remove("working");
        ctrl.busy = false;
        ctrl.checkOver();
        ctrl.pumpModals();
      }, 60);
    },
    /* show queued events / peace offers one at a time */
    pumpModals: function () {
      var st = ctrl.state;
      if (st.over || ASH.ui.modalOpen()) return;
      if (st.pendingEvents && st.pendingEvents.length) {
        var pe = st.pendingEvents.shift();
        ASH.ui.showEvent(pe);
        return;
      }
      if (st.pendingPeace && st.pendingPeace.length) {
        var fid = st.pendingPeace.shift();
        ASH.ui.showPeaceOffer(fid);
      }
    },
    onModalClosed: function () {
      ASH.ui.refresh();
      setTimeout(ctrl.pumpModals, 200);
    },
    checkOver: function () {
      if (ctrl.state.over && !ctrl.overShown) {
        ctrl.overShown = true;
        ASH.audio.updateMood(ctrl.state);
        setTimeout(function () { ASH.ui.showGameOver(); }, 900);
      }
    },
    refresh: function () { ASH.ui.refresh(); ASH.render.markDirty(); },

    /* ---------- lifecycle ---------- */
    newGame: function (opts) {
      var seed = ASH.rng.parseSeed(opts.seedText);
      ctrl.state = ASH.worldgen.newGame({ seed: seed, playerKey: opts.playerKey, difficulty: opts.difficulty });
      ctrl.overShown = false;
      ctrl.sel = { tile: -1, units: [], reach: null, attackable: [] };
      ASH.render.setState(ctrl.state);
      ASH.render.centerOn(ctrl.state.factions[0].capital);
      ASH.render.camera.zoom = 1.15;
      showScreen("game");
      ASH.ui.refresh();
      ASH.ui.renderLog(true);
      ASH.audio.updateMood(ctrl.state);
      ctrl.autosave();
      if (!localStorage.getItem("ashfall.helped")) {
        localStorage.setItem("ashfall.helped", "1");
        setTimeout(ASH.ui.showHelp, 600);
      }
    },
    restartSameSetup: function () {
      ctrl.setup.seedText = "";
      ctrl.newGame(ctrl.setup);
    },
    quitToTitle: function () {
      ctrl.autosave();
      showScreen("title");
      ASH.audio.setMood("title");
    },
    autosave: function () {
      try {
        if (ctrl.state && !ctrl.state.over) localStorage.setItem(SAVE_KEY, ASH.turn.serialize(ctrl.state));
        else if (ctrl.state && ctrl.state.over) localStorage.removeItem(SAVE_KEY);
      } catch (e) { /* storage full or blocked — play on */ }
      refreshContinue();
    },
    saveNow: function () { ctrl.autosave(); },
    loadSaved: function () {
      try {
        var raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        var st = ASH.turn.deserialize(raw);
        if (!st) return false;
        ctrl.state = st;
        ctrl.overShown = false;
        ctrl.sel = { tile: -1, units: [], reach: null, attackable: [] };
        ASH.render.setState(st);
        ASH.render.centerOn(st.factions[0].capital);
        showScreen("game");
        ASH.ui.refresh();
        ASH.ui.renderLog(true);
        ASH.audio.updateMood(st);
        return true;
      } catch (e) { return false; }
    }
  };

  /* ============================ screens ============================ */
  function showScreen(name) {
    ctrl.screen = name;
    $("title-screen").classList.toggle("hidden", name !== "title");
    $("game-screen").classList.toggle("hidden", name !== "game");
    if (name === "title") $("setup-panel").classList.add("hidden"), $("title-menu").classList.remove("hidden");
  }

  function refreshContinue() {
    var has = false;
    try { has = !!localStorage.getItem(SAVE_KEY); } catch (e) { /* no storage */ }
    $("btn-continue").disabled = !has;
  }

  function buildSetupPanel() {
    var cardsEl = $("faction-cards");
    var html = "";
    ASH.data.FACTIONS.forEach(function (f) {
      html += '<div class="f-card" data-key="' + f.key + '">' +
        '<canvas width="44" height="44" class="f-card-sigil" data-key="' + f.key + '" data-color="' + f.color + '"></canvas>' +
        '<div class="f-card-name" style="color:' + f.color + '">' + f.name + '</div>' +
        '<div class="f-card-blurb">' + f.blurb + '</div>' +
        '<div class="f-card-doc">' + f.doctrine + '</div></div>';
    });
    cardsEl.innerHTML = html;
    cardsEl.querySelectorAll(".f-card-sigil").forEach(function (cv) {
      ASH.render.drawSigil(cv.getContext("2d"), cv.getAttribute("data-key"), 22, 22, 16, cv.getAttribute("data-color"));
    });
    cardsEl.querySelectorAll(".f-card").forEach(function (el) {
      el.addEventListener("click", function () {
        cardsEl.querySelectorAll(".f-card").forEach(function (x) { x.classList.remove("picked"); });
        el.classList.add("picked");
        ctrl.setup.playerKey = el.getAttribute("data-key");
        ASH.audio.sfx("select");
      });
    });
    cardsEl.querySelector('.f-card[data-key="hearth"]').classList.add("picked");

    document.querySelectorAll("#diff-row .diff-btn").forEach(function (el) {
      el.addEventListener("click", function () {
        document.querySelectorAll("#diff-row .diff-btn").forEach(function (x) { x.classList.remove("picked"); });
        el.classList.add("picked");
        ctrl.setup.difficulty = el.getAttribute("data-key");
        ASH.audio.sfx("click");
      });
    });
  }

  /* ============================ input ============================ */
  function initInput(canvas) {
    var dragging = false, dragMoved = false, lastX = 0, lastY = 0;
    var hoverTile = -1;

    canvas.addEventListener("mousedown", function (e) {
      dragging = true; dragMoved = false;
      lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener("mousemove", function (e) {
      if (dragging) {
        var dx = e.clientX - lastX, dy = e.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
        if (dragMoved) {
          ASH.render.camera.x -= dx / ASH.render.camera.zoom;
          ASH.render.camera.y -= dy / ASH.render.camera.zoom;
        }
        lastX = e.clientX; lastY = e.clientY;
      }
      if (e.target === canvas && ctrl.state) {
        var r = canvas.getBoundingClientRect();
        hoverTile = ASH.render.screenToTile(e.clientX - r.left, e.clientY - r.top);
        var tip = $("map-tip");
        var text = ASH.ui.mapTooltip(hoverTile);
        if (text && !dragging) {
          tip.textContent = text;
          tip.classList.remove("hidden");
        } else tip.classList.add("hidden");
      }
      ctrl.hoverTile = hoverTile;
    });
    window.addEventListener("mouseup", function (e) {
      if (!dragging) return;
      dragging = false;
      if (dragMoved || e.target !== canvas || !ctrl.state || ctrl.state.over) return;
      var r = canvas.getBoundingClientRect();
      var i = ASH.render.screenToTile(e.clientX - r.left, e.clientY - r.top);
      if (i < 0) { ctrl.clearSel(); return; }
      /* attack? */
      if (ctrl.sel.attackable.indexOf(i) !== -1 && ctrl.sel.units.length) { ctrl.attack(i); return; }
      /* move? */
      if (ctrl.sel.reach && ctrl.sel.reach[i] !== undefined && ctrl.sel.units.length) { ctrl.moveTo(i); return; }
      ctrl.selectTile(i);
    });
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      var z0 = ASH.render.camera.zoom;
      var z1 = U.clamp(z0 * (e.deltaY < 0 ? 1.13 : 0.885), 0.4, 2.4);
      /* zoom around the cursor */
      var r = canvas.getBoundingClientRect();
      var mx = e.clientX - r.left - canvas.width / 2, my = e.clientY - r.top - canvas.height / 2;
      ASH.render.camera.x += mx / z0 - mx / z1;
      ASH.render.camera.y += my / z0 - my / z1;
      ASH.render.camera.zoom = z1;
    }, { passive: false });

    $("minimap").addEventListener("mousedown", function (e) {
      var r = e.target.getBoundingClientRect();
      var p = ASH.render.minimapToWorld(e.target, e.clientX - r.left, e.clientY - r.top);
      ASH.render.camera.x = p.x; ASH.render.camera.y = p.y;
    });

    window.addEventListener("keydown", function (e) {
      if (ctrl.screen !== "game") return;
      var cam = ASH.render.camera;
      var step = 60 / cam.zoom;
      switch (e.key) {
        case "ArrowLeft": cam.x -= step; break;
        case "ArrowRight": cam.x += step; break;
        case "ArrowUp": cam.y -= step; break;
        case "ArrowDown": cam.y += step; break;
        case "Enter":
          if (!ASH.ui.modalOpen()) { e.preventDefault(); ctrl.endTurn(); }
          break;
        case "Escape":
          if (ASH.ui.modalOpen()) ASH.ui.closeModal();
          else ctrl.clearSel();
          break;
        case " ":
          e.preventDefault();
          if (ctrl.state) ASH.render.centerOn(ctrl.state.factions[0].capital);
          break;
        case "m": case "M":
          ASH.audio.setMuted(!ASH.audio.isMuted());
          ASH.ui.toast(ASH.audio.isMuted() ? "Muted." : "Sound on.", "info");
          break;
        case "+": case "=": cam.zoom = U.clamp(cam.zoom * 1.15, 0.4, 2.4); break;
        case "-": cam.zoom = U.clamp(cam.zoom / 1.15, 0.4, 2.4); break;
      }
    });
  }

  /* ============================ loops ============================ */
  function resize() {
    var canvas = $("map");
    var wrap = $("map-wrap");
    canvas.width = wrap.clientWidth;
    canvas.height = wrap.clientHeight;
    var t = $("title-bg");
    t.width = window.innerWidth;
    t.height = window.innerHeight;
  }

  var lastT = 0, miniT = 0, topT = 0;
  function loop(ts) {
    var dt = Math.min(0.1, (ts - lastT) / 1000) || 0.016;
    lastT = ts;
    if (ctrl.screen === "title") {
      ASH.render.drawTitle($("title-bg"), ts / 1000);
    } else if (ctrl.state) {
      ASH.render.frame(dt, {
        selectedTile: ctrl.sel.tile,
        selectedUnits: ctrl.sel.units,
        reach: ctrl.sel.reach,
        attackable: ctrl.sel.attackable,
        hoverTile: ctrl.hoverTile === undefined ? -1 : ctrl.hoverTile
      });
      miniT += dt;
      if (miniT > 0.25) { miniT = 0; ASH.render.drawMinimap($("minimap")); }
      topT += dt;
      if (topT > 1.0) { topT = 0; ASH.ui.renderLog(); }
    }
    requestAnimationFrame(loop);
  }

  /* ============================ boot ============================ */
  function boot() {
    ASH.render.init($("map"));
    resize();
    window.addEventListener("resize", resize);
    buildSetupPanel();
    ASH.ui.attach(ctrl);
    initInput($("map"));
    refreshContinue();

    /* every first gesture wakes the audio engine */
    document.addEventListener("pointerdown", function () { ASH.audio.boot(); ASH.audio.resume(); }, { capture: true });
    document.addEventListener("keydown", function () { ASH.audio.boot(); }, { capture: true, once: true });

    $("btn-new").addEventListener("click", function () {
      ASH.audio.sfx("click");
      $("title-menu").classList.add("hidden");
      $("setup-panel").classList.remove("hidden");
    });
    $("btn-setup-back").addEventListener("click", function () {
      ASH.audio.sfx("click");
      $("setup-panel").classList.add("hidden");
      $("title-menu").classList.remove("hidden");
    });
    $("btn-begin").addEventListener("click", function () {
      ctrl.setup.seedText = $("seed-input").value;
      ASH.audio.sfx("endturn");
      ctrl.newGame(ctrl.setup);
    });
    $("btn-continue").addEventListener("click", function () {
      ASH.audio.sfx("click");
      if (!ctrl.loadSaved()) ASH.ui.toast("The ledger is blank.", "bad");
    });
    $("btn-about").addEventListener("click", function () {
      ASH.audio.sfx("click");
      $("about-panel").classList.toggle("hidden");
    });

    requestAnimationFrame(loop);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})();

if (typeof module !== "undefined" && module.exports) module.exports = ASH;
