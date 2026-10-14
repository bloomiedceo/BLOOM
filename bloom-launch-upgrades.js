/* BLOOM launch polish: local feed interactions and marketplace search destinations.
   Local likes/comments are not shared across accounts. */
(function () {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const read = (key, fallback) => { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } };
  const toast = message => { if (typeof window.showToast === 'function') window.showToast(message); else window.alert(message); };

  function addStyles() {
    const style = document.createElement('style');
    style.id = 'bloom-launch-upgrades-styles';
    style.textContent = `
      #activity .feed-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:18px;width:min(100%,760px);margin:0 auto;padding:4px 8px 16px}
      #activity .feed-card[hidden],#product-grid .product-card[hidden]{display:none!important}
      #activity .feed-card{min-height:0;display:flex;flex-direction:column;scroll-snap-align:none;scroll-margin-top:100px;border-radius:26px;content-visibility:auto;contain-intrinsic-size:auto 520px}
      #activity .feed-art{min-height:220px;flex:0 0 auto;max-height:390px;font-size:clamp(70px,12vw,120px)}
      #activity .feed-content{padding:20px}
      #activity .feed-content h3{font-size:clamp(18px,3vw,25px)}
      #activity .feed-content p{font-size:13px}
      #activity .feed-actions{gap:9px}
      #activity .feed-actions .small-action{padding:10px 14px}
      .bloom-feed-tools{width:min(100%,760px);margin:0 auto 12px;display:flex;gap:9px;flex-wrap:wrap}
      .bloom-feed-tools input,.bloom-feed-tools select{flex:1;min-width:150px;border:1px solid var(--line);border-radius:999px;background:#fff;padding:11px 14px;color:var(--ink)}
      .bloom-local-note{width:min(100%,760px);margin:0 auto 14px;font-size:11px;line-height:1.6;color:var(--muted)}
      .bloom-comment-count{font-size:10px;color:var(--muted);margin-left:4px}
      .bloom-comments-backdrop{position:fixed;inset:0;z-index:80;display:none;align-items:center;justify-content:center;padding:16px;background:#28213b75}
      .bloom-comments-backdrop.open{display:flex}
      .bloom-comments-panel{width:min(540px,100%);max-height:85svh;overflow:auto;background:#fff;border:1px solid #eee2fa;border-radius:24px;padding:22px;box-shadow:0 25px 80px #10081e35}
      .bloom-comments-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .bloom-comments-head h3{margin:0;font-size:22px;letter-spacing:-.04em}
      .bloom-comments-list{display:grid;gap:10px;margin:18px 0}
      .bloom-comment{background:#f8f5ff;border-radius:14px;padding:12px 14px;overflow-wrap:anywhere}
      .bloom-comment strong{display:block;font-size:11px;margin-bottom:5px}
      .bloom-comment p{margin:0;font-size:13px;line-height:1.6;white-space:pre-wrap}
      .bloom-comment-form{display:grid;gap:10px}
      .bloom-comment-form textarea{width:100%;resize:vertical;min-height:85px;border:1px solid var(--line);border-radius:13px;padding:12px;font:inherit;font-size:13px}
      .bloom-market-links{display:flex;gap:9px;flex-wrap:wrap;margin-top:8px}
      .bloom-market-links a{display:inline-flex;align-items:center;gap:4px;border:1px solid #e8def6;background:#faf7ff;color:#7556cf;border-radius:999px;padding:8px 10px;font-size:10px;font-weight:900}
      .bloom-market-links a:hover{background:#eafcff;border-color:#bceef4}
      @media(max-width:640px){#activity .feed-grid{max-height:none;overflow:visible;padding:2px 2px 12px}#activity .feed-card{min-height:0;max-height:none}#activity .feed-art{min-height:150px}#activity .feed-content{padding:15px}.bloom-comments-panel{padding:17px}}
    `;
    document.head.append(style);
  }

  function marketplace() {
    const grid = $('#product-grid');
    const catalogue = [
      {name:'K-pop Album Display Shelf',category:'albums',type:'Albums & collectibles',emoji:'💿',tone:'v-lilac',query:'K-pop album display shelf',tag:'Shelf styling'},
      {name:'Photocard Binder & Sleeves',category:'albums',type:'Photocard storage',emoji:'📔',tone:'v-mint',query:'Photocard binder sleeves',tag:'Collector pick'},
      {name:'Official Light Stick Search',category:'concert',type:'Concert essentials',emoji:'💡',tone:'v-yellow',query:'K-pop official light stick',tag:'Check authenticity'},
      {name:'Light Stick Carry Bag',category:'concert',type:'Concert essentials',emoji:'🎒',tone:'v-pink',query:'Lightstick carry bag',tag:'Concert ready'},
      {name:'K-pop Album Display Stand',category:'albums',type:'Albums & collectibles',emoji:'🖼️',tone:'v-lilac',query:'K-pop album acrylic display stand',tag:'Display edit'},
      {name:'Photocard Toploader Decor',category:'accessories',type:'Fan accessories',emoji:'✨',tone:'v-yellow',query:'Photocard toploader stickers',tag:'DIY corner'},
      {name:'K-pop Slogan Towel',category:'concert',type:'Concert essentials',emoji:'🎀',tone:'v-pink',query:'Concert slogan towel',tag:'Fan project fave'},
      {name:'Concert Light Stick Strap',category:'accessories',type:'Fan accessories',emoji:'🔗',tone:'v-mint',query:'Lightstick wrist strap',tag:'Little essential'},
      {name:'K-pop Inspired Oversized Hoodie',category:'style',type:'Fan style',emoji:'🧥',tone:'v-pink',query:'K-pop inspired oversized hoodie',tag:'Style pick'},
      {name:'Photocard Holder Keychain',category:'accessories',type:'Fan accessories',emoji:'🫧',tone:'v-mint',query:'Photocard holder keychain',tag:'Everyday carry'},
      {name:'Album & Photocard Storage Box',category:'albums',type:'Albums & collectibles',emoji:'📦',tone:'v-lilac',query:'Album photocard storage box',tag:'Tidy collection'},
      {name:'Concert Crossbody Bag',category:'concert',type:'Concert essentials',emoji:'👜',tone:'v-yellow',query:'Concert clear crossbody bag',tag:'Venue-ready'}
    ];
    if (grid && !grid.dataset.bloomCatalogueAdded) {
      catalogue.forEach(item => {
        const card = document.createElement('article');
        card.className = 'product-card';
        card.dataset.category = item.category;
        card.dataset.name = item.name.toLowerCase() + ' ' + item.query.toLowerCase();
        const visual = document.createElement('div'); visual.className = 'product-visual ' + item.tone;
        const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = item.tag;
        const heart = document.createElement('button'); heart.className = 'heart'; heart.type = 'button';
        heart.setAttribute('aria-label', 'Save ' + item.name);
        const wishlistKey = card.dataset.name;
        const saved = read('bloom-demo-wishlist', []);
        const initiallySaved = Array.isArray(saved) && saved.includes(wishlistKey);
        heart.textContent = initiallySaved ? '♥' : '♡';
        heart.setAttribute('aria-pressed', String(initiallySaved));
        heart.addEventListener('click', () => {
          const current = read('bloom-demo-wishlist', []);
          const list = Array.isArray(current) ? current : [];
          const next = list.includes(wishlistKey) ? list.filter(value => value !== wishlistKey) : [...list, wishlistKey];
          if (!write('bloom-demo-wishlist', next)) { toast('Could not save your wishlist in this browser.'); return; }
          const isSaved = next.includes(wishlistKey);
          heart.textContent = isSaved ? '♥' : '♡';
          heart.setAttribute('aria-pressed', String(isSaved));
        });
        const emoji = document.createElement('span'); emoji.className = 'product-emoji'; emoji.textContent = item.emoji;
        visual.append(tag, heart, emoji);
        const info = document.createElement('div'); info.className = 'product-info';
        const type = document.createElement('div'); type.className = 'product-type'; type.textContent = item.type;
        const title = document.createElement('h3'); title.textContent = item.name;
        const desc = document.createElement('p'); desc.textContent = 'Find items listed by BLOOM community sellers, all without leaving BLOOM.';
        const bottom = document.createElement('div'); bottom.className = 'product-bottom';
        const price = document.createElement('span'); price.className = 'price'; price.textContent = 'Community listings';
        const link = document.createElement('a'); link.className = 'shop-link'; link.href = '#bloom-marketplace-listings'; link.textContent = 'Find on BLOOM ↗';
        bottom.append(price, link); info.append(type, title, desc, bottom); card.append(visual, info); grid.append(card);
      });
      grid.dataset.bloomCatalogueAdded = 'true';
    }
    $$('#product-grid .product-card').forEach(card => {
      const title = ($('h3', card)?.textContent || card.dataset.name || '').trim();
      const primary = $('.shop-link', card);
      if (!primary) return;
      primary.href = '#bloom-marketplace-listings';
      primary.removeAttribute('target');
      primary.removeAttribute('rel');
      primary.textContent = 'Find on BLOOM ↗';
      primary.setAttribute('aria-label', 'Find ' + title + ' in the BLOOM community marketplace');
      primary.addEventListener('click', event => {
        event.preventDefault();
        const search = $('#bloom-marketplace-search');
        if (search) { search.value = title.replace(/^K-pop /i, ''); search.dispatchEvent(new Event('input', {bubbles:true})); }
        $('#bloom-marketplace-listings')?.scrollIntoView({behavior:'smooth', block:'start'});
      });
      $$('.bloom-market-links', card).forEach(el => el.remove());
    });
    const disclosure = $('#affiliate-note');
    if (disclosure) disclosure.textContent = 'BLOOM community listings stay inside BLOOM. Purchase requests are sent to sellers in BLOOM; payments are not processed here yet. Check listings carefully and keep personal information private.';
  }

  let activePostId = null;
  function ensureCommentModal() {
    if ($('#bloom-comments-modal')) return;
    const modal = document.createElement('div');
    modal.className = 'bloom-comments-backdrop'; modal.id = 'bloom-comments-modal';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'bloom-comments-title');
    modal.innerHTML = '<section class="bloom-comments-panel"><div class="bloom-comments-head"><h3 id="bloom-comments-title">Fan comments 💬</h3><button class="modal-close" type="button" id="bloom-comments-close" aria-label="Close comments">×</button></div><p class="bloom-local-note" style="margin:8px 0 0">Preview mode: comments are saved only in this browser and are not visible to other fans.</p><div class="bloom-comments-list" id="bloom-comments-list"></div><form class="bloom-comment-form" id="bloom-comment-form"><label for="bloom-comment-input">Add a comment</label><textarea id="bloom-comment-input" maxlength="500" required placeholder="Keep it kind and fandom-friendly ♡"></textarea><button class="pill primary" type="submit">Add comment</button></form></section>';
    document.body.append(modal);
    $('#bloom-comments-close').addEventListener('click', closeComments);
    modal.addEventListener('click', e => { if (e.target === modal) closeComments(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeComments(); });
    $('#bloom-comment-form').addEventListener('submit', event => {
      event.preventDefault();
      if (!activePostId) return;
      const input = $('#bloom-comment-input'), text = input.value.trim();
      if (!text) return;
      const all = read('bloom-feed-comments', {});
      all[activePostId] = all[activePostId] || [];
      all[activePostId].push({ author: 'You (this browser)', text, createdAt: new Date().toISOString() });
      if (!write('bloom-feed-comments', all)) { toast('Could not save this comment in browser storage.'); return; }
      input.value = ''; renderComments(activePostId); toast('Comment saved on this device ♡');
    });
  }
  function closeComments() {
    const modal = $('#bloom-comments-modal');
    if (modal) modal.classList.remove('open');
    if (!$$('.modal-backdrop.open').length) document.body.style.overflow = '';
    activePostId = null;
  }
  function renderComments(id) {
    const all = read('bloom-feed-comments', {}), list = $('#bloom-comments-list');
    list.replaceChildren();
    const comments = all[id] || [];
    if (!comments.length) { const empty = document.createElement('p'); empty.className = 'bloom-local-note'; empty.textContent = 'No comments yet. Start the conversation!'; list.append(empty); }
    comments.forEach(comment => {
      const item = document.createElement('article'); item.className = 'bloom-comment';
      const author = document.createElement('strong'); author.textContent = comment.author || 'Fan';
      const body = document.createElement('p'); body.textContent = comment.text;
      item.append(author, body); list.append(item);
    });
    const card = $$('[data-post-id]').find(el => el.dataset.postId === id);
    const count = card && $('.bloom-comment-count', card);
    if (count) count.textContent = comments.length ? '· ' + comments.length + ' comment' + (comments.length === 1 ? '' : 's') : '· Comment';
  }
  function openComments(card) {
    ensureCommentModal();
    activePostId = card.dataset.postId || card.id || 'post-' + Date.now();
    card.dataset.postId = activePostId;
    $('#bloom-comments-title').textContent = 'Comments · ' + ($('h3', card)?.textContent || 'Fan post');
    $('#bloom-comments-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
    renderComments(activePostId); $('#bloom-comment-input').focus();
  }

  function setupFeed() {
    const section = $('#activity'), grid = $('.feed-grid', section);
    if (!section || !grid) return;
    // bloom-enhancements.js owns the single search/fandom/saved-post filter bar.
    // A second filter bar here competed for the same cards and could undo the first filter.
    const existing = $('.bloom-controls', section);
    const note = document.createElement('p'); note.className = 'bloom-local-note';
    note.textContent = 'Scroll vertically for the feed. Preview likes, saves, and comments stay on this device; shared community posts use the connected BLOOM backend.';
    if (existing) existing.insertAdjacentElement('afterend', note); else grid.before(note);

    function decorate(card, index) {
      if (card.classList.contains('bloom-shared-post')) return;
      if (card.dataset.bloomLaunchReady === 'true') return;
      card.dataset.bloomLaunchReady = 'true';
      if (!card.dataset.postId) card.dataset.postId = card.id || 'bloom-post-' + index + '-' + (($('h3', card)?.textContent || 'fan').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
      const actions = $('.feed-actions', card);
      if (!actions) return;
      const actionButtons = $('button.small-action', actions);
      const like = actionButtons.find(button => button.dataset.action === 'like' || /^(?:♡|♥) Like|^(?:♡|♥) Liked/.test(button.textContent.trim()));
      if (like) {
        like.removeAttribute('onclick');
        // One click must run one like handler, not update two competing storage keys.
        like.removeAttribute('data-action');
        like.dataset.bloomAction = 'like';
        const liked = !!read('bloom-feed-likes', {})[card.dataset.postId];
        like.setAttribute('aria-pressed', String(liked));
        like.textContent = liked ? '♥ Liked' : '♡ Like';
      }
      // Preserve the existing Save and Discuss controls; do not repurpose Save as Comment.
      const save = actionButtons.find(button => button.dataset.action === 'save');
      if (save) save.removeAttribute('onclick');
      let comment = $('[data-bloom-action="comment"]', actions);
      if (!comment) { comment = document.createElement('button'); comment.type = 'button'; comment.className = 'small-action'; actions.append(comment); }
      comment.removeAttribute('onclick');
      comment.dataset.bloomAction = 'comment';
      comment.innerHTML = '💬 Comment <span class="bloom-comment-count">· Comment</span>';
      if (!$('[data-bloom-action="share"]', actions)) {
        const share = document.createElement('button'); share.type = 'button'; share.className = 'small-action'; share.dataset.bloomAction = 'share'; share.textContent = '↗ Share'; actions.append(share);
      }
      const count = $('.bloom-comment-count', actions), n = (read('bloom-feed-comments', {})[card.dataset.postId] || []).length;
      if (count && n) count.textContent = '· ' + n + ' comment' + (n === 1 ? '' : 's');
    }
    $('.feed-card', grid).forEach(decorate);
    const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.matches?.('.feed-card')) decorate(node, Date.now());
      node.querySelectorAll?.('.feed-card').forEach((card, i) => decorate(card, Date.now() + i));
    })));
    observer.observe(grid, { childList: true });
    grid.addEventListener('click', async event => {
      const button = event.target.closest('button[data-bloom-action]');
      if (!button) return;
      const card = button.closest('.feed-card');
      if (!card) return;
      if (button.dataset.bloomAction === 'like') {
        const likes = read('bloom-feed-likes', {});
        const id = card.dataset.postId;
        const liked = !likes[id];
        if (liked) likes[id] = true; else delete likes[id];
        if (!write('bloom-feed-likes', likes)) { toast('Could not save this like in browser storage.'); return; }
        button.setAttribute('aria-pressed', String(liked));
        button.textContent = liked ? '♥ Liked' : '♡ Like';
        return;
      }
      if (button.dataset.bloomAction === 'comment') { openComments(card); return; }
      if (button.dataset.bloomAction === 'share') {
        const title = $('h3', card)?.textContent || 'BLOOM fan post', text = $('p', card)?.textContent || 'Check out this fan moment on BLOOM.';
        const url = location.origin + location.pathname + '#activity';
        try {
          if (navigator.share) await navigator.share({ title: 'BLOOM · ' + title, text, url });
          else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); toast('BLOOM feed link copied ♡'); }
          else window.prompt('Copy this BLOOM link:', url);
        } catch (error) { if (error?.name !== 'AbortError') toast('Could not share automatically. You can copy the page link from your browser.'); }
      }
    });
    ensureCommentModal();
  }
  function init() { addStyles(); marketplace(); setupFeed(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();