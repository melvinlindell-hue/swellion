// Swellion – pixelscen: älgen springer genom Sverige. 1 poäng = 1 meter, ny miljö var 100:e meter.
(function () {
  "use strict";
  var W = 288, H = 120, GY = 100, PX_PER_M = 4, SEG = 100 * PX_PER_M, MOOSE_X = 92;
  var REGIONS = ["Fjällskogen", "Skogen", "Dalarna", "Stockholm", "Göteborg", "Lund"];

  var cv, ctx, meters = 0, target = 0, t0 = performance.now(), frame = 0, lastStep = 0, region = 0, onRegion = null;
  var flakes = [];
  for (var i = 0; i < 46; i++) flakes.push({ x: Math.random() * W, y: Math.random() * H, s: 0.3 + Math.random() * 0.6 });

  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function r(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
  function envAt(wx) { return Math.max(0, Math.min(5, Math.floor(wx / SEG))); }
  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function mix(a, b, t) { a = hex(a); b = hex(b); return "rgb(" + [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * t); }).join(",") + ")"; }

  var SKY = [["#0a1633", "#2b4f86"], ["#4f9be0", "#c4e6ff"], ["#6fb2ea", "#ffe3a8"], ["#4a8ad6", "#d2e8ff"], ["#76869c", "#c6cfda"], ["#5f7fd8", "#ffcf8f"]];
  var GROUND = [["#eef4fb", "#c6d6ea"], ["#3f8a3c", "#2e6b2d"], ["#5aa548", "#43873a"], ["#9ca2aa", "#80868f"], ["#6c727a", "#575c63"], ["#b39876", "#8e7556"]];

  // ---------- Sprites ----------
  var MOOSE = [
    ".............A.A.....A.A.A..",
    ".............AAA....AAAAAA..",
    "..............AAAA.AAAAA....",
    "................AAAAA.......",
    ".................DDD........",
    "...........LLL..DDDDD.......",
    "........LLLLLLLLDDEDDDD.....",
    "....LLLBBBBBBBBBBDDDDDDDD...",
    "..BBBBBBBBBBBBBBBDD..DDDDN..",
    ".BBBBBBBBBBBBBBBBD....DDD...",
    ".BBBBBBBBBBBBBBBBDD.........",
    ".BBBBBBBBBBBBBBBBD..........",
    "..BBBBBBBBBBBBBBB...........",
    "...DDDDDDDDDDDDD............"
  ];
  var MC = { A: "#eadbb0", B: "#6b4426", D: "#4a2e18", E: "#0d0d0d", N: "#1a0f08", L: "#8a5a34" };
  function moose(x, y, step, running) {
    var S = 2, rr = r; r = function (a, b, w, h, c) { rr(x + (a - x) * S, y + (b - y) * S, w * S, h * S, c); };
    var bob = running ? [0, -1, -2, -1][step % 4] : 0;
    var legs = running
      ? [[[3, -6, 1], [6, -3, 0], [12, 21, 1], [15, 24, 0]], [[3, -1, 1], [6, 2, 0], [12, 16, 1], [15, 19, 0]], [[3, 9, 1], [6, 11, 0], [12, 7, 1], [15, 9, 0]], [[3, 2, 1], [6, 5, 0], [12, 13, 1], [15, 16, 0]]][step % 4]
      : [[2, 2, 1], [5, 5, 0], [13, 13, 1], [15, 15, 0]];
    legs.forEach(function (l) {
      for (var k = 0; k < 13; k++) {
        var lx = Math.round(l[0] + (l[1] - l[0]) * k / 12);
        var lc = k === 12 ? "#1a0f08" : k < 5 ? (l[2] ? "#3f2715" : "#5c3a1f") : (l[2] ? "#8c7a64" : "#bba786");
        r(x + lx, y + 13 + k + (k < 3 ? bob : 0), 2, 1, lc);
      }
    });
    for (var row = 0; row < MOOSE.length; row++) for (var col = 0; col < MOOSE[row].length; col++) {
      var ch = MOOSE[row][col]; if (ch !== ".") r(x + col, y + row + bob, 1, 1, MC[ch]);
    }
    r(x, y + 9 + bob, 1, 2, "#4a2e18"); // svans
    r = rr;
  }
  function spruce(x, h, snowy, dark) {
    var tier = Math.max(5, Math.floor(h / 3)), c = dark || "#1f4d2c";
    r(x - 1, GY - 3, 2, 3, "#5a3a1e");
    for (var k = 0; k < h; k++) {
      var w = 1 + Math.floor((k % tier) * 0.9 + k * 0.22);
      var y = GY - 3 - h + k;
      r(x - w, y, w * 2, 1, c);
      if (snowy && k % tier < 2) { r(x - w, y, Math.max(1, w), 1, "#f4f8ff"); }
    }
    if (snowy) r(x - 1, GY - 3 - h, 2, 1, "#ffffff");
  }
  function birch(x, h) {
    r(x, GY - h, 2, h, "#f2f0e8");
    for (var k = 3; k < h; k += 4) r(x + (k % 8 ? 0 : 1), GY - h + k, 1, 1, "#222");
    for (var yy = -6; yy <= 5; yy++) { var w = Math.round(Math.sqrt(36 - yy * yy) * 1.1); r(x + 1 - w, GY - h - 3 + yy, w * 2, 1, yy < -2 ? "#7ec850" : "#5aa83c"); }
  }
  function roundTree(x, h) {
    r(x, GY - h, 2, h, "#5a3a1e");
    for (var yy = -7; yy <= 6; yy++) { var w = Math.round(Math.sqrt(49 - yy * yy)); r(x + 1 - w, GY - h - 3 + yy, w * 2, 1, yy < -3 ? "#6fae3c" : "#4f8f2c"); }
  }
  var DIG = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001001001001", "111101111101111", "111101111001111"];
  function number(n, x, y, c) {
    String(n).split("").forEach(function (d, i) {
      var g = DIG[+d]; for (var p = 0; p < 15; p++) if (g[p] === "1") r(x + i * 4 + (p % 3), y + Math.floor(p / 3), 1, 1, c);
    });
  }
  function milepost(x, m) {
    r(x, GY - 34, 13, 34, "#1f5fd0"); r(x + 1, GY - 35, 11, 1, "#1f5fd0"); r(x + 3, GY - 36, 7, 1, "#1f5fd0");
    r(x + 1, GY - 33, 1, 32, "#4f8ff0"); r(x + 11, GY - 34, 1, 34, "#143f8f");
    number(m, x + 1, GY - 30, "#ffffff");
    r(x - 1, GY - 1, 15, 1, "rgba(0,0,0,.35)");
  }

  // ---------- Landmärken ----------
  function lavvu(x) {
    for (var k = 0; k < 20; k++) { var w = Math.floor(k * 0.6); r(x - w, GY - 20 + k, w * 2 + 1, 1, k % 5 === 0 ? "#b0453b" : "#d9cfb8"); }
    r(x - 1, GY - 23, 1, 4, "#5a3a1e"); r(x + 1, GY - 23, 1, 4, "#5a3a1e");
    r(x - 2, GY - 7, 5, 7, "#3a2a1a");
  }
  function mooseSign(x) {
    r(x, GY - 26, 2, 26, "#888");
    for (var k = 0; k < 16; k++) { var w = Math.floor(k / 2) + 1; r(x + 1 - w, GY - 44 + k, w * 2, 1, k > 13 ? "#d42a2a" : "#ffcf1f"); r(x + 1 - w, GY - 44 + k, 1, 1, "#d42a2a"); r(x + w, GY - 44 + k, 1, 1, "#d42a2a"); }
    r(x - 3, GY - 35, 7, 2, "#111"); r(x + 3, GY - 37, 2, 3, "#111"); r(x - 2, GY - 33, 1, 2, "#111"); r(x + 2, GY - 33, 1, 2, "#111"); r(x + 3, GY - 39, 3, 1, "#111");
  }
  function stuga(x) {
    r(x, GY - 18, 30, 18, "#a3241d");
    for (var k = 0; k < 10; k++) r(x - 2 + k, GY - 18 - k, 34 - k * 2, 1, "#3b3b3b");
    r(x, GY - 18, 1, 18, "#fff"); r(x + 29, GY - 18, 1, 18, "#fff");
    r(x + 5, GY - 13, 6, 6, "#fff"); r(x + 6, GY - 12, 4, 4, "#8fc4f0");
    r(x + 19, GY - 13, 6, 6, "#fff"); r(x + 20, GY - 12, 4, 4, "#8fc4f0");
    r(x + 13, GY - 11, 4, 11, "#fff"); r(x + 14, GY - 10, 2, 10, "#2d5a8a");
  }
  function dalahast(x) {
    var red = "#d21f1f";
    r(x, GY - 6, 16, 6, "#2e5aa8");                          // sockel
    r(x + 2, GY - 18, 12, 6, red);                           // kropp
    r(x + 2, GY - 12, 3, 6, red); r(x + 11, GY - 12, 3, 6, red); // ben
    r(x + 11, GY - 26, 4, 9, red); r(x + 13, GY - 28, 5, 4, red); // hals + huvud
    r(x + 10, GY - 25, 2, 7, "#1b1b1b");                      // man
    r(x + 4, GY - 16, 2, 2, "#ffd23f"); r(x + 7, GY - 17, 3, 1, "#2a7d3c"); r(x + 7, GY - 15, 3, 1, "#ffd23f");
    r(x + 1, GY - 17, 1, 4, "#1b1b1b");                       // svans
  }
  function majstang(x) {
    r(x, GY - 40, 2, 40, "#3d7a2e");
    r(x - 10, GY - 34, 22, 2, "#3d7a2e");
    [[-10, -32], [10, -32]].forEach(function (p) { for (var k = 0; k < 6; k++) r(x + p[0] + (k % 2), GY + p[1] + k, 2, 1, "#3d7a2e"); r(x + p[0] - 1, GY + p[1] + 6, 4, 4, "#2f6a24"); });
    r(x - 1, GY - 43, 4, 3, "#ffd23f"); r(x - 4, GY - 26, 1, 1, "#ff6b9a"); r(x + 5, GY - 20, 1, 1, "#ffd23f"); r(x + 3, GY - 12, 1, 1, "#fff");
  }
  function gamlaStan(x) {
    var cols = ["#e8b43a", "#d9662b", "#b8422e", "#e9cf7a", "#c97b4a"];
    for (var i = 0; i < 5; i++) {
      var hx = x + i * 11, hh = 26 + (i % 2) * 6, c = cols[i];
      r(hx, GY - hh, 11, hh, c);
      for (var k = 0; k < 6; k++) r(hx + k, GY - hh - 6 + k < GY - hh ? GY - hh - 6 + k : GY - hh, 11 - k * 2 > 0 ? 11 - k * 2 : 1, 1, c);
      for (var wy = GY - hh + 4; wy < GY - 6; wy += 7) { r(hx + 2, wy, 2, 3, "#fff6d6"); r(hx + 7, wy, 2, 3, "#fff6d6"); }
      r(hx + 4, GY - 6, 3, 6, "#4a2a1a");
    }
  }
  function stadshuset(x) {
    var brick = "#a5482f";
    r(x - 22, GY - 26, 30, 26, brick);
    for (var wx = x - 19; wx < x + 6; wx += 5) r(wx, GY - 20, 2, 5, "#5a2416");
    r(x + 8, GY - 70, 12, 70, brick);                       // torn
    r(x + 9, GY - 70, 1, 70, "#c45c3e");
    r(x + 11, GY - 62, 2, 6, "#5a2416"); r(x + 15, GY - 62, 2, 6, "#5a2416");
    r(x + 10, GY - 76, 8, 6, "#3f7f6a");                    // koppar
    r(x + 12, GY - 82, 4, 6, "#3f7f6a");
    r(x + 10, GY - 87, 2, 2, "#ffd23f"); r(x + 13, GY - 88, 2, 3, "#ffd23f"); r(x + 16, GY - 87, 2, 2, "#ffd23f"); // tre kronor
  }
  function lappstiftet(x) {
    for (var k = 0; k < 66; k += 6) { r(x, GY - 66 + k, 9, 3, "#d8262c"); r(x, GY - 63 + k, 9, 3, "#f2f2f2"); }
    r(x + 2, GY - 72, 5, 6, "#d8262c"); r(x + 3, GY - 76, 3, 4, "#d8262c");
  }
  function kran(x) {
    var c = "#e05a2a";
    r(x, GY - 60, 3, 60, c); r(x + 10, GY - 60, 3, 60, c);
    r(x - 2, GY - 64, 30, 4, c); r(x - 6, GY - 64, 4, 4, "#333");
    for (var k = 0; k < 60; k += 8) r(x + 3, GY - 60 + k, 7, 1, c);
    r(x + 24, GY - 60, 1, 22, "#222"); r(x + 22, GY - 38, 5, 3, "#333");
  }
  function barken(x) {
    r(x - 6, GY - 3, 60, 5, "#3f6f94"); r(x - 6, GY - 3, 60, 1, "#8fb8e8");
    r(x, GY - 10, 46, 6, "#f4f4f4"); r(x + 2, GY - 4, 42, 2, "#f4f4f4"); r(x, GY - 10, 46, 1, "#1d3557");
    [8, 20, 32].forEach(function (m) { r(x + m, GY - 46, 1, 36, "#3b2a1a"); for (var k = 0; k < 3; k++) r(x + m - 5 + k, GY - 42 + k * 10, 11 - k * 2, 7, "#fffaf0"); });
    for (var k = 0; k < 8; k++) r(x + 32 + k * 2, GY - 40 + k * 4, 1, 1, "#555");
  }
  function domkyrkan(x) {
    // Lunds domkyrka sedd framifrån: två torn med pyramidtak och gavel emellan
    var st = "#a99278", lt = "#bda88c", dk = "#6f5c47", roof = "#4c6f63";
    r(x + 16, GY - 40, 26, 40, st);                                  // mittparti
    for (var k = 0; k < 10; k++) r(x + 16 + k, GY - 40 - k, 26 - k * 2, 1, st); // gavel
    r(x + 26, GY - 46, 6, 4, dk); r(x + 27, GY - 47, 4, 1, dk);      // rundfönster
    [x, x + 42].forEach(function (tx) {
      r(tx, GY - 72, 16, 72, st); r(tx, GY - 72, 2, 72, lt);
      for (var k = 0; k < 16; k++) r(tx + Math.floor(k / 2), GY - 88 + k, 16 - Math.floor(k / 2) * 2, 1, roof);
      r(tx + 3, GY - 64, 3, 8, dk); r(tx + 10, GY - 64, 3, 8, dk);   // klockluckor
      r(tx + 3, GY - 65, 3, 1, dk); r(tx + 10, GY - 65, 3, 1, dk);
      r(tx + 6, GY - 44, 4, 8, dk);
      for (var yy = GY - 52; yy < GY; yy += 13) r(tx, yy, 16, 1, "#8f7a62");
    });
    r(x + 22, GY - 22, 14, 22, "#3e2c1c");                         // portal
    for (var k = 0; k < 4; k++) r(x + 22 + k, GY - 23 - k, 14 - k * 2, 1, "#3e2c1c");
    r(x + 20, GY - 26, 2, 26, lt); r(x + 36, GY - 26, 2, 26, lt);
  }
  function goalFlag(x) {
    r(x, GY - 30, 2, 30, "#ddd");
    for (var yy = 0; yy < 10; yy++) for (var xx = 0; xx < 16; xx++) r(x + 2 + xx, GY - 30 + yy, 1, 1, ((Math.floor(xx / 2) + Math.floor(yy / 2)) % 2) ? "#111" : "#fff");
  }
  var LANDMARKS = [
    { at: 90, w: 30, d: lavvu },
    { at: SEG + 130, w: 20, d: mooseSign },
    { at: 2 * SEG + 30, w: 34, d: stuga }, { at: 2 * SEG + 90, w: 20, d: dalahast }, { at: 2 * SEG + 150, w: 24, d: majstang },
    { at: 3 * SEG + 20, w: 56, d: gamlaStan }, { at: 3 * SEG + 120, w: 50, d: stadshuset },
    { at: 4 * SEG + 20, w: 12, d: lappstiftet }, { at: 4 * SEG + 70, w: 30, d: kran }, { at: 4 * SEG + 120, w: 48, d: barken },
    { at: 5 * SEG + 84, w: 60, d: domkyrkan }, { at: 5 * SEG + 50, w: 20, d: goalFlag }
  ];
  function nearLandmark(wx) { for (var i = 0; i < LANDMARKS.length; i++) { var l = LANDMARKS[i]; if (wx > l.at - 34 && wx < l.at + l.w + 24) return true; } return false; }

  // ---------- Rita ----------
  function draw(now, camOverride, noMoose) {
    var cam = camOverride !== undefined ? camOverride : meters * PX_PER_M - MOOSE_X, mwx = cam + MOOSE_X;
    var f = mwx / SEG, e0 = Math.max(0, Math.min(5, Math.floor(f))), fr = f - e0, e1 = Math.min(5, e0 + 1), bt = fr > 0.8 && e0 < 5 ? (fr - 0.8) / 0.2 : 0;
    var weight0 = e0 === 0 ? 1 - bt : 0;

    // himmel
    var top = mix(SKY[e0][0], SKY[e1][0], bt), bot = mix(SKY[e0][1], SKY[e1][1], bt);
    for (var b = 0; b < 8; b++) r(0, b * 12, W, 12, mix(rgbToHex(top), rgbToHex(bot), b / 7));
    // stjärnor + norrsken
    if (weight0 > 0) {
      ctx.globalAlpha = weight0;
      for (var s = 0; s < 34; s++) r(hash(s) * W, hash(s + 50) * 55, 1, 1, "#fff");
      for (var s2 = 0; s2 < 7; s2++) { var sx = hash(s2 + 7) * W, sy = 6 + hash(s2 + 77) * 40, tw = (Math.sin(now * 0.003 + s2) > 0.6) ? 2 : 1; r(sx - tw, sy, tw * 2 + 1, 1, "#fff"); r(sx, sy - tw, 1, tw * 2 + 1, "#fff"); }
      for (var x = 0; x < W; x++) {
        var ph = (x + cam * 0.1) * 0.06 + now * 0.0004, on = Math.sin(ph * 1.7) + Math.sin(ph * 0.6 + 1);
        if (on < -0.4) continue;
        var top = 4 + Math.sin(ph) * 4 + Math.sin(x * 0.21) * 2, len = 14 + 8 * Math.sin(ph * 1.3 + 2) + on * 4;
        r(x, top, 1, 3, "#c4ffe4"); r(x, top + 3, 1, len * 0.4, "#5dffb0"); r(x, top + 3 + len * 0.4, 1, len * 0.4, "#2fd08f");
        ctx.globalAlpha = weight0 * 0.5; r(x, top + 3 + len * 0.8, 1, len * 0.5, "#1f9c78"); ctx.globalAlpha = weight0;
      }
      ctx.globalAlpha = 1;
    }
    // sol
    if (e0 === 2 || e0 === 5) { r(190, 18, 14, 14, "#fff2b0"); r(188, 20, 18, 10, "#fff2b0"); }
    // moln
    if (e0 >= 1 && e0 <= 4) {
      ctx.globalAlpha = 1 - (e0 === 1 ? 0 : 0);
      for (var c = 0; c < 4; c++) {
        var cx = ((hash(c + 9) * 400 - cam * 0.15 - now * 0.004) % 300 + 300) % 300 - 30, cy = 12 + hash(c + 3) * 26;
        var col = e0 === 4 ? "#9aa5b4" : "#ffffff";
        r(cx, cy, 26, 6, col); r(cx + 5, cy - 4, 14, 4, col); r(cx + 3, cy + 6, 20, 2, col);
      }
      ctx.globalAlpha = 1;
    }
    // bortre lager (parallax)
    for (var x2 = 0; x2 < W; x2++) {
      var fwx = cam * 0.4 + x2, fe = envAt((cam + x2 * 1) * 1 + (fwx - cam * 0.4 - x2) * 0 ), h, colr;
      fe = envAt(cam + x2 * 1 + (x2 - MOOSE_X) * 0); // följer marken för tydliga miljöbyten
      if (fe === 0) { h = 34 + 16 * Math.sin(fwx * 0.03) + 7 * Math.sin(fwx * 0.077); r(x2, GY - h, 1, h, "#8297b8"); r(x2, GY - h, 1, Math.max(0, h - 30), "#f2f6ff"); }
      else if (fe === 1) { h = 16 + 5 * Math.sin(fwx * 0.05) + Math.floor(hash(Math.floor(fwx / 3)) * 5); r(x2, GY - h, 1, h, "#2b5538"); }
      else if (fe === 2) { h = 18 + 7 * Math.sin(fwx * 0.03); r(x2, GY - h, 1, h, "#557a8a"); r(x2, GY - 9, 1, 9, "#4f8fc4"); }
      else if (fe === 3) { h = 10 + Math.floor(hash(Math.floor(fwx / 7)) * 16); r(x2, GY - h - 8, 1, h, "#7389ab"); r(x2, GY - 8, 1, 8, "#3f74b8"); if ((x2 + now * 0.01) % 9 < 1) r(x2, GY - 6, 3, 1, "#8fb8e8"); }
      else if (fe === 4) { h = 9 + 4 * Math.sin(fwx * 0.04); r(x2, GY - h - 10, 1, h, "#6c7b8b"); r(x2, GY - 10, 1, 10, "#466983"); }
      else { h = 5 + 2 * Math.sin(fwx * 0.06); r(x2, GY - h, 1, h, "#93b356"); }
    }
    // mark
    for (var x3 = 0; x3 < W; x3++) {
      var gwx = cam + x3, ge = envAt(gwx), g = GROUND[ge];
      r(x3, GY, 1, H - GY, g[0]);
      for (var yy = GY + 2; yy < H; yy += 3) if (hash(Math.floor(gwx) * 7 + yy) > 0.78) r(x3, yy, 1, 1, g[1]);
      if (ge >= 3) { if (Math.floor(gwx) % 8 === 0) r(x3, GY, 1, H - GY, g[1]); }
      r(x3, GY, 1, 1, ge === 0 ? "#ffffff" : g[1]);
    }
    for (var x4 = 0; x4 < W; x4++) {
      var fw = Math.floor(cam + x4), fe2 = envAt(fw);
      if (hash(fw * 3.1) > 0.93) {
        if (fe2 === 1 || fe2 === 2 || fe2 === 5) { r(x4, GY + 4 + hash(fw) * 12, 1, 2, "#2c6a2a"); r(x4 + 1, GY + 3 + hash(fw) * 12, 1, 3, "#7ccf55"); }
        else if (fe2 === 0) { r(x4, GY + 5 + hash(fw) * 10, 3, 1, "#b8c9e0"); }
      }
    }
    // landmärken
    LANDMARKS.forEach(function (l) { var sx = l.at - cam; if (sx > -110 && sx < W + 20) l.d(sx); });
    // milstolpar
    for (var m = 1; m <= 5; m++) { var px = m * SEG - cam + 30; if (px > -20 && px < W + 20) milepost(px, m * 100); }
    // träd och småsaker
    var first = Math.floor((cam - 20) / 14), last = Math.floor((cam + W + 20) / 14);
    for (var i = first; i <= last; i++) {
      var wx = i * 14 + Math.floor(hash(i) * 8), e = envAt(wx), hv = hash(i + 1000), sx2 = wx - cam;
      if (nearLandmark(wx) || Math.abs(wx - Math.round(wx / SEG) * SEG - 34) < 12) continue;
      if (e === 0) { if (hv < 0.7) spruce(sx2, 24 + Math.floor(hash(i + 3) * 24), true); else if (hv < 0.85) r(sx2 - 4, GY - 3, 9, 3, "#ffffff"); }
      else if (e === 1) { if (hv < 0.5) spruce(sx2, 26 + Math.floor(hash(i + 3) * 22), false); else if (hv < 0.8) birch(sx2, 24 + Math.floor(hash(i + 4) * 12)); else if (hv < 0.9) { r(sx2 - 4, GY - 4, 9, 4, "#7d7f86"); r(sx2 - 3, GY - 5, 6, 1, "#5f8f3a"); } }
      else if (e === 2) { if (hv < 0.35) birch(sx2, 22 + Math.floor(hash(i + 4) * 12)); else if (hv < 0.6) spruce(sx2, 24 + Math.floor(hash(i + 3) * 16), false, "#2a5a32"); }
      else if (e === 3 || e === 4) { if (hv < 0.3) { r(sx2, GY - 20, 1, 20, "#333"); r(sx2 - 1, GY - 21, 4, 2, "#333"); r(sx2, GY - 19, 2, 1, "#ffe9a0"); } }
      else { if (hv < 0.45) roundTree(sx2, 18 + Math.floor(hash(i + 4) * 8)); }
    }
    // älgen
    var running = Math.abs(target - meters) > 0.01;
    if (running && now - lastStep > 70) { frame++; lastStep = now; }
    if (!noMoose) moose(MOOSE_X - 28, GY - 52, frame, running);
    // nederbörd
    if (weight0 > 0 || (e0 === 4 && bt < 1)) {
      flakes.forEach(function (p) {
        if (weight0 > 0) { p.y += p.s * 0.6; p.x -= p.s * 0.3 + (running ? 1.2 : 0); ctx.globalAlpha = weight0; r(p.x, p.y, 1, 1, "#ffffff"); }
        else { p.y += 3 * p.s + 1; p.x -= 0.6 + (running ? 1.2 : 0); ctx.globalAlpha = 0.6; r(p.x, p.y, 1, 3, "#c9d6e6"); }
        if (p.y > H) { p.y = -2; p.x = Math.random() * W; } if (p.x < 0) p.x += W;
      });
      ctx.globalAlpha = 1;
    }
  }
  function rgbToHex(rgb) { var m = rgb.match(/\d+/g); return "#" + m.map(function (v) { return (+v).toString(16).padStart(2, "0"); }).join(""); }

  function loop(now) {
    var dt = Math.min(50, now - t0); t0 = now;
    if (meters < target) {
      var speed = Math.max(35, Math.min(90, (target - meters) * 1.6)); // m/s
      meters = Math.min(target, meters + speed * dt / 1000);
      var reg = Math.min(5, Math.floor(meters / 100 + 1e-6));
      if (reg !== region) { region = reg; if (onRegion) onRegion(reg, REGIONS[reg]); }
    }
    draw(now);
    if (window.SwellionScene.onTick) window.SwellionScene.onTick(meters);
    requestAnimationFrame(loop);
  }

  function renderStrip(canvas) {
    var off = document.createElement("canvas"); off.width = W; off.height = H;
    var main = ctx; ctx = off.getContext("2d");
    var CAMS = [-10, SEG + 20, 2 * SEG - 10, 3 * SEG - 20, 4 * SEG - 10, 5 * SEG + 40];
    var PW = 190, SX = 30;
    canvas.width = PW * 6; canvas.height = H;
    var sctx = canvas.getContext("2d");
    var saveM = meters, saveT = target;
    CAMS.forEach(function (c, i) {
      meters = target = (c + MOOSE_X) / PX_PER_M;   // himmel/väder följer panelen
      draw(2000, c, true);
      sctx.drawImage(off, SX, 0, PW, H, i * PW, 0, PW, H);
    });
    meters = saveM; target = saveT; ctx = main;
  }

  window.SwellionScene = {
    regions: REGIONS,
    init: function (canvas) { cv = canvas; cv.width = W; cv.height = H; ctx = cv.getContext("2d"); requestAnimationFrame(loop); },
    set: function (m) { meters = target = m; region = Math.min(5, Math.floor(m / 100 + 1e-6)); },
    runTo: function (m) { target = m; },
    regionFor: function (m) { return REGIONS[Math.min(5, Math.floor(m / 100 + 1e-6))]; },
    onRegion: function (cb) { onRegion = cb; },
    onTick: null,
    renderStrip: renderStrip,
    drawMoose: function (canvas) { var c = canvas.getContext("2d"), main = ctx; canvas.width = 62; canvas.height = 56; ctx = c; moose(2, 2, 1, true); ctx = main; },
    // för tester/skärmdumpar
    _draw: function (m, now) { meters = target = m; draw(now || 1000); }
  };
})();
