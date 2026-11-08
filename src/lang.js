// Picks the language before the page is drawn. Same key and rule as the zigzag home page,
// so one choice holds on the whole host.
(function () {
  var root = document.documentElement;
  var titles = { en: 'Enter the playground', zh: '\u8fdb\u5165\u6e38\u4e50\u573a' };
  function setLanguage(language) {
    root.setAttribute('data-lang', language);
    root.setAttribute('lang', language === 'zh' ? 'zh-Hans' : 'en');
    document.title = titles[language];
    var buttons = document.querySelectorAll('[data-set-lang]');
    for (var i = 0; i < buttons.length; i++) {
      var on = buttons[i].getAttribute('data-set-lang') === language;
      buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    try { localStorage.setItem('zip-home-language', language); } catch (e) { /* blocked */ }
  }
  var saved = null;
  try { saved = localStorage.getItem('zip-home-language'); } catch (e) { /* blocked */ }
  var zh = (navigator.language || '').toLowerCase().indexOf('zh') === 0;
  setLanguage(saved === 'en' || saved === 'zh' ? saved : (zh ? 'zh' : 'en'));
  document.addEventListener('click', function (event) {
    var b = event.target.closest ? event.target.closest('[data-set-lang]') : null;
    if (b) setLanguage(b.getAttribute('data-set-lang'));
  });
  document.addEventListener('DOMContentLoaded', function () {
    setLanguage(root.getAttribute('data-lang'));
  });
})();
