/**
 * Simple Memo - Language Switcher
 * Handles site-wide language switching with localStorage persistence and query parameter support
 */

(function() {
  'use strict';

  const STORAGE_KEY = 'simple-memo-lang';
  const DEFAULT_LANG = 'ja';
  const SUPPORTED_LANGS = ['ja', 'en'];

  /**
   * Get language from URL query parameter
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
   * Update URL query parameter without page reload
   */
  function updateQueryParam(lang) {
    const url = new URL(window.location.href);
    url.searchParams.set('lang', lang);
    window.history.replaceState({}, '', url.toString());
  }

  /**
   * Get the current language (priority: query > storage > default)
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
    document.querySelectorAll('[data-lang]').forEach(el => {
      if (el.getAttribute('data-lang') === lang) {
        el.style.display = '';
        el.classList.add('active');
      } else {
        el.style.display = 'none';
        el.classList.remove('active');
      }
    });

    // Update language switcher buttons
    document.querySelectorAll('[data-lang-btn]').forEach(btn => {
      if (btn.getAttribute('data-lang-btn') === lang) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update document title and meta info from hidden templates
    const metaSource = document.querySelector(`.meta-template[data-lang="${lang}"]`);
    if (metaSource) {
      // Title
      const title = metaSource.querySelector('.meta-title');
      if (title) document.title = title.textContent;

      // Description
      const desc = metaSource.querySelector('.meta-description');
      if (desc) {
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.setAttribute('content', desc.textContent);
        
        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc) ogDesc.setAttribute('content', desc.textContent);

        const twitterDesc = document.querySelector('meta[name="twitter:description"]');
        if (twitterDesc) twitterDesc.setAttribute('content', desc.textContent);
      }

      // OG/Twitter Title
      const ogTitle = metaSource.querySelector('.meta-og-title');
      if (ogTitle) {
        const metaOgTitle = document.querySelector('meta[property="og:title"]');
        if (metaOgTitle) metaOgTitle.setAttribute('content', ogTitle.textContent);

        const metaTwitterTitle = document.querySelector('meta[name="twitter:title"]');
        if (metaTwitterTitle) metaTwitterTitle.setAttribute('content', ogTitle.textContent);
      }
    }
    
    // Update all internal links to preserve lang param
    document.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href');
      if (href && (href.startsWith('/') || !href.includes(':')) && !href.startsWith('#')) {
        try {
          const url = new URL(href, window.location.origin);
          url.searchParams.set('lang', lang);
          a.setAttribute('href', url.pathname + url.search + url.hash);
        } catch (e) {
          // Skip if invalid URL
        }
      }
    });
  }

  /**
   * Switch language
   */
  function switchLang(lang) {
    if (!SUPPORTED_LANGS.includes(lang)) return;
    
    saveLangToStorage(lang);
    updateQueryParam(lang);
    applyLang(lang);
  }

  /**
   * Initialize language switcher
   */
  function init() {
    const currentLang = getCurrentLang();
    
    if (getLangFromQuery()) {
      saveLangToStorage(currentLang);
    }
    
    updateQueryParam(currentLang);
    applyLang(currentLang);

    // Bind click events to language switcher buttons
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('[data-lang-btn]');
      if (btn) {
        const lang = btn.getAttribute('data-lang-btn');
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
