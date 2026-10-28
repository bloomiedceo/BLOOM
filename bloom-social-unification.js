/* BLOOM Phase 1: interest discovery and mobile navigation for the existing app. */
(function () {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const interestLabels = {all:'all',creative:'Art & design',gaming:'Gaming',lifestyle:'Lifestyle',food:'Food & drink',outdoors:'Outdoors & wellbeing',music:'Music & fandom',fandom:'K-pop',books:'Books & learning',tech:'Tech & making'};
  function toast(message) { if (typeof window.showToast === 'function') window.showToast(message); else console.info(message); }
  function chooseInterest(key) {
    const value = interestLabels[key] || 'all';
    $$('.bloom-interest-chip').forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.bloomInterestFilter === key)));
    const filter = $('#bloom-fandom-filter');
    if (filter) { filter.value = value; filter.dispatchEvent(new Event('input', {bubbles:true})); filter.dispatchEvent(new Event('change', {bubbles:true})); }
    const search = $('#bloom-feed-search');
    if (search) { search.value = ''; search.dispatchEvent(new Event('input', {bubbles:true})); }
    try { sessionStorage.setItem('bloom-interest-filter', key); } catch (_) {}
  }
  function initInterestSearch() {
    const input = $('#bloom-interest-search'), grid = $('#bloom-interest-grid');
    if (!input || !grid) return;
    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      $$('.bloom-interest-card', grid).forEach((card) => { card.hidden = !((card.dataset.bloomSearch || '') + ' ' + card.textContent).toLowerCase().includes(query); });
    });
  }
  function initInterestNavigation() {
    $$('.bloom-interest-card[data-bloom-interest-target], .bloom-interest-chip[data-bloom-interest-filter]').forEach((element) => {
      if (element.dataset.bloomUnifyReady === 'true') return;
      element.dataset.bloomUnifyReady = 'true';
      element.addEventListener('click', () => chooseInterest(element.dataset.bloomInterestTarget || element.dataset.bloomInterestFilter || 'all'));
    });
    const searchButton = $('button[aria-label="Search"]');
    if (searchButton && !searchButton.dataset.bloomSearchUpdated) {
      searchButton.dataset.bloomSearchUpdated = 'true';
      searchButton.setAttribute('aria-label', 'Search interests');
      searchButton.onclick = () => { $('#explore')?.scrollIntoView({behavior:'smooth',block:'start'}); $('#bloom-interest-search')?.focus({preventScroll:true}); };
    }
    try { const saved = sessionStorage.getItem('bloom-interest-filter'); if (saved && interestLabels[saved]) chooseInterest(saved); } catch (_) {}
  }

  function initMyMix() {
    const panel = $('#bloom-my-mix');
    if (!panel) return;
    const buttons = $$('.bloom-preference-chip', panel);
    const status = $('#bloom-mix-status', panel);
    let pending = new Set();
    try {
      const saved = JSON.parse(localStorage.getItem('bloom-interest-preferences-v1') || '[]');
      if (Array.isArray(saved)) pending = new Set(saved.filter((key) => buttons.some((button) => button.dataset.bloomPref === key)));
    } catch (_) {}
    function resetFeedControls() {
      const filter = $('#bloom-fandom-filter');
      if (filter) filter.value = 'all';
      const search = $('#bloom-feed-search');
      if (search) search.value = '';
      const saved = $('#bloom-show-saved');
      if (saved) { saved.setAttribute('aria-pressed', 'false'); saved.textContent = '☆ Saved posts'; }
    }
    function paint() {
      buttons.forEach((button) => button.setAttribute('aria-pressed', String(pending.has(button.dataset.bloomPref))));
      if (status) {
        let enabled = false;
        try { enabled = localStorage.getItem('bloom-interest-mix-enabled-v1') === 'true'; } catch (_) {}
        if (enabled && pending.size) status.textContent = 'Your mix is active with ' + pending.size + ' interest' + (pending.size === 1 ? '' : 's') + '. Change your picks and apply again any time.';
        else if (pending.size) status.textContent = pending.size + ' interest' + (pending.size === 1 ? '' : 's') + ' selected. Apply your mix to filter the For You feed.';
        else status.textContent = 'No interests selected yet. BLOOM will show the full range of topics.';
      }
    }
    buttons.forEach((button) => button.addEventListener('click', () => {
      const key = button.dataset.bloomPref;
      if (pending.has(key)) pending.delete(key); else pending.add(key);
      paint();
    }));
    $('#bloom-apply-mix', panel)?.addEventListener('click', () => {
      const selected = [...pending];
      try {
        localStorage.setItem('bloom-interest-preferences-v1', JSON.stringify(selected));
        localStorage.setItem('bloom-interest-mix-enabled-v1', String(selected.length > 0));
      } catch (_) { toast('Browser storage is unavailable, so these preferences may not persist.'); }
      resetFeedControls();
      document.dispatchEvent(new Event('bloom:interest-preferences-updated'));
      paint();
      $('#activity')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast(selected.length ? 'Your BLOOM Mix is ready with ' + selected.length + ' interest' + (selected.length === 1 ? '' : 's') + ' ✿' : 'Showing every interest in BLOOM.');
    });
    $('#bloom-clear-mix', panel)?.addEventListener('click', () => {
      pending.clear();
      try {
        localStorage.setItem('bloom-interest-preferences-v1', '[]');
        localStorage.setItem('bloom-interest-mix-enabled-v1', 'false');
      } catch (_) { toast('Browser storage is unavailable, so this change may not persist.'); }
      document.dispatchEvent(new Event('bloom:interest-preferences-updated'));
      paint();
      toast('Your feed is open to all interests again.');
    });
    paint();
    document.dispatchEvent(new Event('bloom:interest-preferences-updated'));
  }

  function initDock() {
    const dock = $('.bloom-mobile-dock');
    if (!dock) return;
    dock.addEventListener('click', (event) => {
      const button = event.target.closest('[data-dock-action]');
      if (!button) return;
      const action = button.dataset.dockAction;
      if (action === 'create') {
        if (typeof window.openModal === 'function') window.openModal('post-modal'); else toast('Post composer is still loading. Please try again.');
      } else if (action === 'chat') {
        if (typeof window.scrollToBloomChat === 'function') window.scrollToBloomChat();
        else { $('#community')?.scrollIntoView({behavior:'smooth',block:'start'}); toast('Group chat is part of BLOOM LIVE. Sign in to use shared messaging.'); }
      } else if (action === 'profile') {
        if (typeof window.openModal === 'function') window.openModal('profile-modal'); else toast('Profile settings are still loading. Please try again.');
      }
    });
  }
  function initMobileDockState() {
    const links = $$('.bloom-mobile-dock a[href^="#"]');
    if (!('IntersectionObserver' in window) || !links.length) return;
    const sections = links.map((link) => $(link.getAttribute('href'))).filter(Boolean);
    if (!sections.length) return;
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      links.forEach((link) => link.classList.toggle('is-current', link.getAttribute('href') === '#' + entry.target.id));
    }), {rootMargin:'-30% 0px -60% 0px',threshold:0});
    sections.forEach((section) => observer.observe(section));
  }
  function init() { initInterestSearch(); initInterestNavigation(); initMyMix(); initDock(); initMobileDockState(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();
