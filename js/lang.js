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
   * Clean URL: remove ?lang= parameter and update URL bar
   * SEO: ?lang= causes duplicate URL signals for search engines.
   * Language preference is persisted via localStorage only.
   */
  function cleanUrlParam() {
    const url = new URL(window.location.href);
    if (url.searchParams.has('lang')) {
      const lang = url.searchParams.get('lang');
      if (SUPPORTED_LANGS.includes(lang)) {
        saveLangToStorage(lang);
      }
      url.searchParams.delete('lang');
      window.history.replaceState({}, '', url.pathname + (url.search || '') + url.hash);
    }
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
    
    // SEO: Do NOT append ?lang= to internal links.
    // Language preference is persisted via localStorage.
    // This prevents duplicate parameterized URLs in search engine indexes.
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
    const currentLang = getCurrentLang();
    
    // Migrate: if user arrives with ?lang= param, absorb it into localStorage and clean URL
    cleanUrlParam();

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
