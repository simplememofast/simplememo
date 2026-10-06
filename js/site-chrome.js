/* Progressive disclosure: all routes remain visible when JavaScript is absent. */
(function () {
  'use strict';
  var nav = document.querySelector('[data-site-header].global-nav');
  if (!nav) return;
  var menu = nav.querySelector('#navLinks');
  var toggle = nav.querySelector('.global-nav__hamburger');
  if (!menu || !toggle) return;
  function close(returnFocus) {
    menu.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    if (returnFocus) toggle.focus();
  }
  toggle.addEventListener('click', function () {
    var open = !menu.classList.contains('open');
    menu.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      var language = nav.querySelector('.lang-dropdown');
      if (language) language.open = false;
      var first = menu.querySelector('a');
      if (first) first.focus();
    }
  });
  menu.addEventListener('click', function (event) {
    if (event.target.closest('a')) close(false);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && menu.classList.contains('open')) {
      event.preventDefault();
      close(true);
    }
  });
  document.addEventListener('click', function (event) {
    if (!nav.contains(event.target)) close(false);
  });
  nav.addEventListener('focusout', function () {
    setTimeout(function () {
      if (!nav.contains(document.activeElement)) close(false);
    }, 0);
  });
  nav.querySelectorAll('.lang-dropdown summary').forEach(function (summary) {
    summary.addEventListener('click', function () { close(false); });
  });
  nav.setAttribute('data-site-ready', '');
})();
