// Sets light or dark before the page is drawn: saved choice first, then the system setting.
(function () {
  var root = document.documentElement;
  var media = matchMedia('(prefers-color-scheme: dark)');
  function saved() {
    try { var v = localStorage.getItem('portal.theme'); return v === 'light' || v === 'dark' ? v : null; }
    catch (e) { return null; }
  }
  function apply(theme) {
    root.setAttribute('data-theme', theme);
    var buttons = document.querySelectorAll('[data-toggle-theme]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    }
  }
  apply(saved() || (media.matches ? 'dark' : 'light'));
  if (media.addEventListener) {
    media.addEventListener('change', function () { if (!saved()) apply(media.matches ? 'dark' : 'light'); });
  }
  document.addEventListener('click', function (event) {
    if (!(event.target.closest && event.target.closest('[data-toggle-theme]'))) return;
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    apply(next);
    try { localStorage.setItem('portal.theme', next); } catch (e) { /* blocked */ }
  });
  document.addEventListener('DOMContentLoaded', function () { apply(root.getAttribute('data-theme')); });
})();
