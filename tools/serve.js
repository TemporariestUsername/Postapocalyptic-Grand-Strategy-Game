#!/usr/bin/env node
/* ASHFALL — tiny static server, zero dependencies.
 * The game also runs straight off the filesystem (open index.html), but a
 * proper origin makes localStorage saves durable across browsers.
 *
 * Run:  node tools/serve.js [port]
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = parseInt(process.argv[2] || "8080", 10);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".md": "text/plain; charset=utf-8",
  ".ico": "image/x-icon"
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found in the ash"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log("ASHFALL serving at  http://localhost:" + PORT + "  — bring a lamp.");
});
