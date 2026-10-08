/* Progressive disclosure: all routes remain visible when JavaScript is absent. */
(function () {
  'use strict';
  var nav = document.querySelector('[data-site-header]');
  if (!nav) return;
  var language = nav.querySelector('.site-languages');
  if (language) {
    // Language changes on app-link pages retain their payload only on the
    // same first-party utility route. Homepage links never inherit codes.
    var utilityRoute = /^(?:\/(?:en|zh|zh-Hant|ko|es|pt-BR|id|ar|tr))?\/(verify|compose)(?:\.html)?\/?$/;
    var currentUtility = window.location.pathname.match(utilityRoute);
    if (currentUtility) language.querySelectorAll('a[data-site-locale]').forEach(function (link) {
      var destination = new URL(link.href, window.location.origin);
      var targetUtility = destination.pathname.match(utilityRoute);
      if (destination.origin === window.location.origin && targetUtility && targetUtility[1] === currentUtility[1]) {
        destination.search = window.location.search;
        destination.hash = window.location.hash;
        link.href = destination.href;
      }
    });
    var summary = language.querySelector('summary');
    var panel = language.querySelector('.site-language-panel');
    function closeLanguage(returnFocus) {
      language.open = false;
      if (returnFocus) summary.focus();
    }
    function fitLanguage() {
      if (!language.open) return;
      var room = window.innerHeight - panel.getBoundingClientRect().top - 16;
      panel.style.setProperty('--site-language-room', Math.max(80, room) + 'px');
    }
    language.addEventListener('toggle', fitLanguage);
    window.addEventListener('resize', fitLanguage);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && language.open) {
        event.preventDefault();
        closeLanguage(true);
      }
    });
    document.addEventListener('click', function (event) {
      if (!language.contains(event.target)) closeLanguage(false);
    });
    language.addEventListener('focusout', function () {
      setTimeout(function () {
        if (!language.contains(document.activeElement)) closeLanguage(false);
      }, 0);
    });
  }
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
  if (language) summary.addEventListener('click', function () { close(false); });
  nav.setAttribute('data-site-ready', '');
})();
