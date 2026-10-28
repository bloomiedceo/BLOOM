(function () {
  'use strict';

  const cfg = window.BLOOM_SUPABASE_CONFIG || {};
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const categories = [
    {key:'creative', label:'Art & design', emoji:'🎨'},
    {key:'gaming', label:'Gaming', emoji:'🎮'},
    {key:'lifestyle', label:'Everyday life', emoji:'🌱'},
    {key:'food', label:'Food & drink', emoji:'🍜'},
    {key:'outdoors', label:'Outdoors & wellbeing', emoji:'🥾'},
    {key:'music', label:'Music', emoji:'🎧'},
    {key:'fandom', label:'K-pop & fandom', emoji:'✿'},
    {key:'books', label:'Books & learning', emoji:'📚'},
    {key:'tech', label:'Tech & making', emoji:'💡'}
  ];
  const interestAliases = {
    'art':'creative','art and design':'creative','art & design':'creative','design':'creative','drawing':'creative','crafts':'creative',
    'gaming':'gaming','games':'gaming','esports':'gaming',
    'lifestyle':'lifestyle','everyday life':'lifestyle','everyday living':'lifestyle','home':'lifestyle',
    'food':'food','food and drink':'food','food & drink':'food','cooking':'food','recipes':'food',
    'outdoors':'outdoors','nature':'outdoors','travel':'outdoors','wellbeing':'outdoors','outdoors and wellbeing':'outdoors','outdoors & wellbeing':'outdoors',
    'music':'music','music and fandom':'music','music & fandom':'music','dance':'music',
    'fandom':'fandom','k-pop':'fandom','kpop':'fandom','multi-stan':'fandom',
    'books':'books','reading':'books','books and learning':'books','books & learning':'books',
    'tech':'tech','technology':'tech','coding':'tech','tech and making':'tech','tech & making':'tech'
  };
  const categoryNames = Object.fromEntries(categories.map((item) => [item.key, item.label]));
  let client = null;
  let currentUser = null;
  let currentProfile = null;
  let activeInterest = 'mix';
  let liveGroups = [];
  let activeLiveGroup = null;
  let realtimeChannel = null;
  let pendingListing = null;
  let notifications = [];
  let stories = [];
  let livePosts = [];
  let likedPostIds = new Set();
  let busy = false;

  function normalizeInterest(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (interestAliases[raw]) return interestAliases[raw];
    if (raw.includes('game')) return 'gaming';
    if (raw.includes('food') || raw.includes('cook') || raw.includes('recipe')) return 'food';
    if (raw.includes('book') || raw.includes('read') || raw.includes('learn')) return 'books';
    if (raw.includes('tech') || raw.includes('code') || raw.includes('make')) return 'tech';
    if (raw.includes('outdoor') || raw.includes('travel') || raw.includes('nature') || raw.includes('hike')) return 'outdoors';
    if (raw.includes('art') || raw.includes('design') || raw.includes('draw') || raw.includes('craft')) return 'creative';
    if (raw.includes('k-pop') || raw.includes('kpop') || raw.includes('fandom') || raw.includes('fan')) return 'fandom';
    if (raw.includes('music') || raw.includes('dance') || raw.includes('song')) return 'music';
    if (raw.includes('life') || raw.includes('home') || raw.includes('wellbeing')) return 'lifestyle';
    return 'other';
  }

  function toast(message) {
    if (typeof window.showToast === 'function') window.showToast(message);
    else console.info('[BLOOM]', message);
  }

  function setLiveStatus(message) {
    const status = $('#bloom-live-status');
    if (status) status.textContent = message;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function button(label, className, action) {
    const node = el('button', className || '', label);
    node.type = 'button';
    if (action) node.addEventListener('click', action);
    return node;
  }

  function statusMessage(holder, message) {
    if (!holder) return;
    holder.textContent = message;
  }

  const phoneInner = $('.phone-inner');
  if (!phoneInner) return;

  const featureOverlay = el('div', 'bloom-feature-overlay');
  featureOverlay.id = 'bloomFeatureOverlay';
  featureOverlay.setAttribute('aria-hidden', 'true');
  const featureSheet = el('section', 'bloom-feature-sheet');
  featureSheet.setAttribute('role', 'dialog');
  featureSheet.setAttribute('aria-modal', 'true');
  featureSheet.setAttribute('aria-labelledby', 'bloomSheetTitle');
  const sheetHead = el('div', 'bloom-sheet-head');
  const sheetHeadCopy = el('div');
  const sheetTitle = el('h2', '', 'A little BLOOM moment');
  sheetTitle.id = 'bloomSheetTitle';
  const sheetSubtitle = el('p', '', '');
  sheetSubtitle.id = 'bloomSheetSubtitle';
  sheetHeadCopy.append(sheetTitle, sheetSubtitle);
  const sheetClose = button('×', 'bloom-sheet-close', closeSheet);
  sheetClose.setAttribute('aria-label', 'Close panel');
  sheetHead.append(sheetHeadCopy, sheetClose);
  const sheetBody = el('div');
  sheetBody.id = 'bloomSheetBody';
  const sheetStatus = el('p', 'bloom-overlay-status');
  sheetStatus.id = 'bloomSheetStatus';
  sheetStatus.setAttribute('role', 'status');
  sheetStatus.setAttribute('aria-live', 'polite');
  featureSheet.append(sheetHead, sheetBody, sheetStatus);
  featureOverlay.append(featureSheet);
  phoneInner.append(featureOverlay);

  function openSheet(title, subtitle, status) {
    sheetTitle.textContent = title;
    sheetSubtitle.textContent = subtitle || '';
    sheetBody.replaceChildren();
    sheetStatus.textContent = status || '';
    featureOverlay.classList.add('open');
    featureOverlay.setAttribute('aria-hidden', 'false');
    document.body.dataset.bloomSheetOpen = 'true';
  }

  function closeSheet() {
    featureOverlay.classList.remove('open');
    featureOverlay.setAttribute('aria-hidden', 'true');
    delete document.body.dataset.bloomSheetOpen;
  }

  featureOverlay.addEventListener('click', (event) => {
    if (event.target === featureOverlay) closeSheet();
  });
  featureSheet.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && featureOverlay.classList.contains('open')) closeSheet();
  });

  function signedIn() {
    if (!client) {
      toast('Live accounts are not available in preview mode. The sample interactions still work.');
      return false;
    }
    if (!currentUser) {
      openBloomAccount();
      setSheetStatus('Sign in or create a BLOOM account to use this feature.');
      return false;
    }
    return true;
  }

  function setSheetStatus(message) {
    sheetStatus.textContent = message || '';
  }

  function readLocalInterests() {
    try {
      const values = JSON.parse(localStorage.getItem('bloom-interest-preferences-v1') || '[]');
      return Array.isArray(values) ? values.filter((value) => categories.some((item) => item.key === value)) : [];
    } catch (_) {
      return [];
    }
  }

  function writeLocalInterests(values, enabled) {
    try {
      localStorage.setItem('bloom-interest-preferences-v1', JSON.stringify(values));
      localStorage.setItem('bloom-interest-mix-enabled-v1', String(Boolean(enabled && values.length)));
    } catch (_) {}
  }

  function activeInterestFilter(key) {
    activeInterest = key || 'mix';
    $('#bloom-feed-interest-filter [data-feed-interest]').forEach((node) => {
      node.classList.toggle('is-active', node.dataset.feedInterest === activeInterest);
      node.setAttribute('aria-pressed', String(node.dataset.feedInterest === activeInterest));
    });
    let mix = [];
    if (Array.isArray(currentProfile?.interests) && currentProfile.interests.length) mix = currentProfile.interests;
    else mix = readLocalInterests();
    $('#feed .feed-post').forEach((post) => {
      const actual = normalizeInterest(post.dataset.interest || post.dataset.fandom || '');
      if (activeInterest === 'all') {
        post.hidden = false;
      } else if (activeInterest === 'mix') {
        post.hidden = mix.length > 0 && !mix.includes(actual);
      } else {
        post.hidden = actual !== activeInterest;
      }
    });
  }

  $$('#bloom-feed-interest-filter [data-feed-interest]').forEach((node) => {
    node.addEventListener('click', () => activeInterestFilter(node.dataset.feedInterest));
  });

  function buildProfileInterests(values) {
    const holder = $('#bloom-profile-interest-chips');
    if (!holder) return;
    holder.replaceChildren();
    if (!values.length) {
      holder.append(el('span', 'bloom-small-muted', 'Pick interests in profile settings to make My Mix yours.'));
      return;
    }
    values.forEach((key) => {
      const item = categories.find((entry) => entry.key === key);
      if (item) holder.append(el('span', '', item.emoji + ' ' + item.label));
    });
  }

  function interestCheckboxes(values) {
    const grid = el('div', 'bloom-checkgrid');
    categories.forEach((item) => {
      const label = el('label');
      const input = el('input');
      input.type = 'checkbox';
      input.name = 'bloom-profile-interest';
      input.value = item.key;
      input.checked = values.includes(item.key);
      label.append(input, document.createTextNode(item.emoji + ' ' + item.label));
      grid.append(label);
    });
    return grid;
  }

  function renderAuthSheet() {
    openSheet('Your BLOOM account ✿', 'A little home for your interests, posts, and people.');
    const tabs = el('div', 'bloom-form-row');
    tabs.append(
      button('Sign in', 'bloom-form-secondary', () => showAuthMode('signin')),
      button('Create account', 'bloom-form-secondary', () => showAuthMode('signup'))
    );
    const form = el('form', 'bloom-live-form');
    form.id = 'bloomAccountForm';
    form.noValidate = true;
    const mode = el('input');
    mode.type = 'hidden';
    mode.name = 'mode';
    mode.value = 'signin';
    const emailLabel = el('label', '', 'Email address');
    const email = el('input');
    email.type = 'email'; email.name = 'email'; email.required = true; email.autocomplete = 'email'; email.placeholder = 'you@example.com';
    emailLabel.append(email);
    const passwordLabel = el('label', '', 'Password');
    const password = el('input');
    password.type = 'password'; password.name = 'password'; password.minLength = 10; password.autocomplete = 'current-password'; password.placeholder = 'At least 10 characters';
    passwordLabel.append(password);
    const usernameLabel = el('label', '', 'Choose a username (3–24 characters)');
    const username = el('input');
    username.name = 'username'; username.maxLength = 24; username.pattern = '[A-Za-z0-9_]{3,24}'; username.placeholder = 'your_garden_name';
    usernameLabel.append(username);
    const displayLabel = el('label', '', 'Display name');
    const display = el('input');
    display.name = 'display_name'; display.maxLength = 50; display.placeholder = 'What people call you';
    displayLabel.append(display);
    const submit = el('button', 'bloom-form-primary', 'Sign in');
    submit.type = 'submit';
    const reset = button('Send password reset email', 'bloom-form-secondary', async () => {
      if (!client || !email.value.trim()) { setSheetStatus('Enter your email address first.'); return; }
      const { error } = await client.auth.resetPasswordForEmail(email.value.trim(), {redirectTo: location.href.split('#')[0]});
      setSheetStatus(error ? error.message : 'If the address has an account, a reset email will be sent.');
    });
    const explain = el('p', 'bloom-small-muted', 'Use an email address you can access. We never ask you to share your password with anyone.');
    function applyMode(next) {
      mode.value = next;
      const isSignup = next === 'signup';
      usernameLabel.hidden = !isSignup;
      displayLabel.hidden = !isSignup;
      passwordLabel.hidden = next === 'reset';
      password.required = next !== 'reset';
      submit.textContent = next === 'signup' ? 'Create my account' : next === 'reset' ? 'Request reset' : 'Sign in';
      reset.hidden = next === 'reset';
      setSheetStatus('');
    }
    form.append(mode, emailLabel, passwordLabel, usernameLabel, displayLabel, submit);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!client) { setSheetStatus('Supabase is not configured. Preview interactions are available, but account features need the backend.'); return; }
      if (!email.value.trim()) { setSheetStatus('Please enter your email address.'); return; }
      if (mode.value !== 'reset' && password.value.length < 10) { setSheetStatus('Use a password with at least 10 characters.'); return; }
      submit.disabled = true;
      const original = submit.textContent;
      submit.textContent = 'Working…';
      try {
        if (mode.value === 'signup') {
          if (!/^[A-Za-z0-9_]{3,24}$/.test(username.value.trim())) throw new Error('Username must be 3–24 letters, numbers, or underscores.');
          const { error } = await client.auth.signUp({
            email: email.value.trim(),
            password: password.value,
            options: {
              data: {username: username.value.trim(), display_name: display.value.trim() || username.value.trim()},
              emailRedirectTo: location.href.split('#')[0]
            }
          });
          if (error) throw error;
          setSheetStatus('Account created. Check your inbox for a verification link, then sign in.');
        } else if (mode.value === 'reset') {
          const { error } = await client.auth.resetPasswordForEmail(email.value.trim(), {redirectTo: location.href.split('#')[0]});
          if (error) throw error;
          setSheetStatus('If the address has an account, a password reset email will be sent.');
        } else {
          const { error } = await client.auth.signInWithPassword({email: email.value.trim(), password: password.value});
          if (error) throw error;
          await syncSession();
          setSheetStatus('Welcome back to BLOOM ✿');
          window.setTimeout(closeSheet, 450);
        }
      } catch (error) {
        setSheetStatus(error.message || 'That action could not be completed. Please try again.');
      } finally {
        submit.disabled = false;
        submit.textContent = original;
      }
    });
    function showAuthMode(next) { applyMode(next); }
    tabs.children[0].addEventListener('click', () => applyMode('signin'));
    tabs.children[1].addEventListener('click', () => applyMode('signup'));
    form.append(reset, explain);
    sheetBody.append(tabs, form);
    applyMode('signin');
  }

  function renderAccountSettings() {
    if (!currentUser) return renderAuthSheet();
    openSheet('Your Garden Grid ✿', 'Manage your profile, privacy, and saved interests.');
    const form = el('form', 'bloom-live-form');
    form.id = 'bloomProfileSettingsForm';
    const username = currentProfile?.username || currentUser.email || 'BLOOM member';
    const emailLine = el('p', 'bloom-small-muted', '@' + username + ' · ' + currentUser.email);
    const displayLabel = el('label', '', 'Display name');
    const display = el('input');
    display.name = 'display_name'; display.maxLength = 50; display.required = true; display.value = currentProfile?.display_name || '';
    displayLabel.append(display);
    const bioLabel = el('label', '', 'Your bio');
    const bio = el('textarea');
    bio.name = 'bio'; bio.maxLength = 240; bio.value = currentProfile?.bio || ''; bio.placeholder = 'A few words about your little corner…';
    bioLabel.append(bio);
    const privateLabel = el('label');
    const privateInput = el('input');
    privateInput.type = 'checkbox'; privateInput.name = 'is_private'; privateInput.checked = Boolean(currentProfile?.is_private);
    privateLabel.append(privateInput, document.createTextNode(' Make my profile private'));
    const interestsLabel = el('label', '', 'Your interests · used by My Mix');
    const selected = (Array.isArray(currentProfile?.interests) && currentProfile.interests.length) ? currentProfile.interests : readLocalInterests();
    const checks = interestCheckboxes(selected);
    interestsLabel.append(checks);
    const note = el('p', 'bloom-small-muted', 'Interests can be visible with a public profile. Your private profile limits visibility through the database policies.');
    const save = el('button', 'bloom-form-primary', 'Save profile & interests');
    save.type = 'submit';
    form.append(emailLine, displayLabel, bioLabel, privateLabel, interestsLabel, note, save);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!currentUser || busy) return;
      const interests = $$('input[name="bloom-profile-interest"]:checked', form).map((input) => input.value);
      busy = true; save.disabled = true; save.textContent = 'Saving…';
      const {error} = await client.from('profiles').update({
        display_name: display.value.trim(),
        bio: bio.value.trim(),
        is_private: privateInput.checked,
        interests: interests
      }).eq('id', currentUser.id);
      if (error) {
        setSheetStatus('Could not save profile: ' + error.message);
      } else {
        currentProfile = Object.assign({}, currentProfile, {display_name:display.value.trim(),bio:bio.value.trim(),is_private:privateInput.checked,interests:interests});
        writeLocalInterests(interests, interests.length > 0);
        buildProfileInterests(interests);
        activeInterestFilter('mix');
        await refreshAccountSurface();
        setSheetStatus('Your profile and interests are saved ✿');
        toast('Your BLOOM profile has bloomed.');
      }
      busy = false; save.disabled = false; save.textContent = 'Save profile & interests';
    });
    const actions = el('div', 'bloom-form-row');
    const signOut = button('Sign out', 'bloom-form-secondary', async () => {
      const {error} = await client.auth.signOut();
      if (error) setSheetStatus(error.message);
      else { closeSheet(); toast('You have signed out.'); }
    });
    const deleteButton = button('Delete account', 'bloom-form-secondary', async () => {
      if (!window.confirm('Delete your BLOOM account and associated community data? This cannot be undone.')) return;
      const {error} = await client.functions.invoke('delete-account');
      if (error) setSheetStatus('Account deletion could not be completed: ' + error.message);
      else { await client.auth.signOut(); closeSheet(); toast('Account deletion request completed.'); }
    });
    actions.append(signOut, deleteButton);
    sheetBody.append(form, actions);
  }

  window.openBloomAccount = renderAccountSettings;

  async function loadOwnProfile() {
    if (!client || !currentUser) { currentProfile = null; buildProfileInterests(readLocalInterests()); return; }
    const {data, error} = await client.from('profiles').select('id,username,display_name,bio,is_private,interests').eq('id', currentUser.id).maybeSingle();
    if (error) { setLiveStatus('Signed in, but profile could not load. Check the profile table and policies.'); return; }
    currentProfile = data || null;
    if (currentProfile) {
      const values = Array.isArray(currentProfile.interests) ? currentProfile.interests : [];
      buildProfileInterests(values.length ? values : readLocalInterests());
      activeInterestFilter('mix');
      const headerName = $('.profile-top h2');
      const headerBio = $('.profile-top .text-xs.font-bold.mt-4');
      const headerBioCopy = headerBio?.nextElementSibling;
      if (headerName) headerName.textContent = currentProfile.username || 'your garden';
      if (headerBio) headerBio.textContent = currentProfile.display_name || currentProfile.username || 'Your little corner';
      if (headerBioCopy) headerBioCopy.textContent = currentProfile.bio || 'Growing a little world of interests. ✿';
    }
  }

  async function syncSession() {
    if (!client) return;
    const {data} = await client.auth.getSession();
    const nextUser = data?.session?.user || null;
    const changed = (currentUser?.id || null) !== (nextUser?.id || null);
    currentUser = nextUser;
    if (currentUser) {
      await loadOwnProfile();
      setLiveStatus('Connected · signed in as @' + (currentProfile?.username || 'gardener'));
      await Promise.all([loadPosts(), loadGroups(), loadStories(), loadNotifications(), loadMarketplace()]);
    } else {
      currentProfile = null;
      buildProfileInterests(readLocalInterests());
      activeInterestFilter('mix');
      setLiveStatus('Connected · sign in to publish, join live circles, and save your interests.');
      if (changed) {
        activeLiveGroup = null;
        if (realtimeChannel) { try { await client.removeChannel(realtimeChannel); } catch (_) {} realtimeChannel = null; }
      }
      await Promise.all([loadPosts(), loadGroups(), loadStories(), loadMarketplace()]);
    }
  }

  function addActionButton(label, count, action, extraClass) {
    const btn = el('button', 'action-button ' + (extraClass || ''), '');
    btn.type = 'button';
    btn.dataset.liveAction = action;
    const bubble = el('span', 'bubble', label);
    const counter = el('span', 'live-action-count', count || '');
    btn.append(bubble, counter);
    return btn;
  }

  function renderLivePost(post, stats, author) {
    const article = el('article', 'feed-post bloom-shared-post');
    article.dataset.livePostId = post.id;
    article.dataset.interest = normalizeInterest(post.fandom);
    article.dataset.likes = String(stats.like_count || 0);

    const art = el('div', 'post-art');
    art.setAttribute('aria-label', post.media_url ? 'Post media' : 'Post artwork preview');
    if (post.media_url) {
      const media = post.media_type === 'video' ? el('video') : el('img');
      media.src = post.media_url;
      media.alt = post.title || 'BLOOM community post';
      media.loading = 'lazy';
      if (media.tagName === 'VIDEO') { media.controls = true; media.playsInline = true; media.preload = 'metadata'; }
      art.append(media);
    } else {
      const orb = el('div', 'orb');
      const stage = el('div', 'stage');
      const label = el('div', 'art-label');
      const firstLine = el('span', '', (post.fandom || 'BLOOM').toUpperCase());
      const title = el('div', '', (post.title || 'A little moment').toUpperCase());
      title.append(firstLine);
      label.append(title);
      art.append(orb, stage, label);
    }

    const top = el('div', 'post-top');
    const authorWrap = el('div', 'flex items-center gap-2');
    const avatar = el('div', 'avatar !w-9 !h-9 !rounded-full text-base', (post.fandom || '✿').trim().slice(0,1).toUpperCase() || '✿');
    const authorText = el('div');
    authorText.append(el('div', 'text-xs font-bold', author || 'BLOOM gardener'));
    authorText.append(el('div', 'text-[10px] text-white/70', (post.fandom || 'Interest garden') + ' · ' + new Date(post.created_at).toLocaleDateString()));
    authorWrap.append(avatar, authorText);
    const report = button('•••', 'bloom-report-action', () => reportPost(post));
    report.setAttribute('aria-label', 'Report this post');
    top.append(authorWrap, report);

    const tag = el('span', 'bloom-live-tag', 'Community post');
    top.append(tag);
    const actions = el('div', 'post-actions');
    const liked = Boolean(stats.liked_by_me || likedPostIds.has(post.id));
    const like = addActionButton(liked ? '♥' : '☀', compactNumber(stats.like_count || 0), 'like', liked ? 'liked' : '');
    like.setAttribute('aria-pressed', String(liked));
    const comments = addActionButton('♡', compactNumber(stats.comment_count || 0), 'comment');
    const share = addActionButton('↗', 'Share', 'share');
    const save = addActionButton('☆', 'Save', 'save');
    actions.append(like, comments, share, save);

    const bottom = el('div', 'post-bottom');
    bottom.append(el('div', 'text-sm font-bold mb-2', (post.title || 'A little moment') + ' ✿'));
    bottom.append(el('p', 'text-xs leading-5 text-white/85', post.body || 'Shared in the BLOOM community.'));
    const link = post.link;
    if (link) {
      const a = el('a', 'text-xs font-bold text-emerald-200 mt-2');
      a.href = link; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'Open shared link ↗';
      bottom.append(a);
    }
    bottom.append(el('div', 'text-[10px] text-white/55 mt-3', '✿ BLOOM · ' + (post.fandom || 'Your world')));
    const hint = el('div', 'post-hint', '✿');
    article.append(art, top, actions, bottom, hint);
    return article;
  }

  function compactNumber(value) {
    const n = Number(value || 0);
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/,'') + 'm';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/,'') + 'k';
    return String(n);
  }

  async function loadPosts() {
    if (!client) return;
    const feed = $('#feed');
    if (!feed) return;
    $$('.bloom-shared-post', feed).forEach((node) => node.remove());
    const {data, error} = await client.from('posts')
      .select('id,author_id,title,body,fandom,link,media_url,media_type,created_at,status')
      .eq('status','published').order('created_at',{ascending:false}).limit(50);
    if (error) {
      setLiveStatus('Connected, but shared posts could not load. Check Supabase policies.');
      return;
    }
    const rows = data || [];
    livePosts = rows;
    if (!rows.length) { activeInterestFilter(activeInterest); return; }
    const ids = [...new Set(rows.map((row) => row.author_id))];
    const names = new Map();
    if (ids.length) {
      const profiles = await client.from('profiles').select('id,username,display_name').in('id', ids);
      (profiles.data || []).forEach((item) => names.set(item.id, item.display_name || item.username || 'BLOOM gardener'));
    }
    const statsById = new Map();
    const idsForRpc = rows.map((row) => row.id).slice(0,100);
    if (idsForRpc.length) {
      try {
        const stats = await client.rpc('bloom_post_engagement', {target_post_ids:idsForRpc});
        if (!stats.error) (stats.data || []).forEach((row) => statsById.set(row.post_id, row));
      } catch (_) {}
      if (currentUser) {
        try {
          const savedLikes = await client.from('post_likes').select('post_id').eq('user_id', currentUser.id).in('post_id', idsForRpc);
          if (!savedLikes.error) likedPostIds = new Set((savedLikes.data || []).map((row) => row.post_id));
        } catch (_) {}
      }
    }
    const nodes = rows.map((post) => renderLivePost(post, statsById.get(post.id) || {}, names.get(post.author_id)));
    const firstDemo = $('.feed-post:not(.bloom-shared-post)', feed);
    nodes.forEach((node) => {
      if (firstDemo) firstDemo.before(node);
      else feed.append(node);
    });
    activeInterestFilter(activeInterest);
  }

  async function openComments(post) {
    openSheet('Comments ✿', 'Keep it kind. The best conversations make room for everyone.');
    const list = el('div', 'bloom-feed-comments');
    const form = el('form', 'bloom-live-form');
    const inputLabel = el('label', '', 'Add a comment');
    const input = el('textarea');
    input.name = 'comment'; input.maxLength = 500; input.required = true; input.placeholder = 'Leave a thoughtful note…';
    inputLabel.append(input);
    const send = el('button', 'bloom-form-primary', 'Post comment');
    send.type = 'submit';
    form.append(inputLabel, send);
    const {data, error} = await client.from('post_comments').select('id,author_id,body,created_at').eq('post_id',post.id).eq('status','published').order('created_at',{ascending:true}).limit(100);
    if (error) {
      setSheetStatus('Comments could not load. Check the feed-engagement database setup.');
    } else if (!data?.length) {
      list.append(el('p','bloom-small-muted','No comments yet. Start a thoughtful conversation.'));
    } else {
      const authorIds = [...new Set(data.map((item) => item.author_id))];
      const profiles = await client.from('profiles').select('id,username,display_name').in('id',authorIds);
      const names = new Map((profiles.data || []).map((item) => [item.id,item.display_name || item.username || 'BLOOM gardener']));
      data.forEach((item) => {
        const card = el('article','bloom-comment-item');
        card.append(el('strong','',item.author_id === currentUser?.id ? 'You' : (names.get(item.author_id) || 'BLOOM gardener')));
        card.append(el('p','',item.body));
        card.append(el('small','',new Date(item.created_at).toLocaleString()));
        list.append(card);
      });
    }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!signedIn()) return;
      const body = input.value.trim();
      if (!body) return;
      send.disabled = true;
      const {error:insertError} = await client.from('post_comments').insert({post_id:post.id,author_id:currentUser.id,body:body});
      send.disabled = false;
      if (insertError) { setSheetStatus('Comment could not be posted: ' + insertError.message); return; }
      await openComments(post);
      toast('Comment shared with the garden ✿');
    });
    sheetBody.append(list, form);
  }

  async function togglePostLike(postId, buttonNode) {
    if (!signedIn()) return;
    const already = likedPostIds.has(postId);
    buttonNode.disabled = true;
    let result;
    if (already) {
      result = await client.from('post_likes').delete().eq('post_id',postId).eq('user_id',currentUser.id);
    } else {
      result = await client.from('post_likes').insert({post_id:postId,user_id:currentUser.id});
    }
    buttonNode.disabled = false;
    if (result.error) { toast('Like could not be saved. Please try again.'); return; }
    if (already) likedPostIds.delete(postId); else likedPostIds.add(postId);
    await loadPosts();
    toast(already ? 'Sunlight taken back' : 'A little sunlight sent ☀');
  }

  async function reportPost(post) {
    if (!signedIn()) return;
    const reason = window.prompt('What is the concern? Enter a short reason; please do not include private information.');
    if (!reason || !reason.trim()) return;
    const {error} = await client.from('reports').insert({reporter_id:currentUser.id,target_type:'post',target_id:post.id,reason:reason.trim().slice(0,80)});
    toast(error ? 'Report could not be sent. Please try again.' : 'Thanks. Your report was added to the moderation queue.');
  }

  async function loadStories() {
    const rail = $('#bloom-story-rail');
    if (!rail || !client) return;
    const {data,error} = await client.from('stories').select('id,user_id,caption,media_path,media_type,created_at,expires_at')
      .gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(30);
    if (error) {
      rail.replaceChildren();
      rail.append(el('span','bloom-small-muted','Sign in and share moments here · stories expire after 24 hours.'));
      return;
    }
    const rows = data || [];
    stories = rows;
    const ids = [...new Set(rows.map((row) => row.user_id))];
    const names = new Map();
    if (ids.length) {
      const profiles = await client.from('profiles').select('id,username,display_name').in('id',ids);
      (profiles.data || []).forEach((item) => names.set(item.id,item.display_name || item.username || 'Gardener'));
    }
    rail.replaceChildren();
    const add = button('＋', 'bloom-story-dot', openCreateStory);
    const addRing = el('span','bloom-story-ring');
    addRing.append(el('span','','✿'));
    add.prepend(addRing);
    add.append(el('small','','Your story'));
    rail.append(add);
    rows.forEach((story) => {
      const userName = names.get(story.user_id) || 'Gardener';
      const item = button('', 'bloom-story-dot', async () => openStory(story,userName));
      const ring = el('span','bloom-story-ring');
      ring.append(el('span','',story.media_type === 'video' ? '▶' : '✿'));
      item.append(ring,el('small','',story.user_id === currentUser?.id ? 'You' : userName));
      rail.append(item);
    });
  }

  async function openCreateStory() {
    if (!signedIn()) return;
    openSheet('Share a story ✿','A photo or short video that disappears after 24 hours.');
    const form = el('form','bloom-live-form');
    const fileLabel = el('label','','Choose a photo or video');
    const file = el('input');
    file.type = 'file'; file.name = 'story_media'; file.accept = 'image/jpeg,image/png,image/webp,video/mp4,video/webm'; file.required = true;
    fileLabel.append(file);
    const captionLabel = el('label','','Caption (optional)');
    const caption = el('input');
    caption.name = 'caption'; caption.maxLength = 240; caption.placeholder = 'A little moment from your day…';
    captionLabel.append(caption);
    const submit = el('button','bloom-form-primary','Share 24-hour story');
    submit.type = 'submit';
    form.append(fileLabel,captionLabel,submit);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!signedIn()) return;
      const media = file.files?.[0];
      if (!media) return;
      if (!['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(media.type)) { setSheetStatus('Choose JPG, PNG, WebP, MP4, or WebM media.'); return; }
      if (media.size > 25 * 1024 * 1024) { setSheetStatus('Choose a file under 25 MB.'); return; }
      submit.disabled = true; submit.textContent = 'Uploading…';
      const isVideo = media.type.startsWith('video/');
      const extension = media.type === 'image/jpeg' ? 'jpg' : media.type.split('/')[1];
      const path = currentUser.id + '/story-' + crypto.randomUUID() + '.' + extension;
      const upload = await client.storage.from('bloom-story-media').upload(path,media,{contentType:media.type,upsert:false});
      if (upload.error) { setSheetStatus('Media upload failed. Check the BLOOM story-media storage policy.'); submit.disabled = false; submit.textContent = 'Share 24-hour story'; return; }
      const expires = new Date(Date.now()+24*60*60*1000).toISOString();
      const {error:insertError} = await client.from('stories').insert({
        user_id:currentUser.id,caption:caption.value.trim(),media_path:path,media_type:isVideo?'video':'image',expires_at:expires
      });
      if (insertError) {
        await client.storage.from('bloom-story-media').remove([path]);
        setSheetStatus('Story could not be published: ' + insertError.message);
      } else {
        closeSheet(); await loadStories(); toast('Your story is live for 24 hours ✿');
      }
      submit.disabled = false; submit.textContent = 'Share 24-hour story';
    });
    sheetBody.append(form);
  }

  async function openStory(story, userName) {
    const remaining = Math.max(60,Math.floor((new Date(story.expires_at).getTime()-Date.now())/1000));
    const signed = await client.storage.from('bloom-story-media').createSignedUrl(story.media_path,remaining);
    if (signed.error || !signed.data?.signedUrl) { toast('This story is no longer available.'); await loadStories(); return; }
    openSheet(userName || 'A garden moment', 'Stories disappear 24 hours after sharing.');
    const holder = el('div','bloom-story-viewer');
    const media = story.media_type === 'video' ? el('video') : el('img');
    media.src = signed.data.signedUrl;
    if (media.tagName === 'VIDEO') { media.controls = true; media.autoplay = true; media.playsInline = true; }
    else { media.alt = 'BLOOM story from ' + (userName || 'a gardener'); }
    holder.append(media);
    if (story.caption) holder.append(el('p','',story.caption));
    sheetBody.append(holder);
  }

  async function loadNotifications() {
    if (!client || !currentUser) return;
    const {data,error} = await client.from('notifications').select('id,recipient_id,actor_id,kind,entity_id,body,created_at,read_at')
      .eq('recipient_id',currentUser.id).order('created_at',{ascending:false}).limit(40);
    if (error) return;
    notifications = data || [];
    const unread = notifications.filter((item) => !item.read_at).length;
    const btn = $('#bloomNotificationsButton');
    if (btn) { btn.textContent = unread ? '♧ ' + unread : '♧'; btn.setAttribute('aria-label',unread+' unread notifications'); }
  }

  async function openNotifications() {
    if (!signedIn()) return;
    await loadNotifications();
    openSheet('Your garden signals ✧','Likes, comments, and community activity in one place.');
    if (!notifications.length) {
      sheetBody.append(el('div','bloom-empty-state','No notifications yet. When people interact with your posts and groups, the little signals will appear here.'));
      return;
    }
    const holder = el('div');
    notifications.forEach((item) => {
      const row = el('div','bloom-notice-item');
      row.append(el('span','notice-icon',item.kind === 'like' ? '♥' : item.kind === 'comment' ? '♡' : '✿'));
      const copy = el('div');
      copy.append(el('strong','',item.body || 'Something happened in your BLOOM garden.'));
      copy.append(el('p','',new Date(item.created_at).toLocaleString()));
      if (!item.read_at) copy.append(button('Mark read','bloom-form-secondary',async () => {
        const {error} = await client.from('notifications').update({read_at:new Date().toISOString()}).eq('id',item.id);
        if (!error) { item.read_at = new Date().toISOString(); row.style.opacity = '.58'; await loadNotifications(); }
      }));
      row.append(copy); holder.append(row);
    });
    sheetBody.append(holder);
  }

  async function loadGroups() {
    const list = $('#bloom-live-groups');
    if (!list || !client) return;
    const {data,error} = await client.from('groups').select('id,name,owner_id,is_public,created_at')
      .eq('is_public',true).order('created_at',{ascending:false}).limit(30);
    if (error) {
      list.replaceChildren();
      statusMessage(list,'Live communities are unavailable right now. Preview rooms are still visible below.');
      return;
    }
    liveGroups = data || [];
    if (!liveGroups.length) {
      list.replaceChildren();
      list.append(el('div','bloom-small-muted','No live circles yet. Create the first one when you sign in.'));
      return;
    }
    let memberships = new Set();
    if (currentUser) {
      const result = await client.from('group_members').select('group_id,role').eq('user_id',currentUser.id);
      if (!result.error) memberships = new Set((result.data || []).map((item) => item.group_id));
    }
    list.replaceChildren();
    liveGroups.forEach((group) => {
      const item = button('', 'bloom-live-group-card', () => joinAndOpenGroup(group));
      const avatar = el('span','avatar','✿');
      const details = el('span');
      details.append(el('strong','',group.name));
      details.append(el('small','', 'Live community · '+(memberships.has(group.id)?'member':'open to join')));
      const join = el('span','bloom-group-join',memberships.has(group.id)?'Open ↗':'Join ↗');
      item.append(avatar,details,join);
      list.append(item);
    });
  }

  async function openCreateGroup() {
    if (!signedIn()) return;
    openSheet('Plant a new circle ✿','Make a public community around a shared interest.');
    const form = el('form','bloom-live-form');
    const nameLabel = el('label','','Community name');
    const name = el('input'); name.name='name'; name.minLength=2; name.maxLength=70; name.required=true; name.placeholder='Creative Corner, Player Two Lounge…';
    nameLabel.append(name);
    const help = el('p','bloom-small-muted','New circles are public for now. Private community controls can be a later upgrade.');
    const submit = el('button','bloom-form-primary','Create community'); submit.type='submit';
    form.append(nameLabel,help,submit);
    form.addEventListener('submit',async (event) => {
      event.preventDefault();
      if (!signedIn()) return;
      const groupName = name.value.trim();
      if (groupName.length < 2) { setSheetStatus('Use at least two characters for the community name.'); return; }
      submit.disabled=true; submit.textContent='Planting…';
      const {data,error} = await client.from('groups').insert({name:groupName,owner_id:currentUser.id,is_public:true}).select('id,name,owner_id,is_public,created_at').single();
      if (error) { setSheetStatus('Community could not be created: '+error.message); submit.disabled=false; submit.textContent='Create community'; return; }
      closeSheet(); await loadGroups(); await joinAndOpenGroup(data);
    });
    sheetBody.append(form);
  }

  async function joinAndOpenGroup(group) {
    if (!signedIn()) return;
    const membership = await client.from('group_members').select('group_id,role').eq('group_id',group.id).eq('user_id',currentUser.id).maybeSingle();
    if (membership.error && membership.error.code !== 'PGRST116') {
      toast('Could not check community membership. Try again.'); return;
    }
    if (!membership.data) {
      const join = await client.from('group_members').insert({group_id:group.id,user_id:currentUser.id,role:'member'});
      if (join.error && join.error.code !== '23505') { toast('Could not join this community: '+join.error.message); return; }
    }
    activeLiveGroup = group;
    await loadGroups();
    if (realtimeChannel) { try { await client.removeChannel(realtimeChannel); } catch (_) {} realtimeChannel=null; }
    window.openRoom('__BLOOM_LIVE__');
    const title = $('#roomTitle');
    if (title) title.textContent=group.name;
    const online = $('#roomOnline'); if (online) online.textContent='live';
    await loadLiveMessages(group);
    realtimeChannel = client.channel('bloom-group-'+group.id)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:'group_id=eq.'+group.id},(payload) => {
        if (activeLiveGroup?.id === group.id) appendLiveMessage(payload.new);
      }).subscribe();
  }

  function appendLiveMessage(message, author) {
    const list = $('#messages');
    if (!list) return;
    const row = el('div','message'+(message.author_id===currentUser?.id?' mine':''));
    if (message.author_id !== currentUser?.id) row.append(el('div','text-[9px] text-emerald-300 mb-1',author || 'BLOOM gardener'));
    row.append(el('div','',message.body || ''));
    if (message.created_at) row.append(el('small','block text-[8px] text-white/40 mt-2',new Date(message.created_at).toLocaleTimeString()));
    list.append(row); list.scrollTop=list.scrollHeight;
  }

  async function loadLiveMessages(group) {
    const list = $('#messages');
    if (!list) return;
    list.replaceChildren();
    const status = el('div','bloom-small-muted','Loading live messages…');
    list.append(status);
    const {data,error} = await client.from('messages').select('id,group_id,author_id,body,created_at')
      .eq('group_id',group.id).order('created_at',{ascending:true}).limit(100);
    list.replaceChildren();
    if (error) { list.append(el('div','bloom-small-muted','Could not load messages: '+error.message)); return; }
    const ids = [...new Set((data || []).map((item) => item.author_id))];
    const profiles = ids.length ? await client.from('profiles').select('id,username,display_name').in('id',ids) : {data:[]};
    const names = new Map((profiles.data || []).map((item) => [item.id,item.display_name || item.username || 'Gardener']));
    (data || []).forEach((item) => appendLiveMessage(item,names.get(item.author_id)));
    if (!data?.length) list.append(el('div','bloom-small-muted','This circle is ready for its first message ✿'));
  }

  function interceptLiveMessageForm() {
    const form = $('#messageForm');
    if (!form) return;
    form.addEventListener('submit',async (event) => {
      if (!activeLiveGroup || !client || !currentUser) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const input = $('#messageInput');
      const body = input?.value.trim();
      if (!body) return;
      const {error} = await client.from('messages').insert({group_id:activeLiveGroup.id,author_id:currentUser.id,body:body});
      if (error) { toast('Message could not be sent: '+error.message); return; }
      input.value='';
    },true);
  }

  const originalOpenRoom = window.openRoom;
  window.openRoom = function (name) {
    if (name !== '__BLOOM_LIVE__') {
      activeLiveGroup = null;
      if (realtimeChannel && client) { client.removeChannel(realtimeChannel).catch(()=>{}); realtimeChannel=null; }
      if (typeof originalOpenRoom === 'function') originalOpenRoom(name);
      return;
    }
    const overlay = $('#roomOverlay');
    if (overlay) overlay.classList.add('open');
  };

  async function loadMarketplace() {
    if (!client) return;
    const {data,error} = await client.from('marketplace_listings').select('id,seller_id,title,description,category,item_condition,price,currency,emoji,status,created_at')
      .eq('status','active').order('created_at',{ascending:false}).limit(40);
    const grids = [$('#bloom-market-grid'),$('#bloom-desktop-market-grid')].filter(Boolean);
    if (error) {
      grids.forEach((grid) => { grid.replaceChildren(); grid.append(el('div','bloom-empty-state','The live market could not load. Check the marketplace tables and RLS policies.')); });
      return;
    }
    const items = data || [];
    const sellerIds=[...new Set(items.map((item)=>item.seller_id))];
    const profiles=sellerIds.length?await client.from('profiles').select('id,username,display_name').in('id',sellerIds):{data:[]};
    const names=new Map((profiles.data||[]).map((item)=>[item.id,item.display_name||item.username||'BLOOM gardener']));
    grids.forEach((grid)=>renderMarketplaceGrid(grid,items,names));
    await loadMarketplaceInbox();
  }

  function renderMarketplaceGrid(grid, items, names) {
    grid.replaceChildren();
    if (!items.length) {
      grid.append(el('div','bloom-empty-state','The Garden Market is ready for its first listing. Be the first to share a little find ✿'));
      return;
    }
    const cap = grid.id === 'bloom-desktop-market-grid' ? 6 : 12;
    items.slice(0,cap).forEach((item) => {
      const card=el('article','bloom-market-card');
      card.append(el('div','bloom-market-symbol',item.emoji||'✿'));
      card.append(el('strong','',item.title));
      card.append(el('p','',item.description));
      card.append(el('p','',String(item.category||'other').replaceAll('_',' ')+' · '+(names.get(item.seller_id)||'Community seller')));
      card.append(el('div','bloom-market-price',(item.currency==='MYR'?'RM ':'')+Number(item.price||0).toFixed(2)));
      const request=button('Request item','',()=>openMarketplaceRequest(item));
      card.append(request); grid.append(card);
    });
  }

  function openCreateListing() {
    if (!signedIn()) return;
    openSheet('List a little find ✿','Share a community item. This form does not take payment.');
    const form=el('form','bloom-live-form');
    const titleLabel=el('label','','Item name');
    const title=el('input');title.name='title';title.required=true;title.minLength=3;title.maxLength=90;title.placeholder='A photocard holder, art print, plant pot…';titleLabel.append(title);
    const descriptionLabel=el('label','','Description');
    const description=el('textarea');description.name='description';description.maxLength=1200;description.required=true;description.placeholder='Condition, details, and what is included';descriptionLabel.append(description);
    const row=el('div','bloom-form-row');
    const priceLabel=el('label','','Price (MYR)');
    const price=el('input');price.type='number';price.name='price';price.min='0';price.max='100000';price.step='.01';price.value='0';priceLabel.append(price);
    const categoryLabel=el('label','','Category');
    const category=el('select');category.name='category';
    [['albums','Albums & collectibles'],['photocards','Photocards'],['fashion','Fan style'],['accessories','Accessories'],['concert','Concert essentials'],['other','Other interests']].forEach(([value,label])=>{const opt=el('option','',label);opt.value=value;category.append(opt);});
    categoryLabel.append(category);row.append(priceLabel,categoryLabel);
    const condLabel=el('label','','Condition');const cond=el('select');cond.name='item_condition';
    [['new','New'],['like_new','Like new'],['good','Good'],['fair','Fair']].forEach(([v,l])=>{const op=el('option','',l);op.value=v;cond.append(op);});
    condLabel.append(cond);
    const emojiLabel=el('label','','Card emoji');const emoji=el('select');emoji.name='emoji';
    ['🌸','💿','🎀','📔','🧥','🎒','✨','🪴','🎮','🎨'].forEach((value)=>{const op=el('option','',value);op.value=value;emoji.append(op);});
    emojiLabel.append(emoji);
    const row2=el('div','bloom-form-row');row2.append(condLabel,emojiLabel);
    const submit=el('button','bloom-form-primary','Publish listing');submit.type='submit';
    const note=el('p','bloom-small-muted','BLOOM does not process payments or verify items yet. Arrange any exchange safely.');
    form.append(titleLabel,descriptionLabel,row,row2,note,submit);
    form.addEventListener('submit',async (event)=>{
      event.preventDefault();if(!signedIn())return;
      const payload={seller_id:currentUser.id,title:title.value.trim(),description:description.value.trim(),category:category.value,item_condition:cond.value,price:Number(price.value),currency:'MYR',emoji:emoji.value,status:'active'};
      if(!payload.title||!payload.description||!Number.isFinite(payload.price)||payload.price<0){setSheetStatus('Check the item details and price.');return;}
      submit.disabled=true;submit.textContent='Publishing…';
      const {error}=await client.from('marketplace_listings').insert(payload);
      if(error){setSheetStatus('Listing could not be published: '+error.message);submit.disabled=false;submit.textContent='Publish listing';return;}
      closeSheet();await loadMarketplace();toast('Your listing is live in the Garden Market ✿');
    });
    sheetBody.append(form);
  }

  function openMarketplaceRequest(item) {
    if (!signedIn()) return;
    if (item.seller_id===currentUser.id) { toast('That is your own listing.'); return; }
    pendingListing=item;
    openSheet('Ask about this find 💌',item.title,'Send a request to the seller. No payment is taken.');
    const form=el('form','bloom-live-form');
    const label=el('label','','Message to seller');
    const input=el('textarea');input.maxLength=600;input.required=true;input.placeholder='Hi! Is this item still available?';label.append(input);
    const submit=el('button','bloom-form-primary','Send request');submit.type='submit';
    form.append(label,submit);
    form.addEventListener('submit',async(event)=>{
      event.preventDefault();if(!pendingListing||!signedIn())return;
      submit.disabled=true;
      const {error}=await client.from('marketplace_inquiries').insert({listing_id:pendingListing.id,buyer_id:currentUser.id,message:input.value.trim()});
      if(error){setSheetStatus('Request could not be sent: '+error.message);submit.disabled=false;return;}
      closeSheet();toast('Your request was sent. This is not a payment or order.');
    });
    sheetBody.append(form);
  }

  async function loadMarketplaceInbox() {
    const holder=$('#bloom-market-inbox');
    if(!holder)return;
    holder.replaceChildren();
    if(!currentUser)return;
    const own=await client.from('marketplace_listings').select('id,title').eq('seller_id',currentUser.id);
    if(own.error||!own.data?.length)return;
    const listingMap=new Map(own.data.map((item)=>[item.id,item.title]));
    const result=await client.from('marketplace_inquiries').select('id,listing_id,buyer_id,message,status,created_at')
      .in('listing_id',own.data.map((item)=>item.id)).eq('status','new').order('created_at',{ascending:false}).limit(20);
    if(result.error||!result.data?.length)return;
    result.data.forEach((item)=>{
      const row=el('div','bloom-live-market-inquiry');
      row.append(el('strong','',listingMap.get(item.listing_id)||'Your listing'));
      row.append(el('p','',item.message));
      const close=button('Close request','bloom-form-secondary',async()=>{
        const {error}=await client.from('marketplace_inquiries').update({status:'closed'}).eq('id',item.id);
        if(error)toast('Could not close request.');else{toast('Request closed.');await loadMarketplaceInbox();}
      });
      row.append(close);holder.append(row);
    });
  }

  function insertDemoInterestPosts() {
    const feed=$('#feed');
    if(!feed || $('.bloom-prototype-generated',feed))return;
    const demos=[
      {key:'creative',name:'thepaperfern',caption:'slow Sunday, made by hand 🌿',body:'Little ink studies and a new notebook page. What are you making this week?',emoji:'🎨',word:'MAKE\nSOMETHING',sub:'CREATIVE CORNER',bg:'radial-gradient(ellipse at 35% 28%,#7c527a,#302334 46%,#101310)'},
      {key:'gaming',name:'pixelmoss',caption:'one more round, promise 🎮',body:'Finally got the setup feeling right. Drop your favourite cosy game below.',emoji:'🎮',word:'PLAYER\nTWO',sub:'SETUP DIARY',bg:'radial-gradient(ellipse at 45% 35%,#496c88,#1c2931 49%,#101310)'},
      {key:'food',name:'misoandmint',caption:'a little comfort in a bowl 🍜',body:'Chilli oil noodles, extra spring onion, and nowhere to rush off to.',emoji:'🍜',word:'GOOD\nTHINGS',sub:'KITCHEN TABLE',bg:'radial-gradient(ellipse at 45% 35%,#997043,#39291d 48%,#111310)'},
      {key:'outdoors',name:'outsideoften',caption:'took the longer way home 🥾',body:'Fresh air, a tiny trail, and the reminder that the world is quite big.',emoji:'🥾',word:'GO\nOUTSIDE',sub:'LITTLE ADVENTURES',bg:'radial-gradient(ellipse at 45% 35%,#528d66,#203528 48%,#101310)'},
      {key:'books',name:'betweenchapters',caption:'one chapter turned into twelve 📚',body:'Finished a book that felt like a deep breath. What should I read next?',emoji:'📚',word:'ONE\nMORE',sub:'BOOKSHELF NOTES',bg:'radial-gradient(ellipse at 45% 35%,#8c6d8c,#36283b 50%,#101310)'},
      {key:'tech',name:'buildwithmei',caption:'small project, big happy brain 💡',body:'A little weekend build is finally working. Sharing notes soon!',emoji:'💡',word:'IDEAS\nIN MOTION',sub:'TECH & MAKING',bg:'radial-gradient(ellipse at 45% 35%,#4b7e70,#1b3029 50%,#101310)'}
    ];
    demos.forEach((item,index)=>{
      const article=el('article','feed-post bloom-prototype-generated');
      article.dataset.interest=item.key;article.dataset.demoIndex=String(index);
      const art=el('div','post-art');art.style.background=item.bg;
      const orb=el('div','orb');const stage=el('div','stage');const label=el('div','art-label');
      label.append(document.createTextNode(item.word));
      label.append(el('span','',item.sub));
      art.append(orb,stage,label);
      const top=el('div','post-top');
      const authorWrap=el('div','flex items-center gap-2');
      authorWrap.append(el('div','avatar !w-9 !h-9 !rounded-full text-base',item.emoji));
      const author=el('div');author.append(el('div','text-xs font-bold',item.name),el('div','text-[10px] text-white/70','Sample post · '+categoryNames[item.key]));
      top.append(authorWrap,author,el('span','bloom-live-tag','Sample'));
      const actions=el('div','post-actions');
      const like=el('button','action-button like-action');like.type='button';like.append(el('span','bubble','☀'),el('span','like-count','Preview'));
      const comment=el('button','action-button comment-action');comment.type='button';comment.append(el('span','bubble','♡'),el('span','','Chat'));
      const share=el('button','action-button share-action');share.type='button';share.append(el('span','bubble','↗'),el('span','','Share'));
      actions.append(like,comment,share);
      const bottom=el('div','post-bottom');bottom.append(el('div','text-sm font-bold mb-2',item.caption),el('p','text-xs leading-5 text-white/85',item.body),el('div','text-[10px] text-white/55 mt-3','✿ BLOOM · Sample content'));
      article.append(art,top,actions,bottom,el('div','post-hint','✿'));
      feed.append(article);
      like.addEventListener('click',()=>toast('This sample like is only a preview.'));
      comment.addEventListener('click',()=>toast('Sign in to comment on shared BLOOM posts.'));
      share.addEventListener('click',()=>shareContent('BLOOM · '+item.caption,item.body,location.href));
    });
  }

  function shareContent(title, text, url) {
    if (navigator.share) navigator.share({title:title,text:text,url:url}).catch(()=>{});
    else if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(()=>toast('BLOOM link copied ✿')).catch(()=>toast('Share this page from your browser.'));
    else toast('Share this little moment from your browser ✿');
  }

  async function refreshAccountSurface() {
    await loadOwnProfile();
    await loadGroups();
    await loadMarketplace();
    await loadPosts();
    await loadNotifications();
  }

  function wireControls() {
    $('#bloomAccountButton')?.addEventListener('click',renderAccountSettings);
    $('#bloomProfileSettingsButton')?.addEventListener('click',renderAccountSettings);
    $('#bloomEditInterestsButton')?.addEventListener('click',renderAccountSettings);
    $('#bloomCreateButton')?.addEventListener('click',openCreatePost);
    $('#bloomStoryButton')?.addEventListener('click',openCreateStory);
    $('#bloomNotificationsButton')?.addEventListener('click',openNotifications);
    $('#bloomChatNotificationsButton')?.addEventListener('click',openNotifications);
    $('#bloomCreateGroupButton')?.addEventListener('click',openCreateGroup);
    $('#bloomSellButton')?.addEventListener('click',openCreateListing);
    $('#bloomDesktopSellButton')?.addEventListener('click',openCreateListing);
    $('#bloomSellButton')?.addEventListener('click',()=>$('#tab-profile')?.querySelector('.profile-scroll')?.scrollTo({top:0,behavior:'smooth'}));
    $('#feed')?.addEventListener('click',async(event)=>{
      const target=event.target.closest('[data-live-action]');
      if(!target)return;
      const article=target.closest('.bloom-shared-post');
      if(!article)return;
      const post=livePosts.find((item)=>item.id===article.dataset.livePostId);
      if(!post)return;
      const action=target.dataset.liveAction;
      if(action==='like')await togglePostLike(post.id,target);
      else if(action==='comment')await openComments(post);
      else if(action==='share')shareContent('BLOOM · '+post.title,post.body,location.origin+location.pathname+'#tab-feed');
      else if(action==='report')await reportPost(post);
      else if(action==='save')toast('Saved posts are available in preview; synced saves are planned next.');
    });
    interceptLiveMessageForm();
  }

  async function openCreatePost() {
    if (!signedIn()) return;
    openSheet('Share with the garden ✿','A photo, video, idea, or little moment from your world.');
    const form=el('form','bloom-live-form');
    const titleLabel=el('label','','Post title');
    const title=el('input');title.name='title';title.required=true;title.maxLength=100;title.placeholder='Give this little moment a title…';titleLabel.append(title);
    const bodyLabel=el('label','','Your update');
    const body=el('textarea');body.name='body';body.required=true;body.maxLength=2000;body.placeholder='What are you sharing with the garden?';bodyLabel.append(body);
    const interestLabel=el('label','','Interest or topic');
    const interest=el('select');interest.name='interest';
    categories.forEach((item)=>{const option=el('option','',item.emoji+' '+item.label);option.value=item.key;interest.append(option);});
    const other=el('option','','Other topic');other.value='other';interest.append(other);interestLabel.append(interest);
    const linkLabel=el('label','','Link (optional)');
    const link=el('input');link.name='link';link.type='url';link.placeholder='https://…';linkLabel.append(link);
    const mediaLabel=el('label','','Add a photo or video (optional)');
    const media=el('input');media.name='media';media.type='file';media.accept='image/jpeg,image/png,image/webp,video/mp4,video/webm';mediaLabel.append(media);
    const note=el('p','bloom-small-muted','Be kind, credit creators, and share only media you have permission to post.');
    const submit=el('button','bloom-form-primary','Publish post');submit.type='submit';
    form.append(titleLabel,bodyLabel,interestLabel,linkLabel,mediaLabel,note,submit);
    form.addEventListener('submit',async(event)=>{
      event.preventDefault();if(!signedIn())return;
      const file=media.files?.[0];
      if(file && !['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(file.type)){setSheetStatus('Choose JPG, PNG, WebP, MP4, or WebM media.');return;}
      if(file && file.size>25*1024*1024){setSheetStatus('Choose media under 25 MB.');return;}
      submit.disabled=true;submit.textContent=file?'Uploading & publishing…':'Publishing…';
      let mediaUrl=null;let mediaType='image';
      if(file){
        const isVideo=file.type.startsWith('video/');
        const ext=file.type==='image/jpeg'?'jpg':file.type.split('/')[1];
        const path=currentUser.id+'/post-'+crypto.randomUUID()+'.'+ext;
        const upload=await client.storage.from('bloom-post-media').upload(path,file,{contentType:file.type,upsert:false});
        if(upload.error){setSheetStatus('Media upload failed. Check the BLOOM post-media storage policies.');submit.disabled=false;submit.textContent='Publish post';return;}
        const publicUrl=client.storage.from('bloom-post-media').getPublicUrl(path);
        mediaUrl=publicUrl.data?.publicUrl||null;mediaType=isVideo?'video':'image';
      }
      const topic=interest.value==='other'?'Other':(categoryNames[interest.value]||interest.value);
      const {data,error}=await client.from('posts').insert({
        author_id:currentUser.id,title:title.value.trim(),body:body.value.trim(),fandom:topic,link:link.value.trim()||null,media_url:mediaUrl,media_type:mediaType
      }).select('id,author_id,title,body,fandom,link,media_url,media_type,created_at,status').single();
      if(error){setSheetStatus('Post could not be published: '+error.message);submit.disabled=false;submit.textContent='Publish post';return;}
      closeSheet();await loadPosts();toast('Your post is in bloom ✿');
    });
    sheetBody.append(form);
  }

  function addGroupPreviewData() {
    const rows=[
      ['Creative Corner','Art, craft, design, and small projects.','🎨'],
      ['Player Two Lounge','Games, setups, co-op, and good vibes.','🎮'],
      ['Kitchen Table','Recipes, cafe finds, and cooking notes.','🍜']
    ];
    const desktop=$('.desktop-panel .space-y-3');
    if(desktop && !$('#bloom-extra-demo-circles')){
      const wrapper=el('div','space-y-3');wrapper.id='bloom-extra-demo-circles';
      rows.forEach(([name,desc,emoji])=>{
        const b=button('', 'glass w-full rounded-2xl p-4 flex items-center gap-4 text-left',()=>window.openRoom(name));
        b.append(el('div','avatar',emoji));
        const txt=el('div','flex-1');txt.append(el('div','text-sm font-bold',name),el('div','text-xs text-zinc-500 mt-1',desc));
        b.append(txt,el('span','text-emerald-400','↗'));wrapper.append(b);
      });
      desktop.append(wrapper);
    }
  }

  function init() {
    insertDemoInterestPosts();
    addGroupPreviewData();
    wireControls();
    buildProfileInterests(readLocalInterests());
    if (!cfg.url || !cfg.anonKey || !window.supabase?.createClient) {
      setLiveStatus('Preview mode · sample posts and rooms work locally. Connect Supabase to enable shared accounts, media, chat, and listings.');
      return;
    }
    if (!/^https:\/\//i.test(cfg.url) || /service_role/i.test(cfg.anonKey)) {
      setLiveStatus('Backend settings need review. Use the public project URL and publishable/anon key only.');
      return;
    }
    client=window.supabase.createClient(cfg.url,cfg.anonKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    });
    client.auth.onAuthStateChange((event,session)=>{
      currentUser=session?.user||null;
      Promise.resolve().then(async()=>{
        await syncSession();
        if(event==='SIGNED_IN')toast('Welcome to your BLOOM garden ✿');
      });
    });
    syncSession().catch((error)=>setLiveStatus('BLOOM connected with a setup issue: '+(error.message||'please refresh and try again.')));
    $('#bloomStoryButton')?.setAttribute('title','Share a photo or short video for 24 hours');
    $('#bloomCreateButton')?.setAttribute('title','Create a shared post');
    $('#bloomNotificationsButton')?.setAttribute('title','View likes, comments, and community notifications');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();