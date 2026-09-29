/* Runs in <head> before first paint (replaces the two inline scripts, so the CSP needs no inline script).
   - no hash → the home (About) page: hide the tool until the router runs
   - the saved theme, so a dark page never flashes white */
if (!location.hash || location.hash === "#") document.documentElement.classList.add("home");
try { var t = localStorage.getItem("chordroom.theme"); if (t === "dark" || t === "light") document.documentElement.dataset.theme = t; } catch (e) {}
