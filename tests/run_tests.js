#!/usr/bin/env node
/* ASHFALL — headless test suite.
 * Loads the browser scripts into a bare VM context (no DOM, no audio) and
 * exercises the simulation core: worldgen determinism, economy, combat,
 * events, AI, full-game autoplay, save/load.
 *
 * Run:  node tests/run_tests.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const CORE_FILES = [
  "js/util.js", "js/rng.js", "js/names.js", "js/data.js",
  "js/worldgen.js", "js/sim.js", "js/combat.js", "js/events.js",
  "js/ai.js", "js/turn.js",
  "js/audio.js" // loads headless: every audio call no-ops without WebAudio
];

function loadCore() {
  const ctx = { console: console, Math: Math, JSON: JSON, Date: Date };
  vm.createContext(ctx);
  for (const f of CORE_FILES) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    vm.runInContext(src, ctx, { filename: f });
  }
  return ctx.ASH;
}

/* ---------------- tiny harness ---------------- */
let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(".");
  } catch (e) {
    failed++;
    failures.push({ name, e });
    process.stdout.write("F");
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
function assertEq(a, b, msg) {
  if (a !== b) throw new Error((msg || "assertEq") + ": " + JSON.stringify(a) + " !== " + JSON.stringify(b));
}
function assertNear(a, b, eps, msg) {
  if (Math.abs(a - b) > (eps || 1e-9)) throw new Error((msg || "assertNear") + ": " + a + " !~ " + b);
}

const ASH = loadCore();

function fresh(seed, playerKey, difficulty) {
  return ASH.worldgen.newGame({
    seed: seed === undefined ? 42 : seed,
    playerKey: playerKey || "hearth",
    difficulty: difficulty || "ash"
  });
}

/* Structural invariants that must hold at any point in any game. */
function validateState(state, label) {
  const seen = {};
  for (let i = 0; i < state.tiles.length; i++) {
    const t = state.tiles[i];
    assert(ASH.data.TERRAIN[t.terrain], label + ": tile " + i + " bad terrain");
    for (const uid of t.units) {
      const u = state.units[uid];
      assert(u, label + ": tile " + i + " lists missing unit " + uid);
      assertEq(u.tile, i, label + ": unit " + uid + " tile mismatch");
      assert(!seen[uid], label + ": unit " + uid + " on two tiles");
      seen[uid] = true;
    }
    if (t.settlement) {
      assert(t.owner >= 0 && t.owner < state.factions.length, label + ": settlement w/o owner");
      assert(t.settlement.pop >= 1, label + ": settlement pop < 1");
    }
  }
  for (const uid in state.units) {
    assert(seen[uid], label + ": unit " + uid + " not on any tile");
    const u = state.units[uid];
    assert(u.hp > 0 && u.hp <= 100, label + ": unit hp out of range: " + u.hp);
  }
  for (const f of state.factions) {
    for (const k in f.res) {
      assert(typeof f.res[k] === "number" && isFinite(f.res[k]), label + ": res " + k + " is " + f.res[k]);
      assert(f.res[k] >= 0, label + ": negative " + k);
    }
    assert(f.hope >= 0 && f.hope <= 100, label + ": hope out of range");
  }
}

/* ================= RNG ================= */
test("rng: sim stream is deterministic and state-driven", () => {
  const s1 = { rngState: 123 }, s2 = { rngState: 123 };
  for (let i = 0; i < 20; i++) assertEq(ASH.rng.next(s1), ASH.rng.next(s2));
  assertEq(s1.rngState, s2.rngState);
});

test("rng: derive gives independent stable streams", () => {
  assertEq(ASH.rng.derive(42, "elev"), ASH.rng.derive(42, "elev"));
  assert(ASH.rng.derive(42, "elev") !== ASH.rng.derive(42, "moist"), "salts collide");
  const a = ASH.rng.local(ASH.rng.derive(42, "x"));
  const b = ASH.rng.local(ASH.rng.derive(42, "x"));
  for (let i = 0; i < 10; i++) assertEq(a(), b());
});

test("rng: parseSeed handles numbers and words", () => {
  assertEq(ASH.rng.parseSeed("42"), 42);
  assertEq(ASH.rng.parseSeed("the scoria"), ASH.rng.parseSeed("the scoria"));
  assert(typeof ASH.rng.parseSeed("") === "number");
});

/* ================= worldgen ================= */
test("worldgen: same seed, byte-identical world", () => {
  const a = ASH.turn.serialize(fresh(7));
  const b = ASH.turn.serialize(fresh(7));
  assertEq(a, b);
});

test("worldgen: different seeds differ", () => {
  assert(ASH.turn.serialize(fresh(1)) !== ASH.turn.serialize(fresh(2)));
});

test("worldgen: map sanity across many seeds", () => {
  for (const seed of [1, 7, 42, 1337, -5, 999999]) {
    const st = fresh(seed);
    const n = st.tiles.length;
    assertEq(n, ASH.data.BALANCE.mapW * ASH.data.BALANCE.mapH);
    const counts = {};
    for (const t of st.tiles) counts[t.terrain] = (counts[t.terrain] || 0) + 1;
    assert((counts.water || 0) / n < 0.12, "too much water seed " + seed);
    assert((counts.ash || 0) > 0, "no ash plains seed " + seed);
    assert((counts.glass || 0) > 0, "no glasslands seed " + seed);
    assertEq(st.factions.length, 6, "faction count");
    let beacons = 0;
    for (const t of st.tiles) if (t.site === "beacon") beacons++;
    assertEq(beacons, 1, "beacon count seed " + seed);
    for (const f of st.factions) {
      const cap = st.tiles[f.capital];
      assert(cap.settlement && cap.settlement.isCapital, "capital missing for " + f.key);
      assert(ASH.data.TERRAIN[cap.terrain].habitable, "capital on bad terrain");
      assert(ASH.sim.unitsOf(st, f.id).length >= 2, "start units for " + f.key);
    }
    validateState(st, "seed " + seed);
  }
});

test("worldgen: capitals are spread out", () => {
  const st = fresh(42);
  for (let i = 0; i < st.factions.length; i++)
    for (let j = i + 1; j < st.factions.length; j++) {
      const d = ASH.worldgen.distT(st, st.factions[i].capital, st.factions[j].capital);
      assert(d >= 5, "capitals " + i + "," + j + " only " + d + " apart");
    }
});

test("worldgen: player faction choice is honoured", () => {
  for (const key of ["hearth", "legion", "choir", "caravan", "archive", "feral"]) {
    const st = fresh(42, key);
    assertEq(st.factions[0].key, key);
    assert(st.factions[0].isPlayer);
  }
});

/* ================= economy ================= */
test("economy: every faction starts food-positive", () => {
  for (const key of ["hearth", "legion", "choir", "caravan", "archive", "feral"]) {
    const st = fresh(42, key);
    for (const f of st.factions) {
      const inc = ASH.sim.factionIncome(st, f);
      assert(inc.net.food > 0, f.key + " starts starving: " + inc.net.food);
      assert(inc.net.scrap > -0.5, f.key + " starts scrap-broke: " + inc.net.scrap);
    }
  }
});

test("economy: starvation costs pop and hope", () => {
  const st = fresh(42);
  const f = st.factions[0];
  f.res.food = 0;
  const cap = st.tiles[f.capital].settlement;
  cap.pop = 60; // far beyond what the land can feed
  const hope0 = f.hope, pop0 = cap.pop;
  ASH.sim.economyTick(st, f);
  assert(f.hope < hope0, "hope should fall");
  assert(cap.pop < pop0, "pop should fall");
});

test("economy: construction completes and yields rise", () => {
  const st = fresh(42);
  const f = st.factions[0];
  const cap = st.tiles[f.capital];
  f.res.scrap = 100;
  const before = ASH.sim.yieldsOf(st, cap).food;
  assertEq(ASH.sim.canBuild(st, f, cap, "hydrofarm"), true);
  assert(ASH.sim.startBuild(st, f, cap, "hydrofarm"));
  assert(cap.settlement.queue, "queue set");
  for (let i = 0; i < 5 && cap.settlement.queue; i++) ASH.sim.economyTick(st, f);
  assert(cap.settlement.buildings.includes("hydrofarm"), "built");
  const after = ASH.sim.yieldsOf(st, cap).food;
  assertNear(after - before, 3, 0.001, "hydrofarm +3 food");
});

test("economy: growth happens when fed", () => {
  const st = fresh(42);
  const f = st.factions[0];
  f.res.food = 500; f.res.scrap = 500; f.res.fuel = 100;
  const cap = st.tiles[f.capital].settlement;
  const pop0 = cap.pop;
  for (let i = 0; i < 12; i++) { f.res.food = 500; ASH.sim.economyTick(st, f); }
  assert(cap.pop > pop0, "population should grow when food is plentiful");
});

/* ================= units & movement ================= */
test("units: recruit pays costs and takes the season", () => {
  const st = fresh(42);
  const f = st.factions[0];
  const cap = st.tiles[f.capital];
  f.res.scrap = 50;
  const pop0 = cap.settlement.pop, scrap0 = f.res.scrap;
  const u = ASH.sim.recruit(st, f, cap, "militia");
  assert(u, "recruited");
  assertEq(u.moves, 0);
  assertEq(cap.settlement.pop, pop0 - 1);
  assertEq(f.res.scrap, scrap0 - ASH.data.UNITS.militia.cost.scrap);
});

test("units: veterans need a barracks", () => {
  const st = fresh(42);
  const f = st.factions[0];
  const cap = st.tiles[f.capital];
  f.res.scrap = 100; f.res.fuel = 50;
  assert(ASH.sim.canRecruit(st, f, cap, "veteran") !== true, "should be blocked");
  cap.settlement.buildings.push("barracks");
  assertEq(ASH.sim.canRecruit(st, f, cap, "veteran"), true);
});

test("units: movement spends points by terrain", () => {
  const st = fresh(42);
  const f = st.factions[0];
  const u = ASH.sim.unitsOf(st, f.id)[0];
  const reach = ASH.sim.reachable(st, u);
  const keys = Object.keys(reach);
  assert(keys.length > 0, "somewhere to go");
  for (const k of keys) {
    assert(reach[k] <= u.moves, "cost within budget");
    assert(st.tiles[k].terrain !== "water", "no walking on water");
  }
  const dest = parseInt(keys[0], 10);
  const cost = reach[keys[0]];
  const m0 = u.moves;
  assert(ASH.sim.moveUnit(st, u.id, dest));
  assertEq(u.tile, dest);
  assertEq(u.moves, m0 - cost);
  validateState(st, "after move");
});

test("units: claim extends territory", () => {
  const st = fresh(42);
  const f = st.factions[0];
  const u = ASH.sim.unitsOf(st, f.id)[0];
  // find a neutral non-water tile adjacent to our territory and walk there
  let target = -1;
  for (const t of st.tiles) {
    if (t.owner !== -1 || t.terrain === "water") continue;
    if (st.adj[t.i].some(n => st.tiles[n].owner === f.id)) { target = t.i; break; }
  }
  assert(target >= 0, "found claimable tile");
  u.tile = (st.tiles[u.tile].units.splice(st.tiles[u.tile].units.indexOf(u.id), 1), target);
  st.tiles[target].units.push(u.id);
  u.moves = 1;
  f.res.scrap = 10;
  assert(ASH.sim.canClaim(st, u.id), "can claim");
  assert(ASH.sim.claim(st, u.id));
  assertEq(st.tiles[target].owner, f.id);
});

/* ================= combat ================= */
test("combat: overwhelming force takes ground", () => {
  const st = fresh(42);
  const f = st.factions[0], e = st.factions[1];
  // stage: three veterans vs one wounded scav on open ash
  let ground = -1, enemyGround = -1;
  for (const t of st.tiles) {
    if (t.terrain === "ash" && !t.units.length && !t.settlement && t.owner === -1) {
      const n = st.adj[t.i].find(x => st.tiles[x].terrain === "ash" && !st.tiles[x].units.length && !st.tiles[x].settlement && st.tiles[x].owner === -1);
      if (n !== undefined) { ground = t.i; enemyGround = n; break; }
    }
  }
  assert(ground >= 0, "staging ground found");
  for (let i = 0; i < 3; i++) ASH.sim.spawnUnit(st, f.id, "veteran", ground);
  const prey = ASH.sim.spawnUnit(st, e.id, "scav", enemyGround);
  prey.hp = 40;
  const rep = ASH.combat.attack(st, f.id, ground, enemyGround);
  assert(rep, "battle happened");
  assert(rep.captured, "ground taken");
  assert(!st.units[prey.id], "defender destroyed");
  assert(f.atWar[e.key] && e.atWar[f.key], "war declared by the attack");
  validateState(st, "after battle");
});

test("combat: walls make settlements bite back", () => {
  const st = fresh(42);
  const cap = st.tiles[st.factions[1].capital];
  const bare = ASH.combat.defenceMultiplier(st, cap);
  cap.settlement.buildings.push("walls");
  const walled = ASH.combat.defenceMultiplier(st, cap);
  assertNear(walled / bare, 1.6, 0.001);
});

test("combat: capturing a capital relocates the court", () => {
  const st = fresh(42);
  const f = st.factions[0], e = st.factions[1];
  // give the enemy a second settlement so the court has somewhere to flee
  let alt = -1;
  for (const t of st.tiles) {
    if (t.owner === -1 && ASH.data.TERRAIN[t.terrain].habitable && !t.settlement && !t.site &&
        st.tiles.every(x => !x.settlement || ASH.worldgen.distT(st, x.i, t.i) >= 3)) { alt = t.i; break; }
  }
  assert(alt >= 0);
  st.tiles[alt].owner = e.id;
  st.tiles[alt].settlement = { name: "Fallback", pop: 4, isCapital: false, buildings: [], queue: null, foundedTurn: 1 };
  const capIdx = e.capital;
  const cap = st.tiles[capIdx];
  cap.units.slice().forEach(uid => ASH.sim.removeUnit(st, uid)); // strip garrison units
  cap.settlement.pop = 2; // weak garrison
  const stage = st.adj[capIdx].find(i => ASH.sim.moveCostInto(st, f.id, i) !== Infinity || st.tiles[i].owner === e.id);
  const ground = st.adj[capIdx].find(i => st.tiles[i].terrain !== "water");
  assert(ground !== undefined);
  st.tiles[ground].units.slice().forEach(uid => ASH.sim.removeUnit(st, uid));
  for (let i = 0; i < 4; i++) ASH.sim.spawnUnit(st, f.id, "veteran", ground);
  let rep = null;
  for (let tries = 0; tries < 6 && !rep?.captured; tries++) {
    for (const uid of st.tiles[ground].units) st.units[uid].moves = 2;
    rep = ASH.combat.attack(st, f.id, ground, capIdx);
    assert(rep, "attack legal");
  }
  assert(rep.captured, "capital eventually falls");
  assertEq(st.tiles[capIdx].owner, f.id);
  assert(!st.tiles[capIdx].settlement.isCapital, "no longer their capital");
  assertEq(st.tiles[e.capital].settlement.isCapital, true, "court moved to fallback");
  validateState(st, "after capital fall");
});

/* ================= events ================= */
test("events: deck is well-formed", () => {
  const ids = {};
  for (const ev of ASH.data.EVENTS) {
    assert(ev.id && !ids[ev.id], "duplicate/missing id " + ev.id);
    ids[ev.id] = true;
    assert(ev.title && ev.text, ev.id + " missing prose");
    assert(Array.isArray(ev.choices) && ev.choices.length >= 2, ev.id + " needs >= 2 choices");
    for (const c of ev.choices) {
      assert(c.label && c.result, ev.id + " choice missing label/result");
      assert(c.effects !== undefined, ev.id + " choice missing effects");
    }
  }
});

test("events: every choice of every event applies cleanly", () => {
  for (const ev of ASH.data.EVENTS) {
    for (let ci = 0; ci < ev.choices.length; ci++) {
      const st = fresh(42);
      const f = st.factions[0];
      // make everything affordable so we exercise the effect itself
      f.res = { food: 50, scrap: 50, fuel: 50, meds: 50, know: 50 };
      const notes = ASH.events.applyEffects(st, f, ev.choices[ci].effects);
      assert(Array.isArray(notes), ev.id + " choice " + ci + " returned notes");
      validateState(st, ev.id + " choice " + ci);
    }
  }
});

test("events: cooldown and once are honoured", () => {
  const st = fresh(42);
  const f = st.factions[0];
  const pool0 = ASH.events.eligible(st, f);
  assert(pool0.length > 0);
  f.eventCooldowns[pool0[0].id] = st.turn + 5;
  const pool1 = ASH.events.eligible(st, f);
  assert(!pool1.includes(pool0[0]), "cooldown removes event");
  f.usedOnce["greenshoot"] = true;
  assert(!ASH.events.eligible(st, f).some(e => e.id === "greenshoot"), "once removes event");
});

test("events: resolve applies the chosen branch", () => {
  const st = fresh(42);
  const f = st.factions[0];
  const know0 = f.res.know;
  const out = ASH.events.resolve(st, "wanderer", 0);
  assert(out && out.result, "resolution prose returned");
  assertNear(f.res.know, know0 + 4, 0.001, "wanderer choice 0 grants +4 knowledge");
});

/* ================= tech ================= */
test("tech: research completes and effects apply", () => {
  const st = fresh(42);
  const f = st.factions[0];
  assert(ASH.sim.setResearch(st, f, "tools"));
  f.res.know = 0;
  // archives would help, but brute-force the progress instead:
  for (let i = 0; i < 40 && !ASH.sim.hasTech(f, "tools"); i++) {
    f.research && (f.research.progress += 3);
    ASH.sim.economyTick(st, f);
    f.res.food = 30; // keep the lights on
  }
  assert(ASH.sim.hasTech(f, "tools"), "tools researched");
  assert(!ASH.sim.canResearch(f, "tools"), "no double research");
  assert(ASH.sim.canResearch(f, "powder"), "prereq chain opens");
  assert(!ASH.sim.canResearch(f, "arcforge"), "deep tech still locked");
});

/* ================= trade ================= */
test("trade: rates work and caravans get better ones", () => {
  const st = fresh(42, "caravan");
  const car = st.factions[0];
  const other = st.factions.find(f => f.key === "hearth");
  assert(ASH.sim.tradeRate(car, "sell", "food") > ASH.sim.tradeRate(other, "sell", "food"));
  assert(ASH.sim.tradeRate(car, "buy", "fuel") < ASH.sim.tradeRate(other, "buy", "fuel"));
  const scrap0 = other.res.scrap;
  other.res.food = 20;
  assert(ASH.sim.trade(st, other, "sell", "food", 10));
  assertNear(other.res.scrap, scrap0 + 6, 0.01, "10 food -> 6 scrap");
  assert(!ASH.sim.trade(st, other, "sell", "food", 999), "cannot oversell");
});

/* ================= beacon ================= */
test("beacon: the long road to the sky answering", () => {
  const st = fresh(42);
  const f = st.factions[0];
  assert(typeof ASH.sim.canKindle(st, f) === "string", "blocked without tech");
  f.techs.push("crypto", "signal", "antenna");
  const bt = st.tiles[st.beacon.tile];
  bt.owner = f.id;
  f.res.scrap = 100; f.res.fuel = 50;
  assertEq(ASH.sim.canKindle(st, f), true);
  assert(ASH.sim.startKindle(st, f));
  ASH.sim.spawnUnit(st, f.id, "militia", st.beacon.tile);
  for (let i = 0; i < ASH.data.BEACON.turns; i++) {
    assert(!st.over, "not over yet at stage " + i);
    ASH.turn.endTurn(st);
    // keep the crew alive and the lights on for the test's purposes
    f.res.food = 50; f.res.scrap = 50; f.res.fuel = 20; f.hope = 80;
    if (st.over) break;
  }
  assert(st.over && st.over.win && st.over.kind === "beacon", "beacon victory fires");
});

/* ================= endgame ================= */
test("endgame: losing every settlement ends the run", () => {
  const st = fresh(42);
  for (const t of st.tiles) if (t.settlement && t.owner === 0) { t.settlement = null; t.owner = -1; }
  ASH.turn.endTurn(st);
  assert(st.over && !st.over.win, "defeat detected");
});

test("endgame: hope hitting zero is collapse", () => {
  const st = fresh(42);
  st.factions[0].hope = 0;
  ASH.turn.checkVictory(st);
  assert(st.over && st.over.kind === "collapse");
});

/* ================= save / load ================= */
test("save/load: round trip is lossless", () => {
  const st = fresh(42);
  ASH.turn.endTurn(st);
  ASH.turn.endTurn(st);
  const a = ASH.turn.serialize(st);
  const st2 = ASH.turn.deserialize(a);
  assert(st2, "deserialized");
  const b = ASH.turn.serialize(st2);
  assertEq(a, b, "round trip identical");
  validateState(st2, "loaded state");
});

/* ================= faction identities ================= */
test("factions: signature units and structures are faction-locked", () => {
  const st = fresh(42, "legion");
  const legion = st.factions[0];
  const hearth = st.factions.find(f => f.key === "hearth");
  const cap = st.tiles[legion.capital];
  legion.res.scrap = 100; legion.res.fuel = 50;
  cap.settlement.buildings.push("barracks");
  assertEq(ASH.sim.canRecruit(st, legion, cap, "warrig"), true, "legion may muster war-rigs");
  assert(typeof ASH.sim.canRecruit(st, legion, cap, "glowhound") === "string", "legion may not whistle for glowhounds");
  const hcap = st.tiles[hearth.capital];
  hearth.res.scrap = 100;
  assertEq(ASH.sim.canBuild(st, hearth, hcap, "granary"), true, "hearth may raise granaries");
  assert(typeof ASH.sim.canBuild(st, legion, cap, "granary") === "string", "granaries are hearth craft only");
});

test("factions: legion — spoils of war and no war-weariness", () => {
  const st = fresh(42, "legion");
  const legion = st.factions[0], prey = st.factions[1];
  let ground = -1, enemyGround = -1;
  for (const t of st.tiles) {
    if (t.terrain === "ash" && !t.units.length && !t.settlement && t.owner === -1) {
      const n = st.adj[t.i].find(x => st.tiles[x].terrain === "ash" && !st.tiles[x].units.length && !st.tiles[x].settlement && st.tiles[x].owner === -1);
      if (n !== undefined) { ground = t.i; enemyGround = n; break; }
    }
  }
  for (let i = 0; i < 3; i++) ASH.sim.spawnUnit(st, legion.id, "warrig", ground);
  const victim = ASH.sim.spawnUnit(st, prey.id, "scav", enemyGround);
  victim.hp = 30;
  const scrap0 = legion.res.scrap;
  const rep = ASH.combat.attack(st, legion.id, ground, enemyGround);
  assert(rep && rep.captured, "the rigs roll over them");
  assertNear(legion.res.scrap - scrap0, ASH.data.BALANCE.spoilsScrap, 0.001, "spoils paid");
  // war does not drag legion hope
  legion.res.food = 50; legion.res.scrap = 50; legion.res.fuel = 20;
  const hope0 = legion.hope;
  ASH.sim.economyTick(st, legion);
  assert(legion.hope >= hope0, "war-weariness does not touch the Legion");
});

test("factions: court of teeth — carrion and healing anywhere", () => {
  const st = fresh(42, "feral");
  const court = st.factions[0], prey = st.factions[1];
  // carrion: win a fight, eat
  let ground = -1, enemyGround = -1;
  for (const t of st.tiles) {
    if (t.terrain === "ash" && !t.units.length && !t.settlement && t.owner === -1) {
      const n = st.adj[t.i].find(x => st.tiles[x].terrain === "ash" && !st.tiles[x].units.length && !st.tiles[x].settlement && st.tiles[x].owner === -1);
      if (n !== undefined) { ground = t.i; enemyGround = n; break; }
    }
  }
  for (let i = 0; i < 3; i++) ASH.sim.spawnUnit(st, court.id, "raider", ground);
  const victim = ASH.sim.spawnUnit(st, prey.id, "scav", enemyGround);
  victim.hp = 30;
  const food0 = court.res.food;
  const rep = ASH.combat.attack(st, court.id, ground, enemyGround);
  assert(rep && rep.captured, "the pack takes them");
  assertNear(court.res.food - food0, ASH.data.BALANCE.carrionFood, 0.001, "carrion eaten");
  // healing anywhere: wounded court unit on neutral ground mends; hearth's does not
  const neutral = st.tiles.find(t => t.owner === -1 && t.terrain === "ash" && !t.units.length && t.rad === 0);
  const hound = ASH.sim.spawnUnit(st, court.id, "glowhound", neutral.i);
  hound.hp = 50;
  court.res.meds = 5;
  ASH.sim.healTick(st, court);
  assert(hound.hp > 50, "the Court mends on any ground");
  const hearth = st.factions.find(f => f.key === "hearth");
  const neutral2 = st.tiles.find(t => t.owner === -1 && t.terrain === "ash" && !t.units.length && t.rad === 0 && t.i !== neutral.i);
  const sick = ASH.sim.spawnUnit(st, hearth.id, "militia", neutral2.i);
  sick.hp = 50;
  hearth.res.meds = 5;
  ASH.sim.healTick(st, hearth);
  assertEq(sick.hp, 50, "ordinary folk need home soil");
});

test("factions: choir — the glass is their church", () => {
  const st = fresh(42, "choir");
  const choir = st.factions[0];
  // immune to the glow
  const glass = st.tiles.find(t => t.terrain === "glass" && !t.units.length);
  const pilgrim = ASH.sim.spawnUnit(st, choir.id, "militia", glass.i);
  ASH.sim.radTick(st, choir);
  assertEq(pilgrim.hp, 100, "the Glow does not touch them");
  // may settle the glass from turn one (far enough from other settlements)
  const site = st.tiles.find(t => t.terrain === "glass" && !t.site &&
    st.tiles.every(x => !x.settlement || ASH.worldgen.distT(st, x.i, t.i) >= 3));
  assert(site, "a glass site exists");
  const crew = ASH.sim.spawnUnit(st, choir.id, "reclaimer", site.i);
  assert(ASH.sim.canFound(st, crew.id), "the Choir settles the unsettleable");
  assert(ASH.sim.found(st, crew.id), "sanctum founded in the glass");
  const y = ASH.sim.yieldsOf(st, site);
  assert(y.know >= 3, "the glass sings knowledge to them (got " + y.know + ")");
  assert(y.food > 2, "and even a little food");
  // sermon: food for hope, then the choir rests
  choir.hope = 40; choir.res.food = 20;
  assertEq(ASH.sim.canSermon(st, choir), true);
  assert(ASH.sim.sermon(st, choir));
  assertEq(choir.hope, 48, "+8 hope");
  assert(typeof ASH.sim.canSermon(st, choir) === "string", "the Choir rests between sermons");
  st.turn += ASH.data.BALANCE.sermonCooldown;
  assertEq(ASH.sim.canSermon(st, choir), true, "and sings again in season");
  // no one else preaches
  assert(typeof ASH.sim.canSermon(st, st.factions[1]) === "string", "sermons are the Choir's alone");
});

test("factions: caravans — wheels and road-tolls", () => {
  const st = fresh(42, "caravan");
  const car = st.factions[0];
  assertEq(ASH.sim.unitMoveMax(st, 0, "militia"), ASH.data.UNITS.militia.move + 1, "every warband rolls further");
  const before = ASH.sim.factionIncome(st, car).prod.scrap;
  ASH.sim.declareWar(st, car, st.factions[1]);
  const after = ASH.sim.factionIncome(st, car).prod.scrap;
  assertNear(before - after, ASH.data.BALANCE.routeScrap, 0.001, "a war closes a road");
});

test("factions: archivists — older memory, cheaper remembrance", () => {
  const st = fresh(42, "archive");
  const arch = st.factions[0];
  assert(ASH.sim.hasTech(arch, "signal"), "they begin already listening");
  const crypto = ASH.sim.techByKey("crypto");
  assertEq(ASH.sim.techCostFor(arch, crypto), Math.round(crypto.cost * 0.8), "a fifth cheaper");
  assert(ASH.sim.canResearch(arch, "crypto"), "signal prereq already met");
  ASH.sim.setResearch(st, arch, "crypto");
  arch.research.progress = ASH.sim.techCostFor(arch, crypto); // exactly the discounted price
  arch.res.food = 50;
  ASH.sim.economyTick(st, arch);
  assert(ASH.sim.hasTech(arch, "crypto"), "completes at the discounted cost");
});

test("factions: hearth — the granary holds the line", () => {
  const st = fresh(42, "hearth");
  const hearth = st.factions[0];
  const cap = st.tiles[hearth.capital];
  assertEq(ASH.sim.maxBuildingsFor(hearth), ASH.data.BALANCE.maxBuildings + 1, "room for one more");
  cap.settlement.buildings.push("granary");
  cap.settlement.pop = 60; // far beyond the land
  hearth.res.food = 0;
  const pop0 = cap.settlement.pop, hope0 = hearth.hope;
  ASH.sim.economyTick(st, hearth);
  assertEq(cap.settlement.pop, pop0, "famine cannot kill behind a Great Granary");
  assert(hearth.hope < hope0, "but it still frightens");
});

/* ================= soundtrack identities ================= */
test("audio: every faction has a distinct, well-formed musical identity", () => {
  const T = ASH.audio.THEMES;
  assert(T.title, "the wasteland has its own theme");
  for (const f of ASH.data.FACTIONS) {
    const th = T[f.key];
    assert(th, "theme exists for " + f.key);
    assert(typeof th.root === "number" && th.root > 30 && th.root < 60, f.key + ": sane root pitch");
    assert(ASH.audio.SCALES[th.scale], f.key + ": scale '" + th.scale + "' exists");
    assert(Array.isArray(th.motif) && th.motif.length >= 3, f.key + ": has a signature motif");
    for (const m of th.motif)
      assert(Array.isArray(m) && m.length === 2 && typeof m[0] === "number" && m[1] > 0,
        f.key + ": motif notes are [degree, lengthInSteps]");
    assert(typeof th.percStyle === "string", f.key + ": percussion style");
    assert(th.pluck && th.drone && th.wind && th.pad, f.key + ": all voices specified");
    assert(typeof th.tempoMult === "number" && th.tempoMult > 0.5 && th.tempoMult < 2, f.key + ": tempo sane");
  }
  /* identities actually differ: no two factions share scale + percussion */
  const combos = ASH.data.FACTIONS.map(f => T[f.key].scale + "|" + T[f.key].percStyle);
  assertEq(new Set(combos).size, combos.length, "no two factions sound alike");
});

test("audio: theme switching works without an AudioContext", () => {
  ASH.audio.setTheme("legion");
  assertEq(ASH.audio.getTheme(), "legion");
  ASH.audio.setTheme("no-such-people");
  assertEq(ASH.audio.getTheme(), "title", "unknown keys fall back to the wasteland");
  const st = fresh(42, "choir");
  ASH.audio.updateMood(st);
  assertEq(ASH.audio.getTheme(), "choir", "updateMood adopts the player's theme");
  ASH.audio.updateMood(null);
  assertEq(ASH.audio.getTheme(), "title", "and the title takes it back");
});

/* ================= full autoplay ================= */
function autoplay(seed, turns) {
  const st = fresh(seed, "legion");
  for (let i = 0; i < turns && !st.over; i++) {
    // the player plays itself with the AI brain — exercises everything
    ASH.ai.takeTurn(st, st.factions[0]);
    // resolve any pending narrative events like a player would
    while (st.pendingEvents.length) {
      const pe = st.pendingEvents.shift();
      const ev = ASH.events.byId(pe.id);
      let done = false;
      for (let c = 0; c < ev.choices.length && !done; c++) {
        if (ASH.events.choiceAvailable(st, st.factions[0], ev.choices[c])) {
          ASH.events.resolve(st, pe.id, c);
          done = true;
        }
      }
    }
    ASH.turn.endTurn(st);
    validateState(st, "autoplay seed " + seed + " turn " + st.turn);
  }
  return st;
}

test("autoplay: 60 seasons of full simulation hold together", () => {
  for (const seed of [42, 7, 1337]) {
    const st = autoplay(seed, 60);
    assert(st.turn > 1, "game advanced");
    assert(st.log.length > 5, "the world had things to say");
  }
});

test("autoplay: identical seeds replay identically", () => {
  const a = ASH.turn.serialize(autoplay(99, 25));
  const b = ASH.turn.serialize(autoplay(99, 25));
  assertEq(a, b, "two runs of the same seed diverged");
});

test("autoplay: rival factions actually do things", () => {
  const st = autoplay(42, 40);
  let aiBuildings = 0, aiUnits = 0;
  for (const t of st.tiles)
    if (t.settlement && t.owner > 0) aiBuildings += t.settlement.buildings.length;
  for (const id in st.units) if (st.units[id].f > 0) aiUnits++;
  if (!st.over) {
    assert(aiBuildings > 0, "AI built nothing in 40 turns");
    assert(aiUnits > 0, "AI fields no warbands");
  }
});

/* ---------------- report ---------------- */
console.log("\n");
if (failed) {
  console.log(failed + " FAILED, " + passed + " passed\n");
  for (const f of failures) {
    console.log("✗ " + f.name);
    console.log("  " + (f.e.stack || f.e.message).split("\n").slice(0, 4).join("\n  "));
  }
  process.exit(1);
} else {
  console.log("all " + passed + " tests passed");
}
