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
  // FIX: ?datum= (testläge) gäller bara lokalt, annars kan vem som helst låsa upp arkivet/framtida omgångar gratis
  var DEV = /^(localhost|127\.0\.0\.1|)$/.test(location.hostname);
  var TODAY = DEV && /^\d{4}-\d{2}-\d{2}$/.test(params.get("datum") || "") ? params.get("datum") : stockholmDate();
  // TESTLÄGE: ?reset=1 nollställer allt sparat (bara lokalt)
  if (DEV && params.get("reset") === "1") { try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(KEY) === 0) localStorage.removeItem(k); }); } catch (e) {} }
  function niceDate(iso) { var p = iso.split("-"); return (+p[2]) + " " + T.months[+p[1] - 1]; }
  function addDays(iso, n) { var d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

  function roundFor(iso) {
    if (R[iso]) return R[iso];
    var keys = Object.keys(R).sort();               // reserv: rotera befintliga omgångar
    var n = Math.floor(new Date(iso + "T12:00:00Z").getTime() / 864e5);
    return R[keys[n % keys.length]];
  }

  // ---- Svarsmatchning ----
  // Exakt träff (med å/ä/ö) vinner alltid. Därefter träff utan accenter om den är entydig.
  // Nära träffar (ett eller två stavfel) godkänns INTE direkt – spelaren får frågan "Menar du …?" och bekräftar med Enter.
  function norm(s) {
    return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[&]/g, " och ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
      .replace(/^(en|ett|den|det) /, "");
  }
  function exact(s) { return s.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim().replace(/^(en|ett|den|det) /, ""); }
  function lev(a, b) {                               // Damerau-Levenshtein
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) d[i] = [i];
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[a.length][b.length];
  }
  function tol(len) { return len >= 9 ? 2 : len >= 4 ? 1 : 0; }
  // Svarslista: { "1": ["Namn|alias", ...], "2": [...], ... "5": [...] } -> index
  function parseAnswers(obj) {
    var A = { list: [], ex: {}, loose: {}, keys: [] };
    Object.keys(obj).forEach(function (t) {
      obj[t].forEach(function (s) {
        var names = s.split("|");
        var a = { name: names[0], tier: +t, keys: names.map(norm), ex: names.map(exact) };
        A.list.push(a);
        a.ex.forEach(function (k) { if (!(k in A.ex)) A.ex[k] = a; });
        a.keys.forEach(function (k) { (A.loose[k] = A.loose[k] || []).push(a); A.keys.push({ k: k, a: a }); });
      });
    });
    return A;
  }
  function match(guess, A) {
    var ge = exact(guess);
    if (ge && A.ex[ge]) return A.ex[ge];
    var g = norm(guess); if (!g) return null;
    var l = A.loose[g];
    return l && l.length === 1 ? l[0] : null;
  }
  // Förslag vid stavfel. Oavgjort mellan olika svar (eller flera lika bra) ger inget förslag.
  function suggest(guess, A) {
    var g = norm(guess); if (g.length < 4) return null;
    var best = 9, cands = [];
    A.keys.forEach(function (e) {
      var t = tol(e.k.length); if (!t || Math.abs(e.k.length - g.length) > t || e.k === g) return;
      var d = lev(g, e.k); if (d > t) return;
      if (d < best) { best = d; cands = [e.a]; } else if (d === best && cands.indexOf(e.a) < 0) cands.push(e.a);
    });
    return cands.length === 1 ? cands[0] : null;
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
    var ht = $("home-tiers"); ht.innerHTML = "";
    [1, 2, 3, 4, 5].forEach(function (n) { var s = document.createElement("span"); s.className = "tier t" + n; s.textContent = T.tiers[n] + " "; var b = document.createElement("b"); b.textContent = "+" + C.points[n] + T.points; s.appendChild(b); ht.appendChild(s); });
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
  var G = null, qTimer = null;
  function startGame(iso) {
    var qs = roundFor(iso);
    var saved = stateFor(iso);
    G = { iso: iso, qs: qs, idx: 0, results: [], wrong: [], sugg: null, over: false, resume: null };
    if (saved && saved.results && !saved.done) { G.results = saved.results; G.idx = saved.results.length; G.resume = saved.q || null; }
    show("game"); showScene(true); Scene.set(totalScore(G.results)); $("hud-region").textContent = Scene.regionFor(totalScore(G.results));
    if (G.idx >= qs.length) return finishRound();
    renderQuestion();
  }
  function totalScore(results) { return results.reduce(function (s, r) { return s + (r.tier ? C.points[r.tier] : 0); }, 0); }
  function renderDots(results, n, cur) {
    var d = $("dots"); d.innerHTML = "";
    for (var i = 0; i < n; i++) { var s = document.createElement("span"); s.className = i < results.length ? "d" + results[i].tier : (i === cur ? "cur" : ""); d.appendChild(s); }
  }
  function setMsg(text, kind) { var m = $("msg"); m.textContent = text; m.className = "msg" + (kind ? " " + kind : ""); }
  function renderQuestion() {
    var q = G.qs[G.idx];
    if (!q._p) q._p = parseAnswers(q.a);
    G.A = q._p; G.wrong = []; G.sugg = null; G.over = false;
    $("qcount").textContent = T.question + " " + (G.idx + 1) + " " + T.of + " " + G.qs.length + (G.iso !== TODAY ? " · " + niceDate(G.iso) : "");
    $("question").textContent = q.q;
    $("guess").value = ""; $("guess").placeholder = T.placeholder; $("guess").disabled = false;
    $("btn-guess").textContent = T.guess; $("btn-guess").disabled = false;
    $("btn-pass").textContent = T.pass; $("btn-pass").hidden = false;
    setMsg("");
    $("reveal").hidden = true;
    renderDots(G.results, G.qs.length, G.idx);
    // Tidtagning. Sparas så att en omladdning inte nollställer klockan.
    var limit = C.secondsPerQuestion * 1000, start = Date.now();
    if (G.resume && G.resume.idx === G.idx && G.resume.ts && G.resume.ts <= start) start = G.resume.ts;
    G.resume = null;
    G.qStart = start; G.limit = limit;
    var st = stateFor(G.iso) || { results: G.results, done: false };
    st.results = G.results; st.done = false; st.q = { idx: G.idx, ts: start }; save(KEY + G.iso, st);
    clearInterval(qTimer); tickQ(); qTimer = setInterval(tickQ, 100);
    setTimeout(function () { if (!G.over) $("guess").focus(); }, 50);
  }
  function tickQ() {
    if (!G || G.over) return;
    var left = Math.max(0, G.limit - (Date.now() - G.qStart));
    $("timer-bar").style.transform = "scaleX(" + (left / G.limit) + ")";
    $("timer-sec").textContent = Math.ceil(left / 1000);
    $("timer").classList.toggle("low", left < 8000);
    if (left <= 0) finishQuestion(null, $("guess").value.trim(), "tid");
  }
  $("guess").addEventListener("input", function () { if (G && G.sugg) { G.sugg = null; setMsg(""); } });
  $("guess-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!G || G.over) return;
    var val = $("guess").value.trim(); if (!val) return;
    var hit = match(val, G.A);
    if (hit) return finishQuestion(hit, hit.name);
    // Bekräftat förslag: Enter igen med oförändrad text byter till förslaget
    if (G.sugg && G.sugg.input === val) { var a = G.sugg.ans; $("guess").value = a.name; return finishQuestion(a, a.name); }
    var key = norm(val);
    if (G.wrong.indexOf(key) >= 0) { setMsg(T.already, "bad"); return; }
    var s = suggest(val, G.A);
    if (s) { G.sugg = { input: val, ans: s }; setMsg(T.didYouMean.replace("{x}", s.name), "ask"); return; }
    G.wrong.push(key);
    var f = $("guess-form"); f.classList.remove("shake"); void f.offsetWidth; f.classList.add("shake");
    setMsg(T.wrong, "bad"); $("guess").select();
  });
  $("msg").addEventListener("click", function () { if (G && G.sugg && !G.over) $("guess-form").requestSubmit ? $("guess-form").requestSubmit() : $("btn-guess").click(); });
  $("btn-pass").addEventListener("click", function () { if (G && !G.over) finishQuestion(null, "", "pass"); });

  // Visar alla nivåer med antal och svar. mine = spelarens svar (markeras). Används både efter en fråga och i resultatvyn.
  function buildReveal(o, A, mine) {
    o.innerHTML = "";
    var byTier = {}; A.list.forEach(function (a) { (byTier[a.tier] = byTier[a.tier] || []).push(a); });
    [5, 4, 3, 2, 1].forEach(function (t) {
      var arr = byTier[t]; if (!arr) return;
      var h = document.createElement("div"); h.className = "tierhead t" + t;
      h.textContent = T.tiers[t] + " · +" + C.points[t] + T.points + " · " + arr.length + " " + T.answersWord; o.appendChild(h);
      var box = document.createElement("div"); box.className = "tierlist";
      var LIM = t === 5 ? arr.length : 12, shown = arr.slice(0, LIM);
      if (mine && mine.tier === t && shown.indexOf(mine) < 0) shown.unshift(mine);
      function chip(a) { var s = document.createElement("span"); s.className = "t" + t + (a === mine ? " mine" : ""); s.textContent = (a === mine ? "★ " : "") + a.name; return s; }
      shown.forEach(function (a) { box.appendChild(chip(a)); });
      if (arr.length > LIM) {
        var more = document.createElement("button"); more.type = "button"; more.className = "more"; more.textContent = "Visa alla " + arr.length;
        more.onclick = function () {
          var open = more.getAttribute("data-open") === "1";
          box.querySelectorAll("span").forEach(function (x) { x.remove(); });
          (open ? shown : arr.slice().sort(function (x, y) { return x === mine ? -1 : y === mine ? 1 : 0; })).forEach(function (a) { box.insertBefore(chip(a), more); });
          more.setAttribute("data-open", open ? "0" : "1"); more.textContent = open ? "Visa alla " + arr.length : "Visa färre";
        };
        box.appendChild(more);
      }
      o.appendChild(box);
    });
  }

  function finishQuestion(hit, guess, why) {
    G.over = true; clearInterval(qTimer);
    G.results.push(hit ? { name: hit.name, tier: hit.tier } : { name: why === "pass" ? "–" : (guess || "–"), tier: 0 });
    var st = stateFor(G.iso) || {}; st.results = G.results; st.done = false; delete st.q; save(KEY + G.iso, st);
    $("guess").disabled = true; $("btn-guess").disabled = true; $("btn-pass").hidden = true;
    setMsg(hit ? "" : (why === "tid" ? T.timeUp : why === "pass" ? "" : T.wrongFinal), hit ? "" : "bad");
    var chip = $("answer-chip");
    chip.className = "answer-chip c" + (hit ? hit.tier : 0);
    chip.innerHTML = "";
    var l = document.createElement("span"); l.textContent = hit ? hit.name : (why === "pass" ? T.passed : (guess ? "✗ " + guess : T.timeUp));
    var r = document.createElement("span"); r.textContent = hit ? T.tiers[hit.tier] + " +" + C.points[hit.tier] + T.points : "+0" + T.points;
    chip.appendChild(l); chip.appendChild(r);
    $("tier-hint").textContent = "";
    // Genomgång: alla nivåer med antal och exempel
    $("others-title").textContent = T.otherAnswers + " (" + G.A.list.length + ")";
    buildReveal($("others"), G.A, hit);
    $("others").parentNode.open = false;
    var last = G.idx === G.qs.length - 1;
    $("btn-next").textContent = last ? T.finish : T.next;
    $("reveal").hidden = false;
    renderDots(G.results, G.qs.length, -1);
    Scene.runTo(totalScore(G.results));
  }
  $("btn-next").addEventListener("click", function () {
    if (G.idx < G.qs.length - 1) { G.idx++; renderQuestion(); return; }
    finishRound();
  });
  function finishRound() {
    save(KEY + G.iso, { results: G.results, done: true, onDay: G.iso === TODAY, score: totalScore(G.results) });
    renderResult(G.iso);
  }

  // ---- Resultat ----
  var SQ = { 0: "⬛", 1: "🟦", 2: "🟩", 3: "🟨", 4: "🟧", 5: "🟪" };
  var countdownTimer = null;
  function renderResult(iso) {
    var s = stateFor(iso), qs = roundFor(iso);
    clearInterval(qTimer);
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
      var line = document.createElement("div"); line.className = "rline";
      line.appendChild(document.createTextNode(qs[i].q + ": " + r.name));
      if (r.tier) { var t = document.createElement("span"); t.className = "tier t" + r.tier; t.textContent = T.tiers[r.tier] + " +" + C.points[r.tier] + T.points; line.appendChild(t); }
      else { var z = document.createElement("span"); z.className = "tier t0"; z.textContent = "+0" + T.points; line.appendChild(z); }
      li.appendChild(line);
      var q = qs[i]; if (!q._p) q._p = parseAnswers(q.a);
      var btn = document.createElement("button"); btn.type = "button"; btn.className = "btn browse"; btn.textContent = T.browse + " (" + q._p.list.length + ")";
      var box = document.createElement("div"); box.className = "browse-box"; box.hidden = true;
      btn.onclick = function () {
        if (box.hidden) {
          var mine = null; if (r.tier) q._p.list.forEach(function (a) { if (a.name === r.name && a.tier === r.tier) mine = a; });
          var tip = document.createElement("p"); tip.className = "hint";
          tip.textContent = r.tier ? T.yourAnswer + ": " + r.name + " – " + T.tiers[r.tier] + " (+" + C.points[r.tier] + T.points + ")" : T.noAnswer;
          var inner = document.createElement("div"); buildReveal(inner, q._p, mine);
          box.innerHTML = ""; box.appendChild(tip); box.appendChild(inner);
        }
        box.hidden = !box.hidden; btn.textContent = (box.hidden ? T.browse : T.browseClose) + " (" + q._p.list.length + ")";
      };
      li.appendChild(btn); li.appendChild(box);
      ol.appendChild(li);
    });
    $("btn-share").textContent = T.share;
    $("btn-share").onclick = function () { share(iso, s); };
    $("res-streak").textContent = iso === TODAY ? streakText() : "";
    clearInterval(countdownTimer);
    if (iso === TODAY) { tick(); countdownTimer = setInterval(tick, 1000); } else $("countdown").textContent = "";
    // TESTLÄGE (bara lokalt): knapp för att spela om omgången
    var rb = $("btn-replay");
    if (DEV) {
      if (!rb) { rb = document.createElement("button"); rb.id = "btn-replay"; rb.className = $("btn-share").className; rb.style.marginTop = "8px"; $("btn-share").insertAdjacentElement("afterend", rb); }
      rb.textContent = "↺ Spela igen (testläge)";
      rb.onclick = function () { try { localStorage.removeItem(KEY + iso); } catch (e) {} delete mem[KEY + iso]; clearInterval(countdownTimer); startGame(iso); };
    } else if (rb) rb.remove();
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
