/* Optional BLOOM Supabase integration. It stays in demo mode until bloom-config.js is configured. */
(function () {
  'use strict';
  const cfg = window.BLOOM_SUPABASE_CONFIG || {};
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const esc = (value) => String(value ?? '');
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
    const activity = $('#activity .wrap');
    if (!activity) return;
    let currentUser = null;
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
      else { passwordRecovery = false; $('#bloom-password-update-form').hidden = true; $('#bloom-new-password').value = ''; setAuthMessage('Password updated. You can continue using BLOOM.'); }
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

    function renderPost(post) {
      const card = document.createElement('article'); card.className = 'bloom-live-post';
      const title = document.createElement('h4'); title.textContent = post.title;
      const body = document.createElement('p'); body.textContent = post.body;
      const meta = document.createElement('small'); meta.textContent = (post.fandom || 'Multi-stan') + ' · ' + new Date(post.created_at).toLocaleString();
      card.append(meta, title, body);
      if (post.link) { const a = document.createElement('a'); a.href = post.link; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'Open link ↗'; card.append(a); }
      if (currentUser) {
        const report = document.createElement('button'); report.type = 'button'; report.className = 'small-action'; report.textContent = '⚑ Report';
        report.addEventListener('click', async () => {
          const reason = window.prompt('What is the concern? Choose a short reason and do not include private information.');
          if (!reason || !reason.trim()) return;
          const { error } = await client.from('reports').insert({ reporter_id: currentUser.id, target_type: 'post', target_id: post.id, reason: reason.trim().slice(0,80) });
          window.alert(error ? 'Report could not be sent: ' + error.message : 'Thanks. Your report has been sent to the moderation queue.');
        });
        card.append(report);
      }
      return card;
    }
    async function loadPosts() {
      const { data, error } = await client.from('posts').select('id,author_id,title,body,fandom,link,created_at,status').eq('status','published').order('created_at',{ascending:false}).limit(50);
      livePostList.replaceChildren();
      if (error) { livePostList.textContent = 'Could not load posts: ' + error.message; return; }
      if (!data?.length) { livePostList.textContent = 'No shared posts yet. Be the first to post!'; return; }
      data.forEach(p => livePostList.append(renderPost(p)));
    }
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
        if (payload.new) appendMessage(payload.new);
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
    }
    client.auth.onAuthStateChange((event, session) => { if (event === 'PASSWORD_RECOVERY') passwordRecovery = true; setTimeout(() => { void syncSession(session); }, 0); });
    client.auth.getSession().then(({ data }) => syncSession(data.session)).catch((error) => { setLiveStatus('Could not restore your session. Refresh and try again.'); console.error('BLOOM session restore failed:', error); });
  }
})();
