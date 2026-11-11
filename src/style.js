// Picks today's style before the page is drawn: the same style all day (local date), never the
// same one two days in a row. ?style=<id> previews one. The set lives in src/styles/ (README).
(function () {
  var root = document.documentElement;
  var list = [];
  try { list = JSON.parse(document.getElementById('styles').textContent); } catch (e) { /* none */ }

  function mix(n) {
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    return (n ^ (n >>> 16)) >>> 0;
  }
  // Index for a day number. Each day steps 1..count-1 places from the day before, so it never repeats.
  function pick(count, day) {
    if (count < 2) return 0;
    var i = mix(0) % count;
    for (var d = 1; d <= day; d++) i = (i + 1 + (mix(d) % (count - 1))) % count;
    return i;
  }
  function today() {
    var d = new Date();
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  }

  var chosen = null;
  var wanted = /[?&]style=([a-z0-9-]+)/.exec(location.search);
  if (wanted) {
    for (var i = 0; i < list.length; i++) if (list[i].id === wanted[1]) chosen = list[i];
  }
  if (!chosen && list.length) chosen = list[pick(list.length, today())];
  if (chosen) {
    root.setAttribute('data-style', chosen.id);
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var j = 0; j < metas.length; j++) {
      var dark = /dark/.test(metas[j].getAttribute('media') || '');
      metas[j].setAttribute('content', chosen.themeColor[dark ? 'dark' : 'light']);
    }
  }
  window.portalStyle = { pick: pick, today: today, current: chosen ? chosen.id : null };
})();
