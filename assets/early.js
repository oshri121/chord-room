/* Runs in <head> before first paint (replaces the two inline scripts, so the CSP needs no inline script).
   - hide the tool's static markup until the router shows a view (html.home, app.js showView removes it). perf: every page
     used to paint the bare tool first — a deep link such as #pricing then swapped it out, and #tool itself grew under the
     reader while app.js filled it in (layout shifts of 0.6–0.9); now each view appears once, already rendered
   - the saved theme, so a dark page never flashes white */
document.documentElement.classList.add("home");
try { var t = localStorage.getItem("chordroom.theme"); if (t === "dark" || t === "light") document.documentElement.dataset.theme = t; } catch (e) {}
/* perf: no saved Supabase session → most likely a guest: html.cr-guest keeps the tool's guest banner room free until the
   account check answers (app.css; renderGuestBar in app.js drops the class), so the tool doesn't jump down when it shows */
try {
  var signed = false;
  for (var i = 0; i < localStorage.length; i++) if (/^sb-.+-auth-token$/.test(localStorage.key(i) || "")) { signed = true; break; }
  if (!signed) document.documentElement.classList.add("cr-guest");
} catch (e) {}
/* perf: the page's own script fonts start downloading now (Latin is preloaded in index.html), so the JS-rendered home /
   pricing text is laid out once in the right font instead of reflowing when it arrives (layout shift) */
(function () {
  var lang = "he"; try { lang = localStorage.getItem("chordroom.lang") || "he"; } catch (e) {}
  var F = { he: ["plex-hebrew-hebrew-400", "plex-hebrew-hebrew-500", "plex-hebrew-hebrew-600", "plex-hebrew-hebrew-700"],
            ar: ["plex-arabic-arabic-400", "plex-arabic-arabic-600"], ru: ["plex-sans-cyrillic-var"] }[lang] || [];
  F.forEach(function (f) {
    var l = document.createElement("link"); l.rel = "preload"; l.as = "font"; l.type = "font/woff2"; l.crossOrigin = "anonymous";
    l.href = "assets/fonts/" + f + ".woff2"; document.head.appendChild(l);
  });
})();

/* perf: on-demand view modules (window.CRLOAD). index.html keeps their <link>/<script> tags inside <template id="crLazy">
   (inert: nothing is fetched until asked) — bump ?v= there as before. data-mod="a b" lists the modules that need a file.
   CRLOAD.need('dj') → Promise: the module's CSS is applied first, then its scripts run in document order (a file shared
   by several modules runs once). The router (app.js showView) asks for a view's module when the view opens; every
   module shows itself when its view is already open at load time. Hovering / focusing a nav tab warms the files
   (preload, no execution). After load: the first-visit language picker (only when no language is saved) and, when the
   page is idle, the assistant. */
(function () {
  "use strict";
  var files = {}, mods = {}, warm = {}, busy = 0;
  function tags(m) {
    var tp = document.getElementById("crLazy"), out = [];
    if (!tp || !tp.content) return out;
    var all = tp.content.querySelectorAll("[data-mod]");
    for (var i = 0; i < all.length; i++) if ((" " + all[i].getAttribute("data-mod") + " ").indexOf(" " + m + " ") >= 0) out.push(all[i]);
    return out;
  }
  function url(el) { return el.getAttribute(el.tagName === "LINK" ? "href" : "src"); }
  function css(href) {
    return files[href] || (files[href] = new Promise(function (ok, no) {
      var l = document.createElement("link"); l.rel = "stylesheet"; l.href = href;
      l.onload = function () { ok(); };
      l.onerror = function () { delete files[href]; l.remove(); no(new Error("load " + href)); };
      document.head.appendChild(l);
    }));
  }
  function preload(src) {
    if (warm[src] || files[src]) return; warm[src] = 1;
    var l = document.createElement("link"); l.rel = "preload"; l.as = "script"; l.href = src; document.head.appendChild(l);
  }
  function js(src) {
    return files[src] || (files[src] = new Promise(function (ok, no) {
      var s = document.createElement("script"); s.src = src; s.async = false;     // async=false: run in insertion order
      s.onload = function () { ok(); };
      s.onerror = function () { delete files[src]; s.remove(); no(new Error("load " + src)); };
      document.body.appendChild(s);
    }));
  }
  function need() {
    var names = Array.prototype.slice.call(arguments);
    return Promise.all(names.map(function (m) {
      if (mods[m]) return mods[m];
      var list = tags(m);
      if (!list.length) return Promise.reject(new Error("unknown module " + m));
      var c = [], s = [];
      list.forEach(function (el) { if (el.tagName === "LINK") c.push(url(el)); else { s.push(url(el)); preload(url(el)); } });
      busy++;
      var p = mods[m] = Promise.all(c.map(css)).then(function () { return Promise.all(s.map(js)); })
        .then(function () { busy--; mods[m].done = true; }, function (e) { busy--; delete mods[m]; throw e; });
      return p;
    }));
  }
  var NAV = { navDj: "dj", navCrate: "crate", navMashup: "mashup", navConvert: "convert", navExtended: "extended", navTool: "tool" };
  function warmUp(e) {
    var el = e.target && e.target.closest && e.target.closest("#navDj,#navCrate,#navMashup,#navConvert,#navExtended,#navTool");
    if (!el || mods[NAV[el.id]]) return;
    tags(NAV[el.id]).forEach(function (x) { if (x.tagName === "SCRIPT") preload(url(x)); });
  }
  document.addEventListener("pointerover", warmUp, { passive: true });
  document.addEventListener("focusin", warmUp);
  document.addEventListener("touchstart", warmUp, { passive: true });
  window.CRLOAD = {
    need: need,
    has: function (m) { return !!(mods[m] && mods[m].done); },
    pending: function () { return busy; },
    loaded: function () { return Object.keys(mods).filter(function (m) { return mods[m].done; }); }
  };
  document.addEventListener("DOMContentLoaded", function () {
    var lang = null; try { lang = localStorage.getItem("chordroom.lang"); } catch (e) {}
    if (!lang && !navigator.webdriver) need("welcome").catch(function () {});
  });
  window.addEventListener("load", function () {
    var go = function () { need("assistant").catch(function () {}); };
    if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 2000);
  });
})();
