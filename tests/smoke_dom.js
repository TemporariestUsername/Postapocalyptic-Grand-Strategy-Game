#!/usr/bin/env node
/* ASHFALL — DOM smoke test (optional).
 * Boots the ENTIRE game — index.html, all scripts, renderer, UI, controller —
 * inside jsdom with a mocked canvas 2D context, then plays several seasons
 * through the same code paths a human uses: title menu -> faction select ->
 * new game -> tile clicks -> building -> recruiting -> research -> end turn
 * -> event modals -> save/load. Catches wiring bugs the pure-core tests
 * can't see.
 *
 * Needs jsdom:   npm i --no-save jsdom
 * Run:           node tests/smoke_dom.js
 * (Skips cleanly if jsdom is missing.)
 */
"use strict";
const fs = require("fs");
const path = require("path");

let JSDOM;
try { JSDOM = require("jsdom").JSDOM; }
catch (e) {
  console.log("smoke_dom: SKIPPED (jsdom not installed — `npm i --no-save jsdom`)");
  process.exit(0);
}

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

/* ---- a 2D context mock that records nothing and tolerates everything ---- */
function mockCtx() {
  const gradient = { addColorStop: () => {} };
  return new Proxy({}, {
    get(t, prop) {
      if (prop === "canvas") return { width: 800, height: 600 };
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "createImageData") return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (prop === "getImageData") return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (prop === "measureText") return () => ({ width: 10 });
      if (typeof prop === "string") return () => {};
      return undefined;
    },
    set() { return true; }
  });
}

const errors = [];
/* strip the src script tags — we inject the code as inline scripts below so
 * jsdom executes them with real browser semantics (classic script scope) */
const shellHtml = html.replace(/<script src="[^"]+"><\/script>\s*/g, "");
const dom = new JSDOM(shellHtml, {
  url: "http://localhost/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  beforeParse(window) {
    window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };
    window.AudioContext = undefined; // audio engine must no-op
    window.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 16);
  }
});
const { window } = dom;
window.addEventListener("error", (e) => errors.push(e.error || e.message));

/* Simulate real browser layout for the map container: it measures 0x0 while
 * the game screen is display:none and gains size once shown. This reproduces
 * the "black map" bug class — a canvas sized from a hidden container. */
{
  const wrap = window.document.getElementById("map-wrap");
  const gameHidden = () => window.document.getElementById("game-screen").classList.contains("hidden");
  Object.defineProperty(wrap, "clientWidth", { get: () => (gameHidden() ? 0 : 1024) });
  Object.defineProperty(wrap, "clientHeight", { get: () => (gameHidden() ? 0 : 700) });
}

/* load the scripts in page order as inline <script> elements */
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
for (const src of scripts) {
  const code = fs.readFileSync(path.join(ROOT, src), "utf8");
  const el = window.document.createElement("script");
  el.textContent = code;
  window.document.body.appendChild(el);
  if (errors.length) { console.error("FAILED loading " + src + ": " + errors[0]); process.exit(1); }
}

const document = window.document;
const ASH = window.ASH;
let failures = 0;
function check(cond, msg) {
  if (cond) { console.log("  ok  " + msg); }
  else { failures++; console.log("  FAIL " + msg); }
}
function click(id) {
  const el = document.getElementById(id);
  if (!el) { failures++; console.log("  FAIL missing element #" + id); return; }
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

(async function main() {
  /* boot fires on DOMContentLoaded — jsdom already parsed, main.js calls boot() directly */
  await new Promise(r => setTimeout(r, 50));

  console.log("title screen:");
  check(!document.getElementById("title-screen").classList.contains("hidden"), "title visible");
  click("btn-about");
  check(!document.getElementById("about-panel").classList.contains("hidden"), "about opens");
  click("btn-new");
  check(!document.getElementById("setup-panel").classList.contains("hidden"), "setup opens");
  check(document.querySelectorAll(".f-card").length === 6, "six faction cards");

  /* pick the Legion, cruel world, fixed seed */
  document.querySelector('.f-card[data-key="legion"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.querySelector('.diff-btn[data-key="cinder"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("seed-input").value = "424242";

  console.log("new game:");
  click("btn-begin");
  await new Promise(r => setTimeout(r, 100));
  check(!document.getElementById("game-screen").classList.contains("hidden"), "game screen shown");
  const ctrlState = () => window.ASH && getState();
  function getState() {
    /* the controller is closured; read through the UI side effects instead */
    return null;
  }
  check(document.getElementById("top-fname").textContent.includes("Legion"), "top bar shows faction");
  check(document.getElementById("resources").children.length === 5, "five resources shown");
  check(document.getElementById("log-entries").children.length > 0, "ledger has entries");
  /* the map canvas must be sized from its NOW-VISIBLE container, not the
   * 0x0 it measured while hidden at boot (the black-map bug) */
  await new Promise(r => setTimeout(r, 120)); // let a few frames run
  const mapCv = document.getElementById("map");
  check(mapCv.width === 1024 && mapCv.height === 700,
    "map canvas sized to its container (" + mapCv.width + "x" + mapCv.height + ")");

  /* help modal auto-opens on first run — close it */
  await new Promise(r => setTimeout(r, 700));
  if (!document.getElementById("modal-root").classList.contains("hidden")) {
    const closeBtn = document.querySelector("#m-close");
    if (closeBtn) closeBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  }
  check(document.getElementById("modal-root").classList.contains("hidden"), "help modal closed");

  console.log("side panel & actions:");
  /* select own capital through the overview link */
  const setLink = document.querySelector(".set-link");
  check(!!setLink, "overview lists holdings");
  setLink.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 30));
  check(!!document.querySelector(".set-name"), "settlement panel opens");
  const buildBtn = document.querySelector(".build-btn:not([disabled])");
  check(!!buildBtn, "a building is affordable on turn 1");
  if (buildBtn) buildBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 30));
  check(!!document.querySelector(".b-row.building"), "construction shows in queue");
  const recruitBtn = document.querySelector(".recruit-btn:not([disabled])");
  check(!!recruitBtn, "a unit is recruitable");
  if (recruitBtn) recruitBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  console.log("modals:");
  click("btn-tech");
  check(document.querySelectorAll(".tech-card").length === ASH.data.TECHS.length, "tech tree complete");
  const techCard = document.querySelector(".tech-card.avail");
  check(!!techCard, "a tech is available");
  if (techCard) techCard.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 30));
  check(!!document.querySelector(".tech-card.current"), "research begins");
  document.querySelector("#m-close").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  click("btn-factions");
  check(document.querySelectorAll(".fac-row").length === 5, "five rivals listed");
  document.querySelector("#m-close").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  click("btn-market");
  check(document.querySelectorAll(".mk-row").length === 3, "market rows render");
  const sellBtn = document.querySelector('[data-dir="sell"]');
  if (sellBtn) sellBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 30));
  document.querySelector("#m-close").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  console.log("seasons:");
  for (let i = 0; i < 8; i++) {
    click("btn-endturn");
    await new Promise(r => setTimeout(r, 140));
    /* resolve any event/peace modal like a player */
    for (let guard = 0; guard < 4; guard++) {
      const choice = document.querySelector(".ev-choice:not([disabled])");
      if (!choice) break;
      choice.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await new Promise(r => setTimeout(r, 60));
      const ok = document.querySelector("#ev-ok");
      if (ok) { ok.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); await new Promise(r => setTimeout(r, 250)); }
    }
  }
  const seasonText = document.querySelector(".season-year").textContent;
  check(/Year 8[89]/.test(seasonText), "two years have passed (" + seasonText + ")");
  check(window.localStorage.getItem("ashfall.save.v1") !== null, "autosave written");

  console.log("save/load:");
  click("btn-settings");
  document.querySelector("#s-quit").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 50));
  check(!document.getElementById("title-screen").classList.contains("hidden"), "back at title");
  check(!document.getElementById("btn-continue").disabled, "continue enabled");
  click("btn-continue");
  await new Promise(r => setTimeout(r, 80));
  check(!document.getElementById("game-screen").classList.contains("hidden"), "loaded back into game");
  check(/Year 8[89]/.test(document.querySelector(".season-year").textContent), "load restored the date");

  /* let a few frames run to shake out renderer errors */
  await new Promise(r => setTimeout(r, 400));

  if (errors.length) {
    failures += errors.length;
    console.log("\nwindow errors:");
    errors.slice(0, 5).forEach(e => console.log("  " + (e && e.stack ? e.stack.split("\n")[0] : e)));
  }
  console.log("");
  if (failures) { console.log("smoke_dom: " + failures + " FAILURE(S)"); process.exit(1); }
  console.log("smoke_dom: all checks passed");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
