/* Optional BLOOM Supabase integration. It stays in demo mode until bloom-config.js is configured. */
(function () {
  'use strict';
  const cfg = window.BLOOM_SUPABASE_CONFIG || {};
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const esc = (value) => String(value ?? '');
  let newsletterClient = null;
  let newsletterSubmitting = false;
  const newsletterForm = $('#signup-form');
  if (newsletterForm) newsletterForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const emailInput = $('#email');
    const consentInput = $('#newsletter-consent');
    const honeypot = $('#newsletter-website');
    const status = $('#newsletter-status');
    const submitButton = $('button[type="submit"]', newsletterForm);
    if (!emailInput || !consentInput || !status || !submitButton) return;
    if (cfg.newsletterEnabled === false) {
      status.dataset.state = 'error';
      status.textContent = 'BLOOM email confirmation is still being configured. Your address has not been sent or saved. Please try again later.';
      return;
    }
    if (!emailInput.checkValidity()) {
      emailInput.reportValidity();
      status.dataset.state = 'error';
      status.textContent = 'Please enter a valid email address.';
      return;
    }
    if (!consentInput.checked) {
      status.dataset.state = 'error';
      status.textContent = 'Please confirm that you want to receive BLOOM email updates.';
      consentInput.focus();
      return;
    }
    if (!cfg.url || !cfg.anonKey) {
      status.dataset.state = 'error';
      status.textContent = 'Newsletter email delivery is not configured yet. Your email has not been subscribed. Please try again later.';
      return;
    }
    if (newsletterSubmitting) return;
    newsletterSubmitting = true;
    submitButton.disabled = true;
    const originalLabel = submitButton.textContent;
    submitButton.textContent = 'Sending…';
    status.dataset.state = 'pending';
    status.textContent = 'Requesting your confirmation email…';
    try {
      const response = await fetch(cfg.url.replace(/\/$/, '') + '/functions/v1/newsletter-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': cfg.anonKey },
        body: JSON.stringify({
          email: emailInput.value.trim().toLowerCase(),
          consent: consentInput.checked,
          website: honeypot?.value || ''
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        status.dataset.state = 'error';
        status.textContent = response.status === 503 && /not configured/i.test(result.error || '') ? 'BLOOM email delivery is not configured yet. Your email has not been subscribed.' : (result.error || 'We could not send your confirmation email. Please try again later.');
      } else {
        status.dataset.state = 'success';
        status.textContent = result.message || 'Check your inbox for a confirmation link to finish signing up.';
        emailInput.value = '';
        consentInput.checked = false;
      }
    } catch (_) {
      status.dataset.state = 'error';
      status.textContent = 'We could not reach the newsletter service. Your signup is not confirmed; please try again.';
    } finally {
      newsletterSubmitting = false;
      submitButton.disabled = false;
      submitButton.textContent = originalLabel;
    }
  });
  const note = (message) => {
    let box = $('#bloom-backend-status');
    if (!box) {
      const anchor = $('#activity .wrap') || $('main');
      if (!anchor) return;
      box = document.createElement('div');
      box.id = 'bloom-backend-status';
      box.className = 'bloom-backend-status';
      anchor.prepend(box);
    }
    box.textContent = message;
  };
  if (!cfg.url || !cfg.anonKey) {
    note('BLOOM is in preview mode: music, feed and shop demos can be explored, but real accounts and shared chat are not connected yet. See the README for secure backend setup.');
    return;
  }
  if (!/^https:\/\//i.test(cfg.url) || /service_role/i.test(cfg.anonKey)) {
    note('Backend configuration looks invalid. Use your Supabase Project URL and public publishable/anon key only; never use a service-role key in the website.');
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
  script.async = true;
  script.onload = () => {
    if (!window.supabase?.createClient) {
      note('The backend library could not load. Refresh the page or check your network connection.');
      return;
    }
    start(window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    }));
  };
  script.onerror = () => note('Could not load the secure backend client. Check your connection and try again.');
  document.head.append(script);

  function start(client) {
    newsletterClient = client;
    const activity = $('#activity .wrap');
    if (!activity) return;
    let currentUser = null;
    window.bloomMusicPlaylists = {
      isSignedIn: () => Boolean(currentUser),
      list: async () => await client.from('music_playlists')
        .select('id,spotify_playlist_id,title,created_at')
        .order('created_at', { ascending: false }).limit(50),
      add: async ({ spotifyId, title }) => {
        if (!currentUser) return { data: null, auth: true, error: { message: 'Sign in to share a playlist with everyone on BLOOM.' } };
        return await client.from('music_playlists')
          .insert({ spotify_playlist_id: spotifyId, title, added_by: currentUser.id })
          .select('id,spotify_playlist_id,title,created_at').single();
      }
    };
    document.dispatchEvent(new CustomEvent('bloom:music-ready'));
    let passwordRecovery = false;
    let activeGroup = null;
    let messageChannel = null;
    let knownGroups = [];
    let isModerator = false;

    const panel = document.createElement('section');
    panel.id = 'bloom-live-community';
    panel.className = 'bloom-live-community';
    panel.innerHTML = `
      <div class="bloom-live-heading"><div><div class="kicker">Connected community</div><h2>BLOOM LIVE ✨</h2></div><p id="bloom-live-status" role="status">Connecting securely…</p></div>
      <div class="bloom-live-grid">
        <section class="bloom-live-card" id="bloom-social-rail">
          <h3>✨ Stories & notifications</h3>
          <form id="bloom-story-form" class="bloom-modal-form">
            <label for="bloom-story-photo">Add a story photo</label><input id="bloom-story-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required>
            <label for="bloom-story-caption">Caption (optional)</label><input id="bloom-story-caption" maxlength="240" placeholder="A little fandom moment…">
            <button class="pill lavender" type="submit">＋ Share 24-hour story</button>
          </form>
          <p id="bloom-story-status" class="bloom-enhance-note" role="status" aria-live="polite">Sign in to share a story. Stories are public for 24 hours. Don't share private or identifying images.</p>
          <div id="bloom-live-stories" class="bloom-live-stories"></div>
          <div class="bloom-social-notifications-head"><h4>🔔 Notifications</h4><button id="bloom-notifications-refresh" class="small-action" type="button">Refresh</button></div>
          <p id="bloom-notification-status" class="bloom-enhance-note" role="status" aria-live="polite">Sign in to view activity on your posts and groups.</p>
          <div id="bloom-live-notifications" class="bloom-live-notifications"></div>
        </section>
        <section class="bloom-live-card">
          <h3>🌷 Community posts</h3>
          <form id="bloom-live-post-form" class="bloom-modal-form">
            <label for="bloom-live-title">Post title</label><input id="bloom-live-title" maxlength="100" required placeholder="What do you want to share?">
            <label for="bloom-live-body">Your update</label><textarea id="bloom-live-body" maxlength="2000" rows="3" required placeholder="Keep it kind and fandom-friendly."></textarea>
            <label for="bloom-live-fandom">Fandom</label><input id="bloom-live-fandom" maxlength="60" placeholder="e.g. Multi-stan">
            <label for="bloom-live-link">Link (optional)</label><input id="bloom-live-link" type="url" placeholder="https://…">
            <button class="pill primary" type="submit">Publish post</button>
          </form>
          <p class="bloom-enhance-note">Posts are shared only when you are signed in. Don't share private details or media you don't have permission to post.</p>
          <div id="bloom-live-posts" class="bloom-live-posts" aria-live="polite"></div>
        </section>
        <section class="bloom-live-card">
          <h3>💬 Groups & live chat</h3>
          <form id="bloom-live-group-form" class="bloom-inline-form"><input id="bloom-live-group-name" maxlength="70" required placeholder="Name a fan group"><button class="pill lavender" type="submit">Create</button></form>
          <div id="bloom-live-groups" class="bloom-live-groups"></div>
          <div class="bloom-live-chat">
            <h4 id="bloom-live-chat-title">Choose a group</h4>
            <p id="bloom-live-chat-note" class="bloom-enhance-note">Sign in and join a public group to chat.</p>
            <div id="bloom-live-messages" class="bloom-live-messages" aria-live="polite"></div>
            <form id="bloom-live-message-form" class="bloom-inline-form"><input id="bloom-live-message" maxlength="1000" required placeholder="Write a respectful message…" disabled><button class="pill primary" type="submit" disabled>Send</button></form>
          </div>
        </section>
      </div>
      <section id="bloom-live-moderation" class="bloom-live-card" hidden><h3>🛡️ Moderator queue</h3><p class="bloom-enhance-note">Moderator access is granted only through trusted Supabase app metadata.</p><div id="bloom-live-reports"></div></section>
    `;
    const feed = $('#activity .feed-grid');
    if (feed) feed.before(panel);
    else activity.append(panel);
    function setupMarketplace() {
      const discover = $('#discover .wrap');
      if (!discover || $('#bloom-marketplace-app')) return;
      const root = document.createElement('section');
      root.id = 'bloom-marketplace-app';
      root.innerHTML = `
        <div class="bloom-market-head"><div><div class="kicker">BLOOM marketplace · buy & sell here</div><h2>Find your next fan treasure. 🌸</h2><p>Browse community listings, post an item, and send purchase requests without leaving BLOOM.</p></div><button class="pill primary" id="bloom-market-sell" type="button">＋ Sell an item</button></div>
        <div class="bloom-market-controls"><input id="bloom-market-search" type="search" aria-label="Search listings" placeholder="Search BLOOM listings…"><select id="bloom-market-category" aria-label="Filter category"><option value="all">All categories</option><option value="albums">Albums & collectibles</option><option value="photocards">Photocards</option><option value="fashion">Fan style</option><option value="accessories">Accessories</option><option value="concert">Concert essentials</option><option value="other">Other</option></select></div>
        <p id="bloom-market-status" class="bloom-enhance-note" role="status" aria-live="polite">Loading listings…</p><div id="bloom-marketplace-listings" class="bloom-market-grid"></div>
        <form id="bloom-market-listing-form" class="bloom-market-form" hidden><h3>List an item on BLOOM</h3><label for="bloom-market-title">Item name</label><input id="bloom-market-title" maxlength="90" required placeholder="e.g. Photocard binder"><label for="bloom-market-description">Description</label><textarea id="bloom-market-description" maxlength="1200" rows="3" required placeholder="Condition, details, and what's included"></textarea><div class="bloom-market-form-row"><div><label for="bloom-market-price">Price (MYR)</label><input id="bloom-market-price" type="number" min="0" max="100000" step="0.01" value="0" required></div><div><label for="bloom-market-category-new">Category</label><select id="bloom-market-category-new"><option value="albums">Albums & collectibles</option><option value="photocards">Photocards</option><option value="fashion">Fan style</option><option value="accessories">Accessories</option><option value="concert">Concert essentials</option><option value="other">Other</option></select></div></div><div class="bloom-market-form-row"><div><label for="bloom-market-condition">Condition</label><select id="bloom-market-condition"><option value="new">New</option><option value="like_new">Like new</option><option value="good" selected>Good</option><option value="fair">Fair</option></select></div><div><label for="bloom-market-emoji">Card emoji</label><select id="bloom-market-emoji"><option>🌸</option><option>💿</option><option>🎀</option><option>📔</option><option>🧥</option><option>🎒</option><option>✨</option><option>🫧</option></select></div></div><button class="pill primary" type="submit">Publish listing</button> <button class="pill lavender" id="bloom-market-cancel" type="button">Cancel</button><p class="bloom-enhance-note">Be honest about the item. Don't include addresses, phone numbers, or private information.</p></form>
        <section class="bloom-market-inbox"><h3>Seller inbox 💌</h3><p class="bloom-enhance-note">Purchase requests for your listings appear here. No payment is taken in BLOOM yet.</p><div id="bloom-market-inquiries"></div></section>
        <p class="bloom-market-safety">Safety first: don't share passwords, verification codes, home addresses, or private contact details. If you're under 18, involve a trusted adult before any payment, shipping, or in-person exchange. BLOOM does not process payments or verify items yet.</p>`;
      const head = $('.section-head', discover);
      if (head) head.insertAdjacentElement('afterend', root); else discover.prepend(root);
      const style = document.createElement('style'); style.id='bloom-marketplace-styles';
      style.textContent = `
        #bloom-marketplace-app{margin:22px 0 30px;padding:24px;border:1px solid var(--line);border-radius:26px;background:linear-gradient(145deg,#fff,#f5efff)}
        .bloom-market-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap}.bloom-market-head h2{font-size:clamp(25px,4vw,38px);letter-spacing:-.06em;margin:8px 0}.bloom-market-head p{max-width:600px;color:var(--muted);font-size:13px;line-height:1.65}
        .bloom-market-controls{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 10px}.bloom-market-controls input{flex:1;min-width:150px}
        .bloom-market-controls input,.bloom-market-controls select,.bloom-market-form input,.bloom-market-form select,.bloom-market-form textarea,.bloom-market-request-form textarea{border:1px solid var(--line);border-radius:12px;background:white;padding:11px 13px;color:var(--ink);font:inherit}
        .bloom-market-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px;margin:16px 0}.bloom-market-card{min-width:0;background:white;border:1px solid var(--line);border-radius:18px;padding:16px;display:flex;flex-direction:column;gap:9px;content-visibility:auto;contain-intrinsic-size:auto 290px}
        .bloom-market-emoji{width:48px;height:48px;border-radius:15px;display:grid;place-items:center;background:#f1eaff;font-size:25px}.bloom-market-card h4{margin:0;font-size:16px;overflow-wrap:anywhere}.bloom-market-card p{margin:0;color:var(--muted);font-size:12px;line-height:1.55;overflow-wrap:anywhere}.bloom-market-meta{font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}.bloom-market-price{font-size:17px;font-weight:900;margin-top:auto}.bloom-market-actions{display:flex;gap:8px;flex-wrap:wrap}.bloom-market-actions button{border:1px solid var(--line);border-radius:999px;padding:8px 11px;background:white;font-weight:800;font-size:11px}
        .bloom-market-form{margin:18px 0;padding:18px;border-radius:18px;background:white;border:1px solid var(--line)}.bloom-market-form[hidden]{display:none}.bloom-market-form label,.bloom-market-request-form label{display:block;font-size:12px;font-weight:800;margin:12px 0 6px}.bloom-market-form input,.bloom-market-form select,.bloom-market-form textarea{width:100%}.bloom-market-form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.bloom-market-inbox{margin-top:22px;border-top:1px solid var(--line);padding-top:18px}.bloom-market-inquiry{border:1px solid var(--line);border-radius:14px;background:white;padding:12px;margin:9px 0}.bloom-market-inquiry p{font-size:12px;line-height:1.5;overflow-wrap:anywhere}.bloom-market-safety{font-size:11px;line-height:1.6;color:var(--muted);margin-top:18px}
        #bloom-market-request-modal .modal{width:min(520px,100%)}.bloom-market-request-form textarea{width:100%}
        @media(max-width:760px){#bloom-marketplace-app{padding:16px}.bloom-market-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:480px){.bloom-market-grid,.bloom-market-form-row{grid-template-columns:1fr}}
      `;
      document.head.append(style);
      const status=$('#bloom-market-status'), form=$('#bloom-market-listing-form'), cards=$('#bloom-marketplace-listings'), inbox=$('#bloom-market-inquiries'), search=$('#bloom-market-search'), filter=$('#bloom-market-category');
      let listings=[], sellerProfiles=new Map(), requested=null;
      const say=message=>{status.textContent=message};
      const price=value=>Number(value)===0?'Free':'MYR '+Number(value).toFixed(2);
      const condition=value=>({new:'New',like_new:'Like new',good:'Good',fair:'Fair'})[value]||'Good';
      function needAuth(message){openAuth();setAuthMessage(message);}
      function openRequest(item){if(!currentUser){needAuth('Sign in to send a purchase request.');return;}if(item.seller_id===currentUser.id){say('That is your own listing.');return;}requested=item;$('#bloom-market-request-title').textContent='Request: '+item.title;$('#bloom-market-request-modal').classList.add('open');document.body.style.overflow='hidden';$('#bloom-market-request-message').focus();}
      function renderListings(){
        const q=search.value.trim().toLowerCase(), cat=filter.value;
        const visible=listings.filter(item=>(cat==='all'||item.category===cat)&&(item.title+' '+item.description+' '+item.category).toLowerCase().includes(q));
        cards.replaceChildren();
        if(!visible.length){const empty=document.createElement('p');empty.className='bloom-enhance-note';empty.textContent=listings.length?'No listings match. Try another search or category.':'No community listings yet. Be the first to list a fan item!';cards.append(empty);return;}
        visible.forEach(item=>{
          const card=document.createElement('article');card.className='bloom-market-card';
          const emoji=document.createElement('div');emoji.className='bloom-market-emoji';emoji.textContent=item.emoji||'🌸';
          const meta=document.createElement('div');meta.className='bloom-market-meta';meta.textContent=item.category+' · '+condition(item.item_condition)+' · '+(sellerProfiles.get(item.seller_id)?.username||'BLOOM seller');
          const title=document.createElement('h4');title.textContent=item.title;
          const desc=document.createElement('p');desc.textContent=item.description;
          const cost=document.createElement('div');cost.className='bloom-market-price';cost.textContent=price(item.price);
          const actions=document.createElement('div');actions.className='bloom-market-actions';
          if(currentUser?.id===item.seller_id){const sold=document.createElement('button');sold.type='button';sold.textContent='Mark as sold';sold.addEventListener('click',async()=>{const {error}=await client.from('marketplace_listings').update({status:'sold',updated_at:new Date().toISOString()}).eq('id',item.id).eq('seller_id',currentUser.id);if(error){say('Could not update listing: '+error.message);return;}say('Listing marked as sold.');await loadMarketplaceListings();await loadMarketplaceInbox();});actions.append(sold);}
          else {const buy=document.createElement('button');buy.type='button';buy.textContent='Request to buy';buy.addEventListener('click',()=>openRequest(item));actions.append(buy);}
          card.append(emoji,meta,title,desc,cost,actions);cards.append(card);
        });
      }
      async function loadMarketplaceListings(){
        const {data,error}=await client.from('marketplace_listings').select('id,seller_id,title,description,category,item_condition,price,emoji,status,created_at').eq('status','active').order('created_at',{ascending:false}).limit(60);
        if(error){listings=[];renderListings();say('Marketplace database needs setup: '+error.message);return;}
        listings=data||[];sellerProfiles=new Map();const ids=[...new Set(listings.map(item=>item.seller_id))];
        if(ids.length){const p=await client.from('profiles').select('id,username,display_name').in('id',ids);if(!p.error)(p.data||[]).forEach(row=>sellerProfiles.set(row.id,row));}
        renderListings();say(listings.length+' active BLOOM listing(s). Request an item directly inside BLOOM.');
      }
      async function loadMarketplaceInbox(){
        inbox.replaceChildren();if(!currentUser){inbox.textContent='Sign in to see requests for your listings.';return;}
        const own=await client.from('marketplace_listings').select('id,title').eq('seller_id',currentUser.id);
        if(own.error){inbox.textContent='Could not load your listings inbox: '+own.error.message;return;}
        const mine=own.data||[];if(!mine.length){inbox.textContent='Publish a listing to receive requests here.';return;}
        const result=await client.from('marketplace_inquiries').select('id,listing_id,buyer_id,message,status,created_at').in('listing_id',mine.map(x=>x.id)).order('created_at',{ascending:false}).limit(40);
        if(result.error){inbox.textContent='Could not load requests: '+result.error.message;return;}
        const rows=(result.data||[]).filter(x=>x.status==='new');if(!rows.length){inbox.textContent='No new purchase requests yet.';return;}
        const buyerIds=[...new Set(rows.map(x=>x.buyer_id))], p=await client.from('profiles').select('id,username').in('id',buyerIds), buyers=new Map((p.data||[]).map(x=>[x.id,x.username]));
        rows.forEach(item=>{const box=document.createElement('article');box.className='bloom-market-inquiry';const heading=document.createElement('strong');heading.textContent=(mine.find(x=>x.id===item.listing_id)?.title||'Your item')+' · from '+(buyers.get(item.buyer_id)||'BLOOM buyer');const msg=document.createElement('p');msg.textContent=item.message;const close=document.createElement('button');close.type='button';close.className='pill lavender';close.textContent='Close request';close.addEventListener('click',async()=>{const {error}=await client.from('marketplace_inquiries').update({status:'closed'}).eq('id',item.id);if(error){say('Could not close request: '+error.message);return;}await loadMarketplaceInbox();});box.append(heading,msg,close);inbox.append(box);});
      }
      const modal=document.createElement('div');modal.id='bloom-market-request-modal';modal.className='modal-backdrop';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','bloom-market-request-heading');
      modal.innerHTML='<div class="modal"><div class="modal-head"><h2 id="bloom-market-request-heading">Request an item 💌</h2><button type="button" class="modal-close" id="bloom-market-request-close" aria-label="Close">×</button></div><h3 id="bloom-market-request-title"></h3><p class="bloom-enhance-note">This sends a request, not a payment or confirmed order. Do not include private contact details.</p><form id="bloom-market-request-form" class="bloom-market-request-form"><label for="bloom-market-request-message">Message to seller</label><textarea id="bloom-market-request-message" rows="4" maxlength="600" required placeholder="Hi! Is this item still available?"></textarea><button type="submit" class="pill primary">Send request</button></form></div>';
      document.body.append(modal);
      $('#bloom-market-request-close').addEventListener('click',()=>{modal.classList.remove('open');document.body.style.overflow='';});
      modal.addEventListener('click',e=>{if(e.target===modal){modal.classList.remove('open');document.body.style.overflow='';}});
      $('#bloom-market-request-form').addEventListener('submit',async e=>{e.preventDefault();if(!currentUser||!requested||requested.seller_id===currentUser.id){needAuth('Sign in with a buyer account to send a request.');return;}const message=$('#bloom-market-request-message').value.trim();if(!message)return;const {error}=await client.from('marketplace_inquiries').insert({listing_id:requested.id,buyer_id:currentUser.id,message});if(error){say('Could not send request: '+error.message);return;}modal.classList.remove('open');document.body.style.overflow='';e.target.reset();say('Purchase request sent inside BLOOM. No payment has been taken.');});
      $('#bloom-market-sell').addEventListener('click',()=>{if(!currentUser){needAuth('Sign in before publishing a listing.');return;}form.hidden=!form.hidden;if(!form.hidden)$('#bloom-market-title').focus();});
      $('#bloom-market-cancel').addEventListener('click',()=>{form.hidden=true;form.reset();});
      form.addEventListener('submit',async e=>{e.preventDefault();if(!currentUser){needAuth('Sign in before publishing a listing.');return;}const payload={seller_id:currentUser.id,title:$('#bloom-market-title').value.trim(),description:$('#bloom-market-description').value.trim(),price:Number($('#bloom-market-price').value),category:$('#bloom-market-category-new').value,item_condition:$('#bloom-market-condition').value,emoji:$('#bloom-market-emoji').value,currency:'MYR',status:'active'};if(!payload.title||!payload.description||!Number.isFinite(payload.price)||payload.price<0){say('Check the item name, description, and price.');return;}const {error}=await client.from('marketplace_listings').insert(payload);if(error){say('Could not publish listing: '+error.message);return;}form.reset();form.hidden=true;say('Your item is listed on BLOOM.');await loadMarketplaceListings();await loadMarketplaceInbox();});
      search.addEventListener('input',renderListings);filter.addEventListener('change',renderListings);
      window.bloomMarketplace={refresh:async()=>{await loadMarketplaceListings();await loadMarketplaceInbox();}};
      loadMarketplaceListings();loadMarketplaceInbox();
    }

    async function prepareSocialImage(file) {
      if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Choose a JPG, PNG, or WebP image under 8 MB.');
      const bitmap = await createImageBitmap(file), canvas = document.createElement('canvas'), context = canvas.getContext('2d');
      if (!context) { bitmap.close(); throw new Error('This browser cannot prepare the image.'); }
      try {
        const longest = Math.max(bitmap.width, bitmap.height);
        for (const preset of [{edge:1600,quality:0.84},{edge:1400,quality:0.76},{edge:1200,quality:0.68}]) {
          const scale = Math.min(1, preset.edge / longest);
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', preset.quality));
          if (blob && blob.size <= 4.7 * 1024 * 1024) return blob;
        }
        throw new Error('This photo is still too large after compression. Try a smaller image.');
      } finally { bitmap.close(); }
    }
    async function loadStories() {
      const holder = $('#bloom-live-stories'), status = $('#bloom-story-status');
      if (!currentUser) { holder.replaceChildren(); status.textContent = 'Sign in to share a story or see stories from the community.'; return; }
      status.textContent = 'Loading stories…'; holder.replaceChildren();
      const { data, error } = await client.from('stories').select('id,user_id,caption,media_path,created_at,expires_at').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(30);
      if (error) { status.textContent = 'Stories need the BLOOM social-features database setup. Please contact the site owner.'; return; }
      status.textContent = data?.length ? data.length + ' active story/stories · disappear after 24 hours' : 'No active stories yet. Share the first one!';
      const ids = [...new Set((data || []).map(story => story.user_id))];
      const profiles = ids.length ? await client.from('profiles').select('id,username').in('id', ids) : { data: [] };
      const names = new Map((profiles.data || []).map(profile => [profile.id, profile.username]));
      const visibleStories = await Promise.all((data || []).map(async story => {
        const remainingSeconds = Math.max(1, Math.floor((Date.parse(story.expires_at) - Date.now()) / 1000));
        const signed = story.media_path ? await client.storage.from('bloom-story-media').createSignedUrl(story.media_path, remainingSeconds) : { data: null, error: null };
        return { ...story, signedUrl: signed.data?.signedUrl || null };
      }));
      visibleStories.forEach(story => {
        if (!story.signedUrl) return;
        const card = document.createElement('article'); card.className = 'bloom-story-card';
        const image = document.createElement('img'); image.src = story.signedUrl; image.alt = 'Story from ' + (names.get(story.user_id) || 'a BLOOM fan'); image.loading = 'lazy'; image.decoding = 'async';
        const caption = document.createElement('p'); caption.textContent = story.caption || 'A little fandom moment ♡';
        const meta = document.createElement('small'); meta.textContent = '@' + (names.get(story.user_id) || 'fan') + (story.user_id === currentUser.id ? ' · You' : '');
        card.append(image, caption, meta); holder.append(card);
      });
    }
    async function loadNotifications() {
      const holder = $('#bloom-live-notifications'), status = $('#bloom-notification-status');
      if (!currentUser) { holder.replaceChildren(); status.textContent = 'Sign in to see likes, comments, and group activity.'; return; }
      status.textContent = 'Loading notifications…'; holder.replaceChildren();
      const { data, error } = await client.from('notifications').select('id,actor_id,kind,entity_id,body,created_at,read_at').order('created_at', { ascending: false }).limit(30);
      if (error) { status.textContent = 'Notifications need the BLOOM social-features database setup. Please try again later.'; return; }
      const rows = data || [], unread = rows.filter(row => !row.read_at).length;
      status.textContent = rows.length ? rows.length + ' recent notification(s) · ' + unread + ' unread' : 'You are all caught up. Likes, comments, and group messages will appear here.';
      const actors = [...new Set(rows.map(row => row.actor_id).filter(Boolean))];
      const profiles = actors.length ? await client.from('profiles').select('id,username').in('id', actors) : { data: [] };
      const names = new Map((profiles.data || []).map(profile => [profile.id, profile.username]));
      rows.forEach(row => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'bloom-notification' + (row.read_at ? '' : ' is-unread');
        const title = document.createElement('strong'); title.textContent = row.kind === 'like' ? '♡ Like' : row.kind === 'comment' ? '💬 Comment' : '✉ Group message';
        const body = document.createElement('span'); body.textContent = (row.actor_id ? '@' + (names.get(row.actor_id) || 'fan') + ' · ' : '') + row.body;
        const when = document.createElement('small'); when.textContent = new Date(row.created_at).toLocaleString();
        button.append(title, body, when);
        button.addEventListener('click', async () => {
          if (!row.read_at) {
            const { error: readError } = await client.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', row.id);
            if (readError) { status.textContent = 'Could not mark this notification as read.'; return; }
            row.read_at = new Date().toISOString(); button.classList.remove('is-unread');
            status.textContent = 'Notification marked as read.';
          }
          if (row.kind === 'group_message') $('#bloom-live-chat-title')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          else $('#activity')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        holder.append(button);
      });
    }
    $('#bloom-notifications-refresh').addEventListener('click', loadNotifications);
    $('#bloom-story-form').addEventListener('submit', async event => {
      event.preventDefault();
      if (!currentUser) { openAuth(); setAuthMessage('Sign in before sharing a story.'); return; }
      const input = $('#bloom-story-photo'), status = $('#bloom-story-status'), button = $('button[type="submit"]', event.currentTarget);
      const file = input.files?.[0]; if (!file) { status.textContent = 'Choose a photo first.'; return; }
      const original = button.textContent; button.disabled = true; button.textContent = 'Sharing…'; status.textContent = 'Preparing your photo…';
      let path = null;
      try {
        const blob = await prepareSocialImage(file);
        path = currentUser.id + '/story-' + crypto.randomUUID() + '.webp';
        const upload = await client.storage.from('bloom-story-media').upload(path, blob, { contentType: 'image/webp', upsert: false });
        if (upload.error) throw new Error('Photo upload failed. Please check your connection and try again.');
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const { error } = await client.from('stories').insert({ user_id: currentUser.id, caption: $('#bloom-story-caption').value.trim(), media_path: path, expires_at: expires });
        if (error) { await client.storage.from('bloom-story-media').remove([path]); path = null; throw new Error('Story could not be published. Please try again.'); }
        event.currentTarget.reset(); status.textContent = 'Your story is live and will expire in 24 hours.'; await loadStories();
      } catch (error) { status.textContent = error.message || 'Story could not be shared.'; }
      finally { button.disabled = false; button.textContent = original; }
    });
    async function refreshSocialRail() { await Promise.all([loadStories(), loadNotifications()]); }

    setupMarketplace();
    $('#bloom-social-rail')?.setAttribute('data-social-ready','true');


    const authButton = document.createElement('button');
    authButton.type = 'button';
    authButton.className = 'pill lavender bloom-auth-button';
    authButton.textContent = 'Sign in';
    const navActions = $('.nav-actions');
    if (navActions) navActions.prepend(authButton);

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'bloom-auth-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'bloom-auth-heading');
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-head"><h2 id="bloom-auth-heading">Your BLOOM account 🌸</h2><button class="modal-close" type="button" id="bloom-auth-close" aria-label="Close">×</button></div>
        <p class="bloom-inline-status">Use an email address you can access. Verification and password recovery are handled by Supabase Auth. Never share your password with anyone.</p>
        <form id="bloom-auth-form" class="bloom-modal-form">
          <label for="bloom-auth-mode">What would you like to do?</label><select id="bloom-auth-mode"><option value="signin">Sign in</option><option value="signup">Create account</option><option value="reset">Reset password</option></select>
          <div id="bloom-auth-profile-fields" hidden><label for="bloom-auth-username">Username</label><input id="bloom-auth-username" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" placeholder="3–24 letters, numbers or underscores"><label for="bloom-auth-display">Display name</label><input id="bloom-auth-display" maxlength="50" placeholder="What fans call you"></div>
          <label for="bloom-auth-email">Email</label><input id="bloom-auth-email" type="email" autocomplete="email" required placeholder="you@example.com">
          <div id="bloom-auth-password-wrap"><label for="bloom-auth-password">Password</label><input id="bloom-auth-password" type="password" minlength="10" autocomplete="current-password" placeholder="At least 10 characters"></div>
          <button class="pill primary" type="submit">Continue</button>
        </form>
        <form id="bloom-password-update-form" class="bloom-modal-form" hidden><label for="bloom-new-password">New password</label><input id="bloom-new-password" type="password" minlength="10" autocomplete="new-password" required placeholder="At least 10 characters"><button class="pill primary" type="submit">Update password</button></form>
        <div id="bloom-account-panel" hidden><p id="bloom-account-label"></p><form id="bloom-profile-form" class="bloom-modal-form"><label for="bloom-profile-display">Display name</label><input id="bloom-profile-display" maxlength="50" required><label><input id="bloom-profile-private" type="checkbox" style="width:auto;margin-right:8px">Make my profile private</label><button class="pill lavender" type="submit">Save privacy settings</button></form><button id="bloom-delete-account" class="pill white" type="button">Delete my account</button><button id="bloom-sign-out" class="pill white" type="button">Sign out</button></div>
        <p id="bloom-auth-message" class="bloom-auth-message" role="status" aria-live="polite"></p>
      </div>`;
    document.body.append(modal);
    const status = $('#bloom-live-status');
    const authForm = $('#bloom-auth-form');
    const authMode = $('#bloom-auth-mode');
    const profileFields = $('#bloom-auth-profile-fields');
    const passwordWrap = $('#bloom-auth-password-wrap');
    const authPassword = $('#bloom-auth-password');
    const accountPanel = $('#bloom-account-panel');
    const livePostList = $('#bloom-live-posts');
    const groupList = $('#bloom-live-groups');
    const messageList = $('#bloom-live-messages');
    const messageForm = $('#bloom-live-message-form');
    const messageInput = $('#bloom-live-message');
    const messageSend = $('button[type="submit"]', messageForm);
    const setAuthMessage = (m) => { $('#bloom-auth-message').textContent = m || ''; };
    const setLiveStatus = (m) => { if (status) status.textContent = m; };
    const openAuth = () => { modal.classList.add('open'); document.body.style.overflow = 'hidden'; setAuthMessage(''); };
    const closeAuth = () => { modal.classList.remove('open'); if (!$$('.modal-backdrop.open').length) document.body.style.overflow = ''; };
    authButton.addEventListener('click', openAuth);
    $('#bloom-auth-close').addEventListener('click', closeAuth);
    modal.addEventListener('click', e => { if (e.target === modal) closeAuth(); });
    authMode.addEventListener('change', () => {
      const mode = authMode.value;
      profileFields.hidden = mode !== 'signup';
      passwordWrap.hidden = mode === 'reset';
      authPassword.required = mode !== 'reset';
      authPassword.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    });
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const mode = authMode.value;
      const email = $('#bloom-auth-email').value.trim();
      const password = authPassword.value;
      try {
        setAuthMessage('Working securely…');
        if (mode === 'signup') {
          if (password.length < 10) throw new Error('Use a password with at least 10 characters.');
          const username = $('#bloom-auth-username').value.trim();
          if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) throw new Error('Username must be 3–24 letters, numbers or underscores.');
          const { error } = await client.auth.signUp({ email, password, options: { data: { username, display_name: $('#bloom-auth-display').value.trim() || username }, emailRedirectTo: location.href.split('#')[0] } });
          if (error) throw error;
          setAuthMessage('Check your inbox for a verification link. You may need to verify before signing in.');
        } else if (mode === 'signin') {
          const { error } = await client.auth.signInWithPassword({ email, password });
          if (error) throw error;
          setAuthMessage('Signed in successfully.');
        } else {
          const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
          if (error) throw error;
          setAuthMessage('If this address has an account, a password-reset email will be sent.');
        }
      } catch (err) { setAuthMessage(err.message || 'Could not complete that request.'); }
    });
    $('#bloom-password-update-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = $('#bloom-new-password').value;
      if (password.length < 10) { setAuthMessage('Use a password with at least 10 characters.'); return; }
      const { error } = await client.auth.updateUser({ password });
      if (error) setAuthMessage(error.message);
      else {
        passwordRecovery = false;
        $('#bloom-password-update-form').hidden = true;
        $('#bloom-new-password').value = '';
        // Recovery starts with the normal account panel hidden. Restore the UI after
        // changing the password instead of leaving the user on an empty auth screen.
        const { data: sessionData } = await client.auth.getSession();
        await syncSession(sessionData.session);
        setAuthMessage('Password updated. You can continue using BLOOM.');
      }
    });
    $('#bloom-sign-out').addEventListener('click', async () => { const { error } = await client.auth.signOut(); if (error) setAuthMessage(error.message); else setAuthMessage('Signed out.'); });
    $('#bloom-profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentUser) return;
      const { error } = await client.from('profiles').update({ display_name: $('#bloom-profile-display').value.trim(), is_private: $('#bloom-profile-private').checked }).eq('id', currentUser.id);
      setAuthMessage(error ? error.message : 'Profile and privacy settings saved.');
    });
    $('#bloom-delete-account').addEventListener('click', async () => {
      if (!currentUser || !window.confirm('Delete your BLOOM account and associated community data? This cannot be undone.')) return;
      const { error } = await client.functions.invoke('delete-account');
      if (error) setAuthMessage('Account deletion could not be completed. Contact the site owner for help: ' + error.message);
      else { await client.auth.signOut(); setAuthMessage('Account deletion requested.'); }
    });

    function renderPost(post, stats = {}) {
      const card = document.createElement('article');
      card.className = 'feed-card bloom-shared-post';
      card.dataset.postId = post.id;
      card.dataset.fandom = post.fandom || 'Multi-stan';
      const art = document.createElement('div'); art.className = 'feed-art'; art.textContent = '💗';
      if (post.media_url) { const image = document.createElement('img'); image.className = 'bloom-shared-photo'; image.src = post.media_url; image.alt = 'Photo shared in BLOOM post: ' + post.title; image.loading = 'lazy'; image.decoding = 'async'; art.replaceChildren(image); }
      const content = document.createElement('div'); content.className = 'feed-content';
      const meta = document.createElement('div'); meta.className = 'meta';
      meta.textContent = (post.fandom || 'Multi-stan') + ' · ' + new Date(post.created_at).toLocaleString() + ' · BLOOM LIVE';
      const title = document.createElement('h3'); title.textContent = post.title;
      const body = document.createElement('p'); body.textContent = post.body;
      content.append(meta, title, body);
      if (post.link) {
        const a = document.createElement('a'); a.href = post.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.className = 'shop-link'; a.textContent = 'Open shared link ↗'; content.append(a);
      }
      const actions = document.createElement('div'); actions.className = 'feed-actions';
      const like = document.createElement('button'); like.type = 'button'; like.className = 'small-action';
      like.dataset.liveAction = 'like'; like.setAttribute('aria-pressed', String(!!stats.liked_by_me));
      like.textContent = (stats.liked_by_me ? '♥ Liked' : '♡ Like') + ' · ' + Number(stats.like_count || 0);
      const comment = document.createElement('button'); comment.type = 'button'; comment.className = 'small-action';
      comment.dataset.liveAction = 'comment'; comment.textContent = '💬 Comment · ' + Number(stats.comment_count || 0);
      const share = document.createElement('button'); share.type = 'button'; share.className = 'small-action';
      share.dataset.liveAction = 'share'; share.textContent = '↗ Share';
      actions.append(like, comment, share);
      if (currentUser) {
        const report = document.createElement('button'); report.type = 'button'; report.className = 'small-action';
        report.textContent = '⚑ Report';
        report.addEventListener('click', async () => {
          const reason = window.prompt('What is the concern? Choose a short reason and do not include private information.');
          if (!reason || !reason.trim()) return;
          const { error } = await client.from('reports').insert({ reporter_id: currentUser.id, target_type: 'post', target_id: post.id, reason: reason.trim().slice(0,80) });
          if (error) window.alert('Report could not be sent. Confirm the reports table is configured in Supabase.');
          else window.alert('Thanks. Your report has been sent to the moderation queue.');
        });
        actions.append(report);
      }
      content.append(actions); card.append(art, content);
      return card;
    }

    let activeCommentPost = null;
    function ensureLiveCommentsModal() {
      if ($('#bloom-live-comments-modal')) return;
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop'; modal.id = 'bloom-live-comments-modal';
      modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'bloom-live-comments-title');
      modal.innerHTML = '<div class="modal"><div class="modal-head"><h2 id="bloom-live-comments-title">Comments 💬</h2><button class="modal-close" id="bloom-live-comments-close" type="button" aria-label="Close comments">×</button></div><p id="bloom-live-comments-status" class="bloom-inline-status" role="status"></p><div id="bloom-live-comments-list" class="bloom-live-posts" aria-live="polite"></div><form id="bloom-live-comment-form" class="bloom-modal-form"><label for="bloom-live-comment-input">Add a comment</label><textarea id="bloom-live-comment-input" rows="3" maxlength="500" required placeholder="Keep it kind and fandom-friendly."></textarea><button class="pill primary" type="submit">Post comment</button></form></div>';
      document.body.append(modal);
      $('#bloom-live-comments-close').addEventListener('click', () => closeModal(modal.id));
      modal.addEventListener('click', event => { if (event.target === modal) closeModal(modal.id); });
      $('#bloom-live-comment-form').addEventListener('submit', async event => {
        event.preventDefault();
        if (!currentUser) { openAuth(); setAuthMessage('Sign in before posting a shared comment.'); return; }
        if (!activeCommentPost) return;
        const input = $('#bloom-live-comment-input'), body = input.value.trim();
        if (!body) return;
        const { error } = await client.from('post_comments').insert({ post_id: activeCommentPost.id, author_id: currentUser.id, body });
        if (error) {
          $('#bloom-live-comments-status').textContent = 'Comment could not be saved. Check that supabase/feed-engagement.sql has been run.';
          return;
        }
        input.value = '';
        await loadLiveComments(activeCommentPost);
        await loadPosts();
      });
    }
    async function loadLiveComments(post) {
      const holder = $('#bloom-live-comments-list');
      const status = $('#bloom-live-comments-status');
      holder.replaceChildren();
      status.textContent = 'Loading comments…';
      const { data, error } = await client.from('post_comments')
        .select('id,author_id,body,created_at')
        .eq('post_id', post.id).eq('status', 'published')
        .order('created_at', { ascending: true }).limit(100);
      if (error) {
        status.textContent = 'Shared comments need the feed-engagement SQL migration in Supabase.';
        return;
      }
      status.textContent = data?.length ? data.length + ' shared comment(s)' : 'No comments yet. Start the conversation!';
      (data || []).forEach(comment => {
        const item = document.createElement('article'); item.className = 'bloom-live-post';
        const author = document.createElement('small'); author.textContent = comment.author_id === currentUser?.id ? 'You' : 'Fan';
        const body = document.createElement('p'); body.textContent = comment.body;
        const when = document.createElement('small'); when.textContent = new Date(comment.created_at).toLocaleString();
        item.append(author, body, when); holder.append(item);
      });
    }
    async function openLiveComments(post) {
      activeCommentPost = post;
      ensureLiveCommentsModal();
      $('#bloom-live-comments-title').textContent = 'Comments · ' + post.title;
      openModal('bloom-live-comments-modal');
      await loadLiveComments(post);
    }

    async function loadPosts() {
      const grid = $('#activity .feed-grid');
      $$('.bloom-shared-post', grid || document).forEach(card => card.remove());
      const { data, error } = await client.from('posts').select('id,author_id,title,body,fandom,link,media_url,created_at,status').eq('status','published').order('created_at',{ascending:false}).limit(50);
      livePostList.replaceChildren();
      if (error) { livePostList.textContent = 'Could not load shared posts. Check the Supabase posts table and row-level security policies.'; return; }
      if (!data?.length) { livePostList.textContent = 'No shared posts yet. Publish one to have it appear in the FYP below.'; return; }
      livePostList.textContent = data.length + ' shared post(s) are shown in the FYP below.';
      let statsById = new Map();
      try {
        const { data: engagement, error: engagementError } = await client.rpc('bloom_post_engagement', { target_post_ids: data.map(post => post.id) });
        if (!engagementError && engagement) statsById = new Map(engagement.map(item => [item.post_id, item]));
      } catch (_) {}
      if (grid) grid.prepend(...data.map(post => renderPost(post, statsById.get(post.id) || {})));
      document.dispatchEvent(new CustomEvent('bloom:feed-updated'));
    }

    activity.addEventListener('click', async event => {
      const button = event.target.closest('button[data-live-action]');
      if (!button) return;
      const card = button.closest('.bloom-shared-post');
      if (!card) return;
      const postId = card.dataset.postId;
      if (button.dataset.liveAction === 'comment') {
        const title = $('h3', card)?.textContent || 'Fan post';
        await openLiveComments({ id: postId, title });
        return;
      }
      if (button.dataset.liveAction === 'share') {
        const title = $('h3', card)?.textContent || 'BLOOM fan post';
        const body = $('p', card)?.textContent || 'Check out this fan post on BLOOM.';
        const url = location.origin + location.pathname + '#activity';
        try {
          if (navigator.share) await navigator.share({ title: 'BLOOM · ' + title, text: body, url });
          else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); note('BLOOM feed link copied.'); }
          else window.prompt('Copy this BLOOM link:', url);
        } catch (error) { if (error?.name !== 'AbortError') note('Could not share automatically. Copy the page link from your browser.'); }
        return;
      }
      if (button.dataset.liveAction === 'like') {
        if (!currentUser) { openAuth(); setAuthMessage('Sign in to like shared posts.'); return; }
        button.disabled = true;
        const { data: existing, error: readError } = await client.from('post_likes')
          .select('post_id').eq('post_id', postId).eq('user_id', currentUser.id).maybeSingle();
        if (readError) {
          button.disabled = false;
          note('Shared likes need the feed-engagement SQL migration in Supabase.');
          return;
        }
        const result = existing
          ? await client.from('post_likes').delete().eq('post_id', postId).eq('user_id', currentUser.id)
          : await client.from('post_likes').insert({ post_id: postId, user_id: currentUser.id });
        if (result.error) note('Like could not be saved. Check the feed-engagement SQL migration and policies.');
        await loadPosts();
      }
    });
    $('#bloom-live-post-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentUser) { openAuth(); setAuthMessage('Sign in before publishing a shared post.'); return; }
      const title = $('#bloom-live-title').value.trim(), body = $('#bloom-live-body').value.trim(), fandom = $('#bloom-live-fandom').value.trim() || 'Multi-stan', link = $('#bloom-live-link').value.trim();
      if (!title || !body) return;
      if (link && !/^https?:\/\//i.test(link)) { window.alert('Please use an http or https link.'); return; }
      const { error } = await client.from('posts').insert({ author_id: currentUser.id, title, body, fandom, link: link || null });
      if (error) window.alert('Post could not be published: ' + error.message);
      else { e.target.reset(); await loadPosts(); }
    });
    // Shared publisher used by the main FYP composer, including sanitized image uploads.
    window.bloomPublishPost = async ({ title, body, fandom, link, mediaBlob }) => {
      if (!currentUser) { openAuth(); setAuthMessage('Sign in before publishing to the shared BLOOM FYP.'); return { ok: false, auth: true }; }
      let mediaUrl = null, uploadedPath = null;
      if (mediaBlob) {
        uploadedPath = currentUser.id + '/post-' + crypto.randomUUID() + '.webp';
        const upload = await client.storage.from('bloom-post-media').upload(uploadedPath, mediaBlob, { contentType: 'image/webp', upsert: false });
        if (upload.error) { setLiveStatus('Photo upload failed. Check that BLOOM media storage is configured and try again.'); return { ok: false, error: upload.error }; }
        mediaUrl = client.storage.from('bloom-post-media').getPublicUrl(uploadedPath).data.publicUrl;
      }
      const { error } = await client.from('posts').insert({ author_id: currentUser.id, title, body, fandom: fandom || 'Multi-stan', link: link || null, media_url: mediaUrl });
      if (error) {
        if (uploadedPath) await client.storage.from('bloom-post-media').remove([uploadedPath]);
        setLiveStatus('Post could not be published: ' + error.message);
        return { ok: false, error };
      }
      await loadPosts();
      await loadNotifications();
      return { ok: true };
    };

    async function loadGroups() {
      const { data, error } = await client.from('groups').select('id,name,owner_id,is_public,created_at').order('created_at',{ascending:false}).limit(40);
      if (error) { groupList.textContent = 'Could not load groups: ' + error.message; return; }
      knownGroups = data || []; groupList.replaceChildren();
      if (!knownGroups.length) { groupList.textContent = 'No groups yet. Create the first fan group.'; return; }
      knownGroups.forEach(g => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'bloom-group-choice' + (activeGroup?.id === g.id ? ' active' : ''); b.textContent = g.name + (g.is_public ? ' · Public' : ' · Private');
        b.addEventListener('click', () => selectGroup(g)); groupList.append(b);
      });
    }
    async function selectGroup(group) {
      if (!currentUser) { openAuth(); setAuthMessage('Sign in to join groups and use shared chat.'); return; }
      activeGroup = group;
      if (messageChannel) { await client.removeChannel(messageChannel); messageChannel = null; }
      $('#bloom-live-chat-title').textContent = group.name;
      messageList.replaceChildren();
      const { data: membership, error: memberError } = await client.from('group_members').select('group_id').eq('group_id',group.id).eq('user_id',currentUser.id).maybeSingle();
      if (memberError) { $('#bloom-live-chat-note').textContent = memberError.message; return; }
      if (!membership) {
        $('#bloom-live-chat-note').textContent = group.is_public ? 'Join this public group to read and send messages.' : 'This is a private group. Ask its owner for an invitation.';
        const join = document.createElement('button'); join.type = 'button'; join.className = 'pill lavender'; join.textContent = 'Join group';
        join.disabled = !group.is_public && group.owner_id !== currentUser.id;
        join.addEventListener('click', async () => {
          const { error } = await client.from('group_members').insert({ group_id: group.id, user_id: currentUser.id });
          if (error) $('#bloom-live-chat-note').textContent = error.message;
          else { await loadGroups(); await selectGroup(group); }
        });
        $('#bloom-live-chat-note').replaceChildren(document.createTextNode($('#bloom-live-chat-note').textContent+' '),join);
        messageInput.disabled = true; messageSend.disabled = true; return;
      }
      $('#bloom-live-chat-note').textContent = 'Live group chat · be kind, block/report concerns, and never post private contact details.';
      messageInput.disabled = false; messageSend.disabled = false;
      await loadMessages(group.id);
      messageChannel = client.channel('bloom-group-'+group.id).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:'group_id=eq.'+group.id},payload => {
        if (payload.new) { appendMessage(payload.new); void loadNotifications(); }
      }).subscribe();
    }
    function appendMessage(msg) {
      if ($('[data-message-id="'+msg.id+'"]', messageList)) return;
      const item = document.createElement('div'); item.className = 'bloom-live-message';
      item.dataset.messageId = msg.id;
      const author = document.createElement('small'); author.textContent = msg.author_id === currentUser?.id ? 'You' : 'Fan';
      const body = document.createElement('p'); body.textContent = msg.body;
      const when = document.createElement('time'); when.dateTime = msg.created_at; when.textContent = new Date(msg.created_at).toLocaleTimeString();
      item.append(author, body, when); messageList.append(item); messageList.scrollTop = messageList.scrollHeight;
    }
    async function loadMessages(groupId) {
      const { data, error } = await client.from('messages').select('id,group_id,author_id,body,created_at').eq('group_id',groupId).order('created_at',{ascending:true}).limit(100);
      messageList.replaceChildren();
      if (error) { messageList.textContent = 'Could not load messages: ' + error.message; return; }
      (data || []).forEach(appendMessage);
    }
    $('#bloom-live-message-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentUser || !activeGroup) return;
      const body = messageInput.value.trim(); if (!body) return;
      const { error } = await client.from('messages').insert({ group_id: activeGroup.id, author_id: currentUser.id, body });
      if (error) window.alert('Message could not be sent: ' + error.message);
      else { messageInput.value = ''; }
    });
    $('#bloom-live-group-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentUser) { openAuth(); setAuthMessage('Sign in before creating a group.'); return; }
      const name = $('#bloom-live-group-name').value.trim(); if (!name) return;
      const { data, error } = await client.from('groups').insert({ name, owner_id: currentUser.id, is_public: true }).select().single();
      if (error) window.alert('Group could not be created: ' + error.message);
      else { e.target.reset(); await loadGroups(); await selectGroup(data); }
    });

    async function loadProfile() {
      if (!currentUser) return;
      const { data, error } = await client.from('profiles').select('username,display_name,is_private').eq('id',currentUser.id).single();
      if (error) { setAuthMessage('Profile could not be loaded: ' + error.message); return; }
      $('#bloom-account-label').textContent = '@' + data.username + ' · ' + currentUser.email;
      $('#bloom-profile-display').value = data.display_name || '';
      $('#bloom-profile-private').checked = !!data.is_private;
      $('#bloom-auth-form').hidden = true; accountPanel.hidden = false;
      isModerator = currentUser.app_metadata?.role === 'moderator';
      $('#bloom-live-moderation').hidden = !isModerator;
      if (isModerator) await loadReports();
    }
    async function loadReports() {
      const holder = $('#bloom-live-reports'); holder.replaceChildren();
      const { data, error } = await client.from('reports').select('id,target_type,target_id,reason,created_at,status').eq('status','open').order('created_at',{ascending:true}).limit(50);
      if (error) { holder.textContent = error.message; return; }
      if (!data?.length) { holder.textContent = 'No open reports.'; return; }
      data.forEach(report => {
        const row = document.createElement('div'); row.className = 'bloom-report-row';
        const desc = document.createElement('p'); desc.textContent = report.target_type + ' · ' + report.reason + ' · ' + report.target_id;
        const done = document.createElement('button'); done.type = 'button'; done.className = 'small-action'; done.textContent = 'Resolve report';
        done.addEventListener('click', async () => { const { error: err } = await client.from('reports').update({status:'resolved',reviewed_by:currentUser.id}).eq('id',report.id); if (err) window.alert(err.message); else await loadReports(); });
        if (report.target_type === 'post') {
          const hide = document.createElement('button'); hide.type = 'button'; hide.className = 'small-action'; hide.textContent = 'Hide post';
          hide.addEventListener('click', async () => { const { error: err } = await client.from('posts').update({status:'hidden'}).eq('id',report.target_id); if (err) window.alert(err.message); else { await loadPosts(); await loadReports(); } });
          row.append(desc,hide,done);
        } else row.append(desc,done);
        holder.append(row);
      });
    }
    async function syncSession(session) {
      currentUser = session?.user || null;
      if (passwordRecovery) { authButton.textContent = 'Finish password reset'; openAuth(); authForm.hidden = true; accountPanel.hidden = true; $('#bloom-password-update-form').hidden = false; setLiveStatus('Password reset in progress.'); return; }
      authButton.textContent = currentUser ? 'My account' : 'Sign in';
      authForm.hidden = !!currentUser;
      accountPanel.hidden = !currentUser;
      if (currentUser) {
        await loadProfile();
        setLiveStatus('Signed in · shared posts and group chat enabled.');
      } else {
        $('#bloom-auth-form').hidden = false;
        $('#bloom-account-panel').hidden = true;
        $('#bloom-live-moderation').hidden = true;
        setLiveStatus('Backend connected · sign in to publish, join groups, and chat.');
        if (messageChannel) { await client.removeChannel(messageChannel); messageChannel = null; }
        activeGroup = null;
        messageInput.disabled = true; messageSend.disabled = true;
        $('#bloom-live-chat-title').textContent = 'Choose a group';
        $('#bloom-live-chat-note').textContent = 'Sign in and join a public group to chat.';
        messageList.replaceChildren();
      }
      await loadPosts();
      await loadGroups();
      await refreshSocialRail();
      if (window.bloomMarketplace?.refresh) await window.bloomMarketplace.refresh();
    }
    client.auth.onAuthStateChange((event, session) => { if (event === 'PASSWORD_RECOVERY') passwordRecovery = true; setTimeout(() => { void syncSession(session); }, 0); });
    client.auth.getSession().then(({ data }) => syncSession(data.session)).catch((error) => { setLiveStatus('Could not restore your session. Refresh and try again.'); console.error('BLOOM session restore failed:', error); });
  }
})();
