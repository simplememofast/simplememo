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
        el.classList.add('active');
      } else {
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

    // Update document title (find the active title element)
    const activeTitle = document.querySelector('title[data-lang="' + lang + '"]');
    if (activeTitle) {
      document.title = activeTitle.textContent || activeTitle.innerText;
    }

    // Update meta description
    const activeMeta = document.querySelector('meta[name="description"][data-lang="' + lang + '"]');
    if (activeMeta) {
      let mainMeta = document.querySelector('meta[name="description"]:not([data-lang])');
      if (!mainMeta) {
        // Create a main meta if it doesn't exist
        mainMeta = document.createElement('meta');
        mainMeta.name = 'description';
        document.head.appendChild(mainMeta);
      }
      mainMeta.content = activeMeta.content;
    }
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
    // Get and apply current language
    const currentLang = getCurrentLang();
    
    // Save to storage if it came from query
    if (getLangFromQuery()) {
      saveLangToStorage(currentLang);
    }
    
    // Update query param to reflect current state
    updateQueryParam(currentLang);
    
    // Apply language
    applyLang(currentLang);

    // Bind click events to language switcher buttons
    document.querySelectorAll('[data-lang-btn]').forEach(btn => {
      btn.addEventListener('click', function() {
        const lang = this.getAttribute('data-lang-btn');
        switchLang(lang);
      });
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
