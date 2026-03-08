/**
 * Simple Memo - Language Switcher
 * Handles site-wide language switching with localStorage persistence.
 *
 * SEO Note: Language preference is stored in localStorage only.
 * No ?lang= query parameters are added to URLs to avoid duplicate content issues.
 * The canonical URL is always the clean path without query parameters.
 */

(function() {
  'use strict';

  const STORAGE_KEY = 'simple-memo-lang';
  const DEFAULT_LANG = 'ja';
  const SUPPORTED_LANGS = ['ja', 'en'];

  /**
   * Get language from URL query parameter (for backwards compatibility)
   */
  function getLangFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const lang = params.get('lang');
    return SUPPORTED_LANGS.includes(lang) ? lang : null;
  }

  /**
   * Get language from localStorage
   */
  function getLangFromStorage() {
    try {
      const lang = localStorage.getItem(STORAGE_KEY);
      return SUPPORTED_LANGS.includes(lang) ? lang : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Save language to localStorage
   */
  function saveLangToStorage(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      // localStorage not available
    }
  }

  /**
   * Remove ?lang= parameter from URL to keep clean canonical URLs
   */
  function cleanQueryParam() {
    const url = new URL(window.location.href);
    if (url.searchParams.has('lang')) {
      url.searchParams.delete('lang');
      var cleanUrl = url.pathname + (url.search || '') + url.hash;
      window.history.replaceState({}, '', cleanUrl);
    }
  }

  /**
   * Get the current language (priority: query > storage > html lang > default)
   */
  function getCurrentLang() {
    return getLangFromQuery() || getLangFromStorage() || DEFAULT_LANG;
  }

  /**
   * Apply language to the page
   */
  function applyLang(lang) {
    // Update html lang attribute
    document.documentElement.lang = lang;

    // Update all elements with data-lang attribute
    document.querySelectorAll('[data-lang]').forEach(function(el) {
      if (el.getAttribute('data-lang') === lang) {
        el.style.display = '';
        el.classList.add('active');
      } else {
        el.style.display = 'none';
        el.classList.remove('active');
      }
    });

    // Update language switcher buttons
    document.querySelectorAll('[data-lang-btn]').forEach(function(btn) {
      if (btn.getAttribute('data-lang-btn') === lang) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update document title and meta info from hidden templates
    var metaSource = document.querySelector('.meta-template[data-lang="' + lang + '"]');
    if (metaSource) {
      // Title
      var title = metaSource.querySelector('.meta-title');
      if (title) document.title = title.textContent;

      // Description
      var desc = metaSource.querySelector('.meta-description');
      if (desc) {
        var metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.setAttribute('content', desc.textContent);

        var ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc) ogDesc.setAttribute('content', desc.textContent);

        var twitterDesc = document.querySelector('meta[name="twitter:description"]');
        if (twitterDesc) twitterDesc.setAttribute('content', desc.textContent);
      }

      // OG/Twitter Title
      var ogTitle = metaSource.querySelector('.meta-og-title');
      if (ogTitle) {
        var metaOgTitle = document.querySelector('meta[property="og:title"]');
        if (metaOgTitle) metaOgTitle.setAttribute('content', ogTitle.textContent);

        var metaTwitterTitle = document.querySelector('meta[name="twitter:title"]');
        if (metaTwitterTitle) metaTwitterTitle.setAttribute('content', ogTitle.textContent);
      }
    }
  }

  /**
   * Switch language
   */
  function switchLang(lang) {
    if (!SUPPORTED_LANGS.includes(lang)) return;

    saveLangToStorage(lang);
    applyLang(lang);
  }

  /**
   * Initialize language switcher
   */
  function init() {
    var queryLang = getLangFromQuery();
    var currentLang = queryLang || getLangFromStorage() || DEFAULT_LANG;

    // If lang came from query param, save to storage then clean URL
    if (queryLang) {
      saveLangToStorage(currentLang);
    }

    // Always remove ?lang= from URL to maintain clean canonical URLs
    cleanQueryParam();

    applyLang(currentLang);

    // Bind click events to language switcher buttons
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-lang-btn]');
      if (btn) {
        var lang = btn.getAttribute('data-lang-btn');
        switchLang(lang);
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose API for external use
  window.SimpleMemoLang = {
    switch: switchLang,
    getCurrent: getCurrentLang
  };
})();
