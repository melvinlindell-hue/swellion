(function () {
  "use strict";
  var C = window.SWELLION_CONFIG, T = window.SWELLION_TEXT, R = window.SWELLION_ROUNDS;
  var $ = function (id) { return document.getElementById(id); };

  // ---- Konto (v1 kopplar in Supabase/Firebase här; v0 = utloggad, ingen premium) ----
  window.SwellionAccount = window.SwellionAccount || {
    user: null,
    isPremium: function () { return false; }
  };

  // ---- Lagring (tål att localStorage saknas) ----
  var mem = {};
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return k in mem ? mem[k] : d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { mem[k] = v; } }
  var KEY = "swellion:" + C.lang + ":";

  // ---- Datum (Stockholmstid) ----
  function stockholmDate(d) {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: C.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d || new Date());
  }
  var params = new URLSearchParams(location.search);
  var TODAY = /^\d{4}-\d{2}-\d{2}$/.test(params.get("datum") || "") ? params.get("datum") : stockholmDate();
  function niceDate(iso) { var p = iso.split("-"); return (+p[2]) + " " + T.months[+p[1] - 1]; }
  function addDays(iso, n) { var d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

  function roundFor(iso) {
    if (R[iso]) return R[iso];
    var keys = Object.keys(R).sort();               // reserv: rotera befintliga omgångar
    var n = Math.floor(new Date(iso + "T12:00:00Z").getTime() / 864e5);
    return R[keys[n % keys.length]];
  }

  // ---- Svarsmatchning ----
  function norm(s) {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[&]/g, " och ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
      .replace(/^(en|ett|den|det) /, "");
  }
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 9;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function parseAnswers(list) {
    return list.map(function (s) {
      var parts = s.split("|"), names = parts[0].split("/");
      return { name: names[0], tier: +parts[1], keys: names.map(norm) };
    });
  }
  function match(guess, answers) {
    var g = norm(guess); if (!g) return null;
    var i, k;
    for (i = 0; i < answers.length; i++) for (k = 0; k < answers[i].keys.length; k++) if (answers[i].keys[k] === g) return answers[i];
    if (g.length >= 5) {                             // tillåt ett stavfel i längre ord
      for (i = 0; i < answers.length; i++) for (k = 0; k < answers[i].keys.length; k++) if (answers[i].keys[k].length >= 5 && lev(g, answers[i].keys[k]) <= 1) return answers[i];
    }
    return null;
  }

  // ---- Vyer ----
  function show(name) {
    ["home", "game", "result", "archive", "premium"].forEach(function (v) { $("view-" + v).hidden = v !== name; });
    window.scrollTo(0, 0);
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-go]"); if (!t) return;
    e.preventDefault();
    var go = t.getAttribute("data-go");
    if (go === "home") renderHome(); else if (go === "archive") renderArchive(); else if (go === "premium") renderPremium();
  });

  // ---- Statistik ----
  function stateFor(iso) { return load(KEY + iso, null); }
  function streak() {
    var n = 0, d = TODAY, s = stateFor(d);
    if (!(s && s.done)) d = addDays(d, -1);
    while ((s = stateFor(d)) && s.done && s.onDay) { n++; d = addDays(d, -1); }
    return n;
  }
  function streakText() { var n = streak(); return n > 0 ? "🔥 " + n + " " + (n === 1 ? T.streakOne : T.streak) : ""; }

  // ---- Hem ----
  function renderHome() {
    $("home-date").textContent = niceDate(TODAY);
    $("home-tagline").textContent = T.tagline;
    $("home-how").textContent = T.how;
    var s = stateFor(TODAY);
    $("btn-start").textContent = s && s.done ? T.seeResult : T.start;
    showScene(true); var hm = s && s.results ? totalScore(s.results) : 0; Scene.set(hm); $("hud-region").textContent = Scene.regionFor(hm);
    $("home-streak").textContent = streakText();
    show("home");
  }
  $("btn-start").addEventListener("click", function () {
    var s = stateFor(TODAY);
    if (s && s.done) renderResult(TODAY); else startGame(TODAY);
  });

  // ---- Spel ----
  var G = null;
  function startGame(iso) {
    var qs = roundFor(iso);
    var saved = stateFor(iso);
    G = { iso: iso, qs: qs, idx: 0, results: [], tries: C.triesPerQuestion, wrong: [] };
    if (saved && saved.results && !saved.done) { G.results = saved.results; G.idx = saved.results.length; }
    show("game"); showScene(true); Scene.set(totalScore(G.results)); $("hud-region").textContent = Scene.regionFor(totalScore(G.results));
    renderQuestion();
  }
  function totalScore(results) { return results.reduce(function (s, r) { return s + (r.tier ? C.points[r.tier] : 0); }, 0); }
  function renderDots(results, n, cur) {
    var d = $("dots"); d.innerHTML = "";
    for (var i = 0; i < n; i++) { var s = document.createElement("span"); s.className = i < results.length ? "d" + results[i].tier : (i === cur ? "cur" : ""); d.appendChild(s); }
  }
  function renderQuestion() {
    var q = G.qs[G.idx];
    G.answers = parseAnswers(q.a); G.tries = C.triesPerQuestion; G.wrong = [];
    $("qcount").textContent = T.question + " " + (G.idx + 1) + " " + T.of + " " + G.qs.length + (G.iso !== TODAY ? " · " + niceDate(G.iso) : "");
    $("question").textContent = q.q;
    $("guess").value = ""; $("guess").placeholder = T.placeholder; $("guess").disabled = false;
    $("btn-guess").textContent = T.guess; $("btn-guess").disabled = false;
    $("btn-pass").textContent = T.pass; $("btn-pass").hidden = false;
    $("msg").textContent = "";
    $("reveal").hidden = true;
    renderDots(G.results, G.qs.length, G.idx);
    setTimeout(function () { $("guess").focus(); }, 50);
  }
  $("guess-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var val = $("guess").value.trim(); if (!val) return;
    var key = norm(val);
    if (G.wrong.indexOf(key) >= 0) { $("msg").textContent = T.already; return; }
    var hit = match(val, G.answers);
    if (hit) return finishQuestion(hit, val);
    G.wrong.push(key); G.tries--;
    var f = $("guess-form"); f.classList.remove("shake"); void f.offsetWidth; f.classList.add("shake");
    if (G.tries > 0) { $("msg").textContent = T.wrong + " (" + G.tries + " kvar)"; $("guess").select(); }
    else finishQuestion(null, val);
  });
  $("btn-pass").addEventListener("click", function () { finishQuestion(null, ""); });

  function finishQuestion(hit, guess) {
    G.results.push(hit ? { name: hit.name, tier: hit.tier } : { name: guess || "–", tier: 0 });
    save(KEY + G.iso, { results: G.results, done: false });
    $("guess").disabled = true; $("btn-guess").disabled = true; $("btn-pass").hidden = true;
    $("msg").textContent = hit ? "" : (guess ? T.wrongFinal : "");
    var chip = $("answer-chip");
    chip.className = "answer-chip c" + (hit ? hit.tier : 0);
    chip.innerHTML = "";
    var l = document.createElement("span"); l.textContent = hit ? hit.name : (guess ? "✗ " + guess : T.pass);
    var r = document.createElement("span"); r.textContent = hit ? T.tiers[hit.tier] + " +" + C.points[hit.tier] + T.points : "+0" + T.points;
    chip.appendChild(l); chip.appendChild(r);
    $("tier-hint").textContent = hit ? T.tierHint : "";
    $("others-title").textContent = T.otherAnswers + " (" + G.answers.length + ")";
    var o = $("others"); o.innerHTML = "";
    G.answers.slice().sort(function (a, b) { return b.tier - a.tier; }).forEach(function (a) {
      var s = document.createElement("span"); s.className = "t" + a.tier; s.textContent = a.name; o.appendChild(s);
    });
    $("others").parentNode.open = false;
    var last = G.idx === G.qs.length - 1;
    $("btn-next").textContent = last ? T.finish : T.next;
    $("reveal").hidden = false;
    renderDots(G.results, G.qs.length, -1);
    Scene.runTo(totalScore(G.results));
  }
  $("btn-next").addEventListener("click", function () {
    if (G.idx < G.qs.length - 1) { G.idx++; renderQuestion(); return; }
    save(KEY + G.iso, { results: G.results, done: true, onDay: G.iso === TODAY, score: totalScore(G.results) });
    renderResult(G.iso);
  });

  // ---- Resultat ----
  var SQ = { 0: "⬛", 1: "🟦", 2: "🟨", 3: "🟪" };
  var countdownTimer = null;
  function renderResult(iso) {
    var s = stateFor(iso), qs = roundFor(iso);
    $("res-date").textContent = niceDate(iso);
    $("res-title").textContent = T.resultTitle;
    var tot = totalScore(s.results);
    $("res-score").textContent = tot;
    $("res-region").textContent = tot >= 500 ? T.perfect : T.reached + " " + Scene.regionFor(tot) + "!";
    showScene(true); Scene.set(tot); $("hud-region").textContent = Scene.regionFor(tot);
    $("res-squares").textContent = s.results.map(function (r) { return SQ[r.tier]; }).join("");
    var ol = $("res-list"); ol.innerHTML = "";
    s.results.forEach(function (r, i) {
      var li = document.createElement("li");
      li.textContent = qs[i].q + ": " + r.name;
      if (r.tier) { var t = document.createElement("span"); t.className = "tier t" + r.tier; t.textContent = T.tiers[r.tier]; li.appendChild(t); }
      ol.appendChild(li);
    });
    $("btn-share").textContent = T.share;
    $("btn-share").onclick = function () { share(iso, s); };
    $("res-streak").textContent = iso === TODAY ? streakText() : "";
    clearInterval(countdownTimer);
    if (iso === TODAY) { tick(); countdownTimer = setInterval(tick, 1000); } else $("countdown").textContent = "";
    show("result");
  }
  function tick() {
    var p = new Intl.DateTimeFormat("sv-SE", { timeZone: C.timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date()).split(":");
    var left = 86400 - (+p[0] * 3600 + +p[1] * 60 + +p[2]);
    var h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60), sec = left % 60;
    $("countdown").textContent = T.nextRound + " " + h + ":" + String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
  }
  function share(iso, s) {
    var tot = totalScore(s.results);
    var text = C.siteName + " " + niceDate(iso) + " · 🫎 " + tot + " m – " + Scene.regionFor(tot) + "\n" +
      s.results.map(function (r) { return SQ[r.tier]; }).join("") + "\n" + C.domain;
    if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) { navigator.share({ text: text }).catch(function () {}); return; }
    copy(text);
  }
  function copy(text) {
    var done = function () { toast(T.copied); };
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done, fallback); } else fallback();
    function fallback() {
      var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) {} document.body.removeChild(ta); done();
    }
  }
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.hidden = false; setTimeout(function () { t.hidden = true; }, 1600); }

  // ---- Arkiv ----
  function renderArchive() {
    $("arch-title").textContent = T.archive; showScene(false);
    var ul = $("archive-list"); ul.innerHTML = "";
    var days = Object.keys(R).filter(function (d) { return d < TODAY; }).sort().reverse();
    if (!days.length) { var e = document.createElement("li"); e.textContent = T.archiveEmpty; ul.appendChild(e); }
    days.forEach(function (d) {
      var s = stateFor(d), li = document.createElement("li");
      var info = document.createElement("div");
      info.innerHTML = "<b></b><div class='meta'></div>";
      info.querySelector("b").textContent = niceDate(d);
      info.querySelector(".meta").textContent = s && s.done ? totalScore(s.results) + " m " + s.results.map(function (r) { return SQ[r.tier]; }).join("") : roundFor(d)[0].q + " …";
      var btn = document.createElement("button");
      var unlocked = window.SwellionAccount.isPremium() || load(KEY + "unlocked", []).indexOf(d) >= 0;
      if (s && s.done) { btn.className = "btn"; btn.textContent = "Resultat"; btn.onclick = function () { renderResult(d); }; }
      else if (unlocked) { btn.className = "btn primary"; btn.textContent = T.archiveFree; btn.onclick = function () { startGame(d); }; }
      else { btn.className = "btn"; btn.textContent = "▶ Reklam"; btn.title = T.archiveLocked; btn.onclick = function () { showAd(d); }; }
      li.appendChild(info); li.appendChild(btn); ul.appendChild(li);
    });
    show("archive");
  }
  function showAd(d) {
    openModal(T.adTitle, T.adText, true, T.adContinue, function () {
      var u = load(KEY + "unlocked", []); if (u.indexOf(d) < 0) u.push(d); save(KEY + "unlocked", u);
      closeModal(); startGame(d);
    });
  }

  // ---- Premium ----
  function renderPremium() {
    $("prem-title").textContent = T.premiumTitle; showScene(false);
    $("prem-price").innerHTML = "";
    $("prem-price").appendChild(document.createTextNode(C.premium.priceText));
    var sm = document.createElement("small"); sm.textContent = " engångsköp"; $("prem-price").appendChild(sm);
    var ul = $("prem-points"); ul.innerHTML = "";
    T.premiumPoints.forEach(function (p) { var li = document.createElement("li"); li.textContent = p; ul.appendChild(li); });
    var b = $("btn-premium");
    b.textContent = C.premium.checkoutUrl ? "Köp Premium – " + C.premium.priceText : T.premiumCta;
    b.disabled = !C.premium.checkoutUrl;
    b.onclick = function () { if (C.premium.checkoutUrl) location.href = C.premium.checkoutUrl; };
    show("premium");
  }

  // ---- Modal & kaffe ----
  function openModal(title, text, ad, okText, onOk) {
    $("modal-title").textContent = title; $("modal-text").textContent = text;
    $("ad-slot").hidden = !ad; $("modal-close").textContent = T.close;
    var ok = $("modal-ok"); ok.hidden = !onOk; ok.textContent = okText || ""; ok.onclick = onOk || null;
    $("modal").hidden = false;
  }
  function closeModal() { $("modal").hidden = true; }
  $("modal-close").addEventListener("click", closeModal);
  $("modal").addEventListener("click", function (e) { if (e.target === $("modal")) closeModal(); });
  $("btn-coffee").addEventListener("click", function () {
    if (C.coffeeUrl) window.open(C.coffeeUrl, "_blank", "noopener"); else openModal("☕ " + T.coffee, T.coffeeSoon, false);
  });

  // ---- Scen ----
  var Scene = window.SwellionScene, bannerTimer = null;
  function showScene(on) { $("scene-wrap").hidden = !on; $("route").hidden = !on; }
  Scene.init($("scene"));
  Scene.renderStrip($("strip"));
  Scene.drawMoose($("marker"));
  Scene.onTick = function (m) {
    $("hud-m").textContent = Math.floor(m + 1e-6);
    $("marker").style.left = (Math.min(m, 560) / 600 * 100) + "%";
  };
  Scene.onRegion(function (idx, name) {
    $("hud-region").textContent = name;
    var b = $("banner"); b.innerHTML = "<small></small><span></span>";
    b.querySelector("small").textContent = idx * 100 + " m · " + T.regionWelcome;
    b.querySelector("span").textContent = name;
    b.hidden = false; clearTimeout(bannerTimer); bannerTimer = setTimeout(function () { b.hidden = true; }, 2200);
  });
  Scene.drawMoose($("logo-moose"));

  // ---- Start ----
  $("coffee-label").textContent = T.coffee;
  $("footer-text").textContent = T.footer;
  renderHome();
})();
