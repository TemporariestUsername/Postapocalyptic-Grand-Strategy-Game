#!/usr/bin/env node
/* ASHFALL — headless screenshot tool.
 * Runs the actual game renderer against a skia canvas and writes PNGs of
 * the title vista and a lived-in world to docs/screenshots/. Used both as
 * a visual smoke test of render.js and to keep the README honest.
 *
 * Needs:  npm i --no-save @napi-rs/canvas
 * Run:    node tools/screenshot.js [seed]
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let createCanvas;
try { createCanvas = require("@napi-rs/canvas").createCanvas; }
catch (e) {
  console.log("screenshot: SKIPPED (@napi-rs/canvas not installed)");
  process.exit(0);
}

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "docs", "screenshots");
fs.mkdirSync(OUT, { recursive: true });

const FILES = [
  "js/util.js", "js/rng.js", "js/names.js", "js/data.js", "js/worldgen.js",
  "js/sim.js", "js/combat.js", "js/events.js", "js/ai.js", "js/turn.js",
  "js/render.js"
];
const ctx = {
  console, Math, JSON, Date,
  document: { createElement: (tag) => { if (tag !== "canvas") throw new Error("only canvas"); return createCanvas(1, 1); } }
};
vm.createContext(ctx);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
const ASH = ctx.ASH;

const seed = parseInt(process.argv[2] || "1457", 10);

/* ---------- a lived-in world ---------- */
const st = ASH.worldgen.newGame({ seed, playerKey: "hearth", difficulty: "ash" });
for (let i = 0; i < 22 && !st.over; i++) {
  ASH.ai.takeTurn(st, st.factions[0]);
  while (st.pendingEvents.length) {
    const pe = st.pendingEvents.shift();
    const ev = ASH.events.byId(pe.id);
    for (let c = 0; c < ev.choices.length; c++) {
      if (ASH.events.choiceAvailable(st, st.factions[0], ev.choices[c])) { ASH.events.resolve(st, pe.id, c); break; }
    }
  }
  ASH.turn.endTurn(st);
}
/* full reveal for the postcard */
for (const t of st.tiles) t.explored = true;
st.visible = st.tiles.map(() => 1);

function shoot(name, w, h, setup, frames) {
  const cv = createCanvas(w, h);
  ASH.render.init(cv);
  ASH.render.setState(st);
  setup();
  let t = 0;
  for (let k = 0; k < (frames || 30); k++) { ASH.render.frame(1 / 30, shoot.ui || {}); t += 1 / 30; }
  fs.writeFileSync(path.join(OUT, name), cv.toBuffer("image/png"));
  console.log("wrote docs/screenshots/" + name);
}

/* world overview */
shoot.ui = {};
shoot("world.png", 1280, 800, () => {
  ASH.render.centerOn(Math.floor(st.h / 2) * st.w + Math.floor(st.w / 2));
  ASH.render.camera.zoom = 0.82;
});

/* close-up on the player capital with a live selection */
const cap = st.factions[0].capital;
const capUnits = st.tiles[cap].units.filter(id => st.units[id].f === 0);
let reach = {};
if (capUnits.length) {
  st.units[capUnits[0]].moves = ASH.sim.unitMoveMax(st, 0, st.units[capUnits[0]].type);
  reach = ASH.sim.reachable(st, st.units[capUnits[0]]);
}
shoot.ui = { selectedTile: cap, selectedUnits: capUnits, reach, attackable: [], hoverTile: -1 };
shoot("capital.png", 1280, 800, () => {
  ASH.render.centerOn(cap);
  ASH.render.camera.zoom = 1.7;
  ASH.render.addFlash(st.adj[cap][0]);
  ASH.render.addFloat(st.adj[cap][1], "-34", "#e8a07a");
});

/* the title vista */
{
  const cv = createCanvas(1280, 720);
  for (let k = 0; k < 40; k++) ASH.render.drawTitle(cv, k / 30 + 2.05);
  const c = cv.getContext("2d");
  /* composite the wordmark like the DOM does */
  c.textAlign = "center";
  c.fillStyle = "#e8d9a0";
  c.shadowColor = "rgba(232,200,120,0.35)"; c.shadowBlur = 26;
  c.font = "bold 104px monospace";
  const title = "A S H F A L L";
  c.fillText(title, 640, 240);
  c.shadowBlur = 0;
  c.fillStyle = "#8f8470";
  c.font = "14px monospace";
  c.fillText("T H E   W O R L D   E N D E D .   T H E   A S H   R E M E M B E R S .", 640, 282);
  fs.writeFileSync(path.join(OUT, "title.png"), cv.toBuffer("image/png"));
  console.log("wrote docs/screenshots/title.png");
}
console.log("seed " + seed + " · turn " + st.turn + " · done");
