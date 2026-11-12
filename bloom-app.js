(() => {
'use strict';

const CFG = window.BLOOM_SUPABASE_CONFIG || {};
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));
const INTERESTS = [
  {key:'art',label:'Art',emoji:'🎨'},
  {key:'gaming',label:'Gaming',emoji:'🎮'},
  {key:'life',label:'Life',emoji:'🌿'},
  {key:'food',label:'Food',emoji:'🍜'},
  {key:'outdoors',label:'Outdoors',emoji:'🌱'},
  {key:'music',label:'Music',emoji:'🎧'},
  {key:'books',label:'Books',emoji:'📚'},
  {key:'tech',label:'Tech',emoji:'💡'}
];
const FILTERS = [
  {key:'original',label:'Original',css:'none'},
  {key:'warm_cream',label:'Warm Cream',css:'sepia(.18) saturate(1.12) brightness(1.04)'},
  {key:'soft_violet',label:'Soft Violet',css:'sepia(.12) hue-rotate(220deg) saturate(1.12)'},
  {key:'golden_sunlight',label:'Golden Sunlight',css:'sepia(.28) saturate(1.28) brightness(1.04)'},
  {key:'vintage_fade',label:'Vintage Fade',css:'sepia(.25) saturate(.76) contrast(.9) brightness(1.04)'},
  {key:'crisp_bw',label:'Crisp B&W',css:'grayscale(1) contrast(1.12)'}
];
const SAMPLE_FALLBACK = [
  {id:'sample-art-01',creator_name:'thepaperfern',category:'art',caption:'A tiny desk corner for sketches, colour studies, and unfinished ideas.',emoji:'🎨',art_key:'flower'},
  {id:'sample-game-01',creator_name:'pixelmoss',category:'gaming',caption:'A cosy little setup for one more round with friends.',emoji:'🎮',art_key:'gaming'},
  {id:'sample-life-01',creator_name:'littlefern',category:'life',caption:'A slower morning, fresh flowers, and a notebook with no plan.',emoji:'🌱',art_key:'life'},
  {id:'sample-food-01',creator_name:'misoandmint',category:'food',caption:'Comfort in a bowl: noodles, herbs, and a little chilli crisp.',emoji:'🍜',art_key:'food'},
  {id:'sample-outdoor-01',creator_name:'outsideoften',category:'outdoors',caption:'Took the longer way home. The sky did the rest.',emoji:'🌿',art_key:'outdoors'}
];
const CIRCLE_FALLBACK = [
  {id:'sample-circle-gaming',name:"Gamer's Lounge",category:'gaming',description:'Find teammates, share cosy setups, and talk about the games you love.',sample:true},
  {id:'sample-circle-books',name:'Book Club',category:'books',description:'Reading notes, recommendations, and spoiler-friendly book chats.',sample:true},
  {id:'sample-circle-food',name:'Foodie Finds',category:'food',description:'Recipes, cafe discoveries, and small kitchen victories.',sample:true},
  {id:'sample-circle-art',name:'Art & Design',category:'art',description:'Illustration, design, photography, crafts, and works in progress.',sample:true}
];

let client = null;
let currentUser = null;
let currentProfile = null;
let currentView = 'feed';
let currentCategory = 'mix';
let greenhouseTab = 'circles';
let allPlants = [];
let samplePlants = SAMPLE_FALLBACK.slice();
let blockedUsers = [];
let activeChat = null;
let chatChannel = null;
let notificationChannel = null;
let pendingAction = null;
let studioFile = null;
let studioObjectUrl = null;
let studioFilter = 'original';
let cameraStream = null;
let currentModalCleanup = null;
let toastTimer = null;
let selectedSharePost = null;
let notificationAlertsEnabled = true;
let isLoadingFeed = false;

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function categoryInfo(key) { return INTERESTS.find(i => i.key === key) || {key:'life',label:'Life',emoji:'🌿'}; }
function formatCount(value) {
  const n = Number(value || 0);
  if (n >= 1000000) return (n/1000000).toFixed(1).replace(/\.0$/,'')+'m';
  if (n >= 1000) return (n/1000).toFixed(1).replace(/\.0$/,'')+'k';
  return String(n);
}
function ago(value) {
  if (!value) return 'A little while ago';
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'Just now';
  const m = Math.floor(ms/60000);
  if (m < 1) return 'Just now';
  if (m < 60) return m+'m ago';
  const h = Math.floor(m/60);
  if (h < 24) return h+'h ago';
  const d = Math.floor(h/24);
  return d+'d ago';
}
function setStatus(selector, text) { const n=$(selector); if(n) n.textContent=text||''; }
function toast(message) {
  const node=$('#toast'); if(!node) return;
  node.textContent=message; node.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>node.classList.remove('show'),3000);
}
function localGet(key, fallback) {
  try { const raw=localStorage.getItem(key); return raw===null?fallback:JSON.parse(raw); } catch(_) { return fallback; }
}
function localSet(key, value) { try { localStorage.setItem(key,JSON.stringify(value)); return true; } catch(_) { return false; } }
function safeUrl(value) {
  try { const u=new URL(value,location.origin); return ['http:','https:'].includes(u.protocol)?u.href:null; } catch(_) { return null; }
}
function createClient() {
  if (!CFG.url || !CFG.anonKey || !window.supabase?.createClient) return false;
  if (!/^https:\/\//i.test(CFG.url) || /service_role|secret/i.test(CFG.anonKey)) return false;
  client=window.supabase.createClient(CFG.url,CFG.anonKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  return true;
}
function getFileName(file) {
  const ext=(file?.name||'photo').split('.').pop().replace(/[^a-z0-9]/gi,'').toLowerCase();
  return ext || 'jpg';
}
function avatarNode(username, avatarUrl, sizeClass='mini-avatar') {
  const n=document.createElement('span'); n.className=sizeClass;
  const url=safeUrl(avatarUrl);
  if(url) { const img=document.createElement('img'); img.src=url; img.alt=''; img.loading='lazy'; n.append(img); }
  else n.textContent=(username||'G').replace(/^@/,'').slice(0,1).toUpperCase()||'G';
  return n;
}
function button(label, cls, handler) {
  const b=document.createElement('button'); b.type='button'; b.className=cls||''; b.textContent=label;
  if(handler) b.addEventListener('click',handler);
  return b;
}
function closeActiveRealtime() {
  if(chatChannel && client) { client.removeChannel(chatChannel).catch(()=>{}); chatChannel=null; }
}
function stopCamera() {
  if(cameraStream) { cameraStream.getTracks().forEach(track=>track.stop()); cameraStream=null; }
}
function revokeStudioUrl() {
  if(studioObjectUrl) { URL.revokeObjectURL(studioObjectUrl); studioObjectUrl=null; }
}
function clearModal() {
  closeActiveRealtime(); stopCamera(); revokeStudioUrl();
  if(currentModalCleanup) { try { currentModalCleanup(); } catch(_) {} currentModalCleanup=null; }
  const root=$('#modalRoot'); if(root) root.replaceChildren();
}
function openModal(title, subtitle, builder, options={}) {
  if(!options.keepChat) closeActiveRealtime();
  stopCamera(); revokeStudioUrl();
  if(currentModalCleanup) { try { currentModalCleanup(); } catch(_) {} currentModalCleanup=null; }
  const root=$('#modalRoot'); if(!root) return null;
  root.replaceChildren();
  const overlay=document.createElement('div'); overlay.className='modal-overlay'; overlay.setAttribute('role','presentation');
  const sheet=document.createElement('section'); sheet.className='modal-sheet'; sheet.setAttribute('role','dialog'); sheet.setAttribute('aria-modal','true'); sheet.setAttribute('aria-label',title);
  const head=document.createElement('div'); head.className='modal-head';
  const copy=document.createElement('div'); const eyebrow=document.createElement('div'); eyebrow.className='eyebrow'; eyebrow.textContent='BLOOM · YOUR SPACE';
  const h=document.createElement('h2'); h.textContent=title; const p=document.createElement('p'); p.textContent=subtitle||'';
  copy.append(eyebrow,h,p);
  const close=button('×','modal-close',()=>clearModal()); close.setAttribute('aria-label','Close');
  head.append(copy,close); const body=document.createElement('div'); body.className='modal-body';
  sheet.append(head,body); overlay.append(sheet); overlay.addEventListener('click',e=>{if(e.target===overlay) clearModal();});
  root.append(overlay);
  const esc=e=>{if(e.key==='Escape') clearModal();}; document.addEventListener('keydown',esc);
  currentModalCleanup=()=>document.removeEventListener('keydown',esc);
  if(builder) builder(body,overlay);
  return body;
}
function requireAuth(action) {
  if(!client) { toast('BLOOM is in preview mode because the Supabase connection is unavailable.'); return false; }
  if(!currentUser) { pendingAction=action||null; openAuthModal('signin'); return false; }
  return true;
}
function setTheme(theme) {
  const value=theme==='dark'?'dark':'light';
  document.body.dataset.theme=value;
  try { localStorage.setItem('bloom-theme',value); } catch(_) {}
}
function initTheme() { setTheme(localStorage.getItem('bloom-theme')||'light'); }

function showView(view) {
  if(!['feed','greenhouse','notifications','profile'].includes(view)) return;
  if(view==='greenhouse' && !requireAuth(()=>showView('greenhouse'))) return;
  if(view==='notifications' && !requireAuth(()=>showView('notifications'))) return;
  currentView=view;
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===view+'-view'));
  $$('.nav-item[data-nav]').forEach(b=>{
    const active=b.dataset.nav===view; b.classList.toggle('active',active);
    if(active) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  });
  if(view==='greenhouse') loadGreenhouse();
  if(view==='notifications') loadNotifications();
  if(view==='profile') loadGardenGrid();
  window.scrollTo({top:0,behavior:'smooth'});
}
function wireNavigation() {
  $$('[data-nav]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();showView(b.dataset.nav);}));
  $('#createNavButton')?.addEventListener('click',()=>openCreateStudio());
  $('#feedCreateButton')?.addEventListener('click',()=>openCreateStudio());
  $('#profileCreateButton')?.addEventListener('click',()=>openCreateStudio());
  $('#headerAuthButton')?.addEventListener('click',()=>currentUser?openSettings():openAuthModal('signin'));
  $('#settingsButton')?.addEventListener('click',()=>openSettings());
  $('#editProfileButton')?.addEventListener('click',()=>openEditProfile());
  $('#greenhouseAuthButton')?.addEventListener('click',()=>startNewDm());
  $('#newDmButton')?.addEventListener('click',()=>startNewDm());
  $('#markAllReadButton')?.addEventListener('click',markAllNotificationsRead);
  $$('[data-greenhouse-tab]').forEach(b=>b.addEventListener('click',()=>{
    greenhouseTab=b.dataset.greenhouseTab; updateGreenhouseTabs(); renderGreenhousePanels();
  }));
  $('#greenhouseSearch')?.addEventListener('input',renderGreenhousePanels);
  $('#interestFilters')?.addEventListener('click',e=>{
    const pill=e.target.closest('[data-category]'); if(!pill)return;
    currentCategory=pill.dataset.category; updateInterestPills(); renderFeed();
  });
}
function updateInterestPills() {
  $$('[data-category]').forEach(b=>{
    const active=b.dataset.category===currentCategory; b.classList.toggle('active',active); b.setAttribute('aria-pressed',String(active));
  });
}
function updateGreenhouseTabs() {
  $$('[data-greenhouse-tab]').forEach(b=>{
    const selected=b.dataset.greenhouseTab===greenhouseTab; b.classList.toggle('selected',selected); b.setAttribute('aria-selected',String(selected));
  });
}
function showSplash() {
  const splash=$('#splash'), app=$('#app');
  const finish=()=>{splash?.classList.add('hide');if(app)app.setAttribute('aria-hidden','false');};
  setTimeout(finish,window.matchMedia('(prefers-reduced-motion: reduce)').matches?350:1500);
}

async function loadOwnProfile() {
  if(!client||!currentUser){currentProfile=null;return null;}
  const {data,error}=await client.from('profiles')
    .select('id,username,bio,avatar_url,interests,is_private,sunlight_count')
    .eq('id',currentUser.id).maybeSingle();
  if(error){console.warn('[BLOOM] profile load:',error.message);return null;}
  currentProfile=data||null; return currentProfile;
}
function updateSignedInUI() {
  const auth=$('#headerAuthButton');
  if(auth) auth.textContent=currentUser?'Account':'Sign in';
  const dot=$('#notificationDot'); if(!currentUser&&dot)dot.hidden=true;
}
function showOnboardingIfNeeded() {
  if(!currentUser||!currentProfile) return;
  const interests=Array.isArray(currentProfile.interests)?currentProfile.interests:[];
  if(interests.length<3 && !sessionStorage.getItem('bloom-onboarding-shown-'+currentUser.id)) {
    sessionStorage.setItem('bloom-onboarding-shown-'+currentUser.id,'1');
    openOnboarding();
  } else runPendingAction();
}
function runPendingAction() {
  if(pendingAction && currentUser) { const action=pendingAction; pendingAction=null; setTimeout(action,120); }
}
function refreshSignedInSurfaces() {
  loadOwnProfile().then(()=>{
    updateSignedInUI();
    if(currentView==='feed') loadFeed();
    if(currentView==='greenhouse') loadGreenhouse();
    if(currentView==='profile') loadGardenGrid();
    if(currentView==='notifications') loadNotifications();
  });
}
function onSession(user) {
  const changed=(currentUser?.id||null)!==(user?.id||null);
  currentUser=user||null;
  if(!currentUser) { currentProfile=null; closeActiveRealtime(); updateSignedInUI(); return; }
  loadOwnProfile().then(()=>{
    updateSignedInUI();
    if(changed) showOnboardingIfNeeded();
    refreshSignedInSurfaces();
  });
}
function initAuth() {
  if(!client)return;
  client.auth.onAuthStateChange((event,session)=>{
    currentUser=session?.user||null;
    Promise.resolve().then(async()=>{
      await loadOwnProfile(); updateSignedInUI(); subscribeNotifications();
      if(event==='SIGNED_OUT'){
        closeActiveRealtime();
        if(notificationChannel){client.removeChannel(notificationChannel).catch(()=>{});notificationChannel=null;}
      }
      if(event==='SIGNED_IN'||event==='INITIAL_SESSION') {
        if(currentProfile && (currentProfile.interests||[]).length<3 && !sessionStorage.getItem('bloom-onboarding-shown-'+currentUser.id)) {
          sessionStorage.setItem('bloom-onboarding-shown-'+currentUser.id,'1'); openOnboarding();
        } else runPendingAction();
      }
      refreshSignedInSurfaces();
    });
  });
  client.auth.getSession().then(async({data,error})=>{
    if(error) console.warn('[BLOOM] session restore:',error.message);
    currentUser=data?.session?.user||currentUser||null;
    await loadOwnProfile(); updateSignedInUI(); subscribeNotifications();
    if(currentUser && (currentProfile?.interests||[]).length<3 && !sessionStorage.getItem('bloom-onboarding-shown-'+currentUser.id)) {
      sessionStorage.setItem('bloom-onboarding-shown-'+currentUser.id,'1'); openOnboarding();
    }
  });
}
function openAuthModal(mode='signin') {
  let selectedMode=mode;
  openModal('Welcome to BLOOM','Browse the Wild Feed freely. Sign in when you are ready to grow your own garden.',body=>{
    const form=document.createElement('form'); form.className='form-stack';
    const modeRow=document.createElement('div'); modeRow.className='form-actions';
    const signIn=button('Sign in','button button-soft button-small',()=>setMode('signin'));
    const signUp=button('Create account','button button-soft button-small',()=>setMode('signup'));
    modeRow.append(signIn,signUp);
    const fields=document.createElement('div'); fields.className='form-stack';
    const status=document.createElement('div'); status.className='inline-status'; status.setAttribute('role','status');
    function setMode(next) {
      selectedMode=next; fields.replaceChildren(); signIn.className='button '+(next==='signin'?'button-primary':'button-soft')+' button-small';
      signUp.className='button '+(next==='signup'?'button-primary':'button-soft')+' button-small';
      const emailLabel=document.createElement('label'); emailLabel.textContent='Email';
      const email=document.createElement('input'); email.type='email'; email.name='email'; email.required=true; email.autocomplete='email'; email.placeholder='you@example.com'; emailLabel.append(email);
      const passwordLabel=document.createElement('label'); passwordLabel.textContent='Password';
      const password=document.createElement('input'); password.type='password'; password.name='password'; password.required=true; password.minLength=8; password.autocomplete=next==='signin'?'current-password':'new-password'; password.placeholder='At least 8 characters'; passwordLabel.append(password);
      fields.append(emailLabel,passwordLabel);
      if(next==='signin') {
        const forgot=button('Forgot password?','inline-link',async()=>{
          if(!email.value.trim()){status.textContent='Enter your email first.';return;}
          const r=await client.auth.resetPasswordForEmail(email.value.trim(),{redirectTo:location.origin+location.pathname});
          status.textContent=r.error?'Password reset could not be requested. Please try again.':'Password reset instructions have been requested. Check your inbox.';
        }); fields.append(forgot);
      }
      const submit=document.createElement('button'); submit.type='submit'; submit.className='button button-primary'; submit.textContent=next==='signin'?'Sign in':'Create account';
      fields.append(submit);
      if(next==='signup') fields.append(Object.assign(document.createElement('small'),{className:'form-hint',textContent:'After signing up, choose at least three interests to personalise Your Mix.'}));
    }
    setMode(selectedMode);
    form.append(modeRow,fields,status);
    form.addEventListener('submit',async e=>{
      e.preventDefault(); const email=form.querySelector('[name=email]').value.trim(); const password=form.querySelector('[name=password]').value;
      const submit=form.querySelector('button[type=submit]'); submit.disabled=true; status.textContent=selectedMode==='signin'?'Signing in…':'Creating your account…';
      let result;
      if(selectedMode==='signin') result=await client.auth.signInWithPassword({email,password});
      else result=await client.auth.signUp({email,password});
      submit.disabled=false;
      if(result.error){status.textContent=authError(result.error);return;}
      if(selectedMode==='signup'&&!result.data.session){
        status.textContent='Your account has been created. Check your email to confirm it, then sign in. Your interest setup will appear after sign-in.';
        return;
      }
      currentUser=result.data.user||null; await loadOwnProfile(); updateSignedInUI(); clearModal();
      if(currentUser && (currentProfile?.interests||[]).length<3) openOnboarding(); else runPendingAction();
      refreshSignedInSurfaces();
    });
  });
}
function authError(error) {
  const msg=(error?.message||'').toLowerCase();
  if(msg.includes('invalid login')) return 'That email or password was not recognised. Try again.';
  if(msg.includes('already registered')||msg.includes('already been registered')) return 'An account already exists for this email. Try signing in.';
  if(msg.includes('password')) return 'Please use a password with at least 8 characters.';
  return error?.message||'We could not complete that request. Please try again.';
}
function openOnboarding() {
  if(!currentUser)return;
  openModal('Choose your interests','Pick at least three. You can update your choices any time in Settings.',body=>{
    const form=document.createElement('form');form.className='form-stack';
    const grid=document.createElement('div');grid.className='interest-choice-grid';
    const values=new Set(currentProfile?.interests||[]);
    INTERESTS.forEach(item=>{
      const label=document.createElement('label');label.className='interest-choice';
      const input=document.createElement('input');input.type='checkbox';input.value=item.key;input.checked=values.has(item.key);
      const text=document.createElement('span');text.textContent=item.emoji+' '+item.label;label.append(input,text);grid.append(label);
    });
    const status=document.createElement('div');status.className='inline-status';status.setAttribute('role','status');
    const submit=document.createElement('button');submit.className='button button-primary';submit.type='submit';submit.textContent='Grow my mix ✿';
    form.append(grid,status,submit);
    form.addEventListener('submit',async e=>{
      e.preventDefault();const chosen=$$('input:checked',grid).map(i=>i.value);
      if(chosen.length<3){status.textContent='Choose at least three interests to continue.';return;}
      submit.disabled=true;const r=await client.from('profiles').update({interests:chosen}).eq('id',currentUser.id);
      submit.disabled=false;if(r.error){status.textContent='We could not save your interests. Please try again.';return;}
      currentProfile.interests=chosen;clearModal();toast('Your Mix is ready to bloom ✿');loadFeed();runPendingAction();
    });
  });
}
function requireThreeInterests() {
  if((currentProfile?.interests||[]).length>=3)return true;
  pendingAction=null;openOnboarding();return false;
}

async function loadSamplePlants() {
  if(!client)return SAMPLE_FALLBACK.slice();
  try {
    const {data,error}=await client.from('sample_plants').select('id,creator_name,category,caption,emoji,art_key,created_at').order('created_at',{ascending:false}).limit(20);
    if(!error && data?.length) return data;
  } catch(_) {}
  return SAMPLE_FALLBACK.slice();
}
function filterPlants(rows) {
  let result=rows.slice();
  if(currentCategory==='mix') {
    const mix=currentProfile?.interests||[];
    if(mix.length) result=result.filter(p=>mix.includes(p.category));
  } else if(currentCategory!=='all') result=result.filter(p=>p.category===currentCategory);
  return result;
}
async function loadFeed() {
  if(isLoadingFeed)return;isLoadingFeed=true;
  setStatus('#feedStatus','Growing your feed…');
  samplePlants=await loadSamplePlants();
  let live=[];
  if(client) {
    try {
      const {data,error}=await client.from('posts')
        .select('id,user_id,author_id,image_url,media_url,filter_applied,caption,category,sunlight_count,likes_count,created_at,status')
        .eq('status','published').order('created_at',{ascending:false}).limit(60);
      if(error) throw error;
      const rows=data||[];
      const ids=[...new Set(rows.map(p=>p.user_id||p.author_id).filter(Boolean))];
      const profiles=new Map();
      if(ids.length) {
        const p=await client.from('profiles').select('id,username,avatar_url,is_private').in('id',ids);
        (p.data||[]).forEach(x=>profiles.set(x.id,x));
      }
      let mine=new Set();
      if(currentUser && rows.length) {
        const reactions=await client.from('post_reactions').select('post_id,reaction_type').eq('user_id',currentUser.id).in('post_id',rows.map(p=>p.id));
        if(!reactions.error) mine=new Set((reactions.data||[]).map(r=>r.post_id+':'+r.reaction_type));
      }
      live=rows.filter(p=>profiles.get(p.user_id||p.author_id)?.is_private===false || (currentUser&&(p.user_id||p.author_id)===currentUser.id))
        .map(p=>({...p,isSample:false,creator:profiles.get(p.user_id||p.author_id)?.username||'gardener',
          avatar_url:profiles.get(p.user_id||p.author_id)?.avatar_url||null,
          image_url:p.image_url||p.media_url,
          sunlight_count:Number(p.sunlight_count||0),likes_count:Number(p.likes_count||0),
          hearted:mine.has(p.id+':heart'),sunlit:mine.has(p.id+':sunlight')}));
    } catch(error) { setStatus('#feedStatus','Live Plants could not load. Sample inspiration is still available.'); console.warn('[BLOOM] feed load:',error.message); }
  }
  allPlants=live.concat(samplePlants.map(p=>({...p,isSample:true,creator:p.creator_name,avatar_url:null})));
  renderFeed();
  if(!live.length) setStatus('#feedStatus',client?'A few sample Plants to help the garden feel alive.':'Preview mode · sample Plants are shown until Supabase is connected.');
  else setStatus('#feedStatus',live.length+' community Plants · sample inspiration below');
  isLoadingFeed=false;
}
function renderFeed() {
  const holder=$('#feedList');if(!holder)return;holder.replaceChildren();
  const rows=filterPlants(allPlants);
  if(!rows.length){holder.append(emptyState('Your Mix is still growing. Choose more interests in Settings or switch to All.'));return;}
  rows.forEach(p=>holder.append(renderPlantCard(p)));
}
function emptyState(message) {
  const n=document.createElement('div');n.className='empty-state';n.textContent=message;return n;
}
function renderPlantCard(post) {
  const card=document.createElement('article');card.className='plant-card';card.dataset.postId=post.id;
  const media=document.createElement('div');media.className='plant-media';
  const category=categoryInfo(post.category);const tag=document.createElement('span');tag.className='plant-category';tag.textContent=category.label.toUpperCase();media.append(tag);
  if(post.image_url) {
    const img=document.createElement('img');img.src=safeUrl(post.image_url)||'';img.alt=post.caption||'BLOOM Plant';img.loading='lazy';
    if(post.filter_applied) {const f=FILTERS.find(x=>x.key===post.filter_applied);if(f&&f.css!=='none')img.style.filter=f.css;}
    media.append(img);
  } else {
    const art=document.createElement('div');art.className='sample-art '+(post.art_key||post.category||'flower');
    const emoji=document.createElement('span');emoji.className='sample-emoji';emoji.textContent=post.emoji||category.emoji;art.append(emoji);media.append(art);
  }
  const content=document.createElement('div');content.className='plant-content';
  const authorRow=document.createElement('div');authorRow.className='plant-author-row';
  authorRow.append(avatarNode(post.creator,post.avatar_url));
  if(!post.isSample && (post.user_id||post.author_id)) {
    authorRow.style.cursor='pointer';
    authorRow.addEventListener('click',()=>openPublicGarden(post.user_id||post.author_id,post.creator));
  }
  const names=document.createElement('div');const author=document.createElement('div');author.className='plant-author';author.textContent=post.creator||'BLOOM gardener';
  const when=document.createElement('div');when.className='plant-time';when.textContent=post.isSample?'Sample inspiration':ago(post.created_at);names.append(author,when);authorRow.append(names);
  const caption=document.createElement('p');caption.className='plant-caption';caption.textContent=post.caption||'A little moment from the garden.';
  const actions=document.createElement('div');actions.className='plant-actions';
  const sunlight=button('☀ '+formatCount(post.sunlight_count||0),'plant-action'+(post.sunlit?' sunlit':''),()=>handleReaction(post,'sunlight'));
  const heart=button((post.hearted?'♥':'♡')+' '+formatCount(post.likes_count||0),'plant-action'+(post.hearted?' active':''),()=>handleReaction(post,'heart'));
  const comments=button('◌ Comments','plant-action',()=>openComments(post));
  const spacer=document.createElement('span');spacer.className='plant-action spacer';
  const share=button('↗ Share','plant-action',()=>openShareDrawer(post));
  const safety=button('•••','plant-action safety-button',()=>openSafetyMenu(post));safety.setAttribute('aria-label','Safety menu');
  actions.append(sunlight,heart,comments,share,safety);
  content.append(authorRow,caption,actions);card.append(media,content);
  if(post.isSample){const sample=document.createElement('span');sample.className='sample-flag';sample.textContent='SAMPLE';media.append(sample);}
  return card;
}
async function handleReaction(post,type) {
  if(!requireAuth(()=>handleReaction(post,type)))return;
  if(!requireThreeInterests())return;
  if(post.isSample){toast('That is a sample Plant. Create your own Plant to receive community reactions.');return;}
  const existing=await client.from('post_reactions').select('post_id').eq('post_id',post.id).eq('user_id',currentUser.id).eq('reaction_type',type).maybeSingle();
  if(existing.error){toast('Could not update your reaction.');return;}
  let result;
  if(existing.data) result=await client.from('post_reactions').delete().eq('post_id',post.id).eq('user_id',currentUser.id).eq('reaction_type',type);
  else result=await client.from('post_reactions').insert({post_id:post.id,user_id:currentUser.id,reaction_type:type});
  if(result.error){toast('That reaction could not be saved. Please try again.');return;}
  await loadFeed();
  if(type==='sunlight')toast(existing.data?'Sunlight taken back.':'You sent a little sunlight ☀');
  else toast(existing.data?'Heart removed.':'A little heart sent ♡');
}
async function openPublicGarden(userId,username) {
  if(!userId)return;
  if(!requireAuth(()=>openPublicGarden(userId,username)))return;
  const r=await client.from('profiles').select('id,username,bio,avatar_url,is_private,sunlight_count').eq('id',userId).maybeSingle();
  if(r.error||!r.data){toast('This garden is private or unavailable.');return;}
  const profile=r.data;
  const [plants,gardeners,following,publicPosts]=await Promise.all([
    client.from('posts').select('id',{count:'exact',head:true}).eq('user_id',userId).eq('status','published'),
    client.from('follows').select('follower_id',{count:'exact',head:true}).eq('user_id',userId),
    client.from('follows').select('follower_id').eq('follower_id',currentUser.id).eq('user_id',userId).maybeSingle(),
    client.from('posts').select('id,image_url,media_url,category,caption').eq('user_id',userId).eq('status','published').order('created_at',{ascending:false}).limit(30)
  ]);
  openModal('@'+profile.username,'A little public corner in the BLOOM garden.',body=>{
    const row=document.createElement('div');row.className='profile-identity';
    row.append(avatarNode(profile.username,profile.avatar_url,'profile-avatar'));
    const copy=document.createElement('div');copy.className='profile-names';
    const strong=document.createElement('strong');strong.textContent='@'+profile.username;
    const bio=document.createElement('p');bio.textContent=profile.bio||'Growing a little world of interests.';
    copy.append(strong,bio);row.append(copy);
    const stats=document.createElement('div');stats.className='profile-stats';
    [['Plants',plants.count||0],['Sunlight',profile.sunlight_count||0],['Gardeners',gardeners.count||0]].forEach(([label,value])=>{
      const d=document.createElement('div');const s=document.createElement('strong');s.textContent=formatCount(value);
      const l=document.createElement('span');l.textContent=label;d.append(s,l);stats.append(d);
    });
    const follow=button(following.data?'Following':'＋ Follow','button button-primary',async()=>{
      if(following.data){
        const del=await client.from('follows').delete().eq('follower_id',currentUser.id).eq('user_id',userId);
        if(del.error){toast('Could not unfollow this gardener.');return;}
        follow.textContent='＋ Follow';following.data=null;
      }else{
        const add=await client.from('follows').insert({follower_id:currentUser.id,user_id:userId});
        if(add.error){toast(add.error.code==='23505'?'You already follow this gardener.':'Could not follow this gardener.');return;}
        follow.textContent='Following';following.data={follower_id:currentUser.id};
      }
    });
    const grid=document.createElement('div');grid.className='plant-grid';
    (publicPosts.data||[]).forEach(post=>{
      const tile=button('','',()=>openPlantViewer(post.id));const url=safeUrl(post.image_url||post.media_url);
      if(url){const img=document.createElement('img');img.src=url;img.alt=post.caption||'Plant';tile.append(img);}
      else{const art=document.createElement('span');art.className='grid-sample';art.textContent=categoryInfo(post.category).emoji;tile.append(art);}
      grid.append(tile);
    });
    body.append(row,stats,follow,grid);
  });
}
async function loadGardenGrid() {
  if(!currentUser){setStatus('#profileStatus','Sign in to grow your personal Garden Grid.');$('#profilePlants').textContent='—';$('#profileSunlight').textContent='—';$('#profileGardeners').textContent='—';$('#profilePlantGrid').replaceChildren(emptyState('Your Plants will appear here after you sign in.'));return;}
  const profile=await loadOwnProfile();if(!profile){setStatus('#profileStatus','Your profile is not available yet. Please refresh.');return;}
  setStatus('#profileStatus','Your garden is growing ✿');
  $('#profileUsername').textContent='@'+(profile.username||'gardener');
  $('#profileBio').textContent=profile.bio||'Your little corner of the internet.';
  const avatar=$('#profileAvatar');avatar.replaceChildren();const imgUrl=safeUrl(profile.avatar_url);
  if(imgUrl){const img=document.createElement('img');img.src=imgUrl;img.alt='Your profile photo';avatar.append(img);}else avatar.textContent=(profile.username||'G').slice(0,1).toUpperCase();
  const [posts,follows]=await Promise.all([
    client.from('posts').select('id,image_url,media_url,caption,category,created_at').eq('user_id',currentUser.id).eq('status','published').order('created_at',{ascending:false}).limit(100),
    client.from('follows').select('follower_id',{count:'exact',head:true}).eq('user_id',currentUser.id)
  ]);
  const myPosts=posts.data||[];
  $('#profilePlants').textContent=formatCount(myPosts.length);
  $('#profileSunlight').textContent=formatCount(profile.sunlight_count||0);
  $('#profileGardeners').textContent=formatCount(follows.count||0);
  const interestHolder=$('#profileInterests');interestHolder.replaceChildren();
  (profile.interests||[]).forEach(key=>{const chip=document.createElement('span');chip.className='profile-interest-chip';chip.textContent=categoryInfo(key).emoji+' '+categoryInfo(key).label;interestHolder.append(chip);});
  if(!(profile.interests||[]).length) interestHolder.append(Object.assign(document.createElement('span'),{className:'muted-copy',textContent:'Choose your interests in Settings.'}));
  const grid=$('#profilePlantGrid');grid.replaceChildren();
  myPosts.forEach(post=>{
    const b=button('','',()=>openPlantViewer(post.id));
    const url=safeUrl(post.image_url||post.media_url);
    if(url){const img=document.createElement('img');img.src=url;img.alt=post.caption||'Your Plant';img.loading='lazy';b.append(img);}
    else {const p=document.createElement('span');p.className='grid-sample';p.textContent=categoryInfo(post.category).emoji;b.append(p);}
    grid.append(b);
  });
  if(!myPosts.length)grid.append(emptyState('Your first Plant is waiting to be shared. Tap + to create one.'));
}
async function openPlantViewer(postId) {
  const {data,error}=await client.from('posts').select('id,user_id,image_url,media_url,caption,category,filter_applied,sunlight_count,likes_count,created_at').eq('id',postId).maybeSingle();
  if(error||!data){toast('This Plant is no longer available.');return;}
  const profile=await client.from('profiles').select('username').eq('id',data.user_id).maybeSingle();
  const p={...data,creator:profile.data?.username||'gardener',isSample:false};
  openModal('A little Plant','Shared in the BLOOM garden.',body=>{body.append(renderPlantCard(p));});
}

async function openComments(post) {
  if(!requireAuth(()=>openComments(post)))return;
  if(post.isSample){toast('Sample Plants are previews. Comments open on community Plants.');return;}
  openModal('Comments','Share something kind, helpful, or encouraging.',body=>{
    const list=document.createElement('div');list.className='comment-list';list.id='commentList';
    const form=document.createElement('form');form.className='chat-compose';
    const input=document.createElement('input');input.placeholder='Write a comment…';input.maxLength=500;input.required=true;
    const send=document.createElement('button');send.type='submit';send.textContent='↑';form.append(input,send);
    const status=document.createElement('div');status.className='inline-status';
    form.addEventListener('submit',async e=>{
      e.preventDefault();const content=input.value.trim();if(!content)return;
      send.disabled=true;
      const r=await client.from('post_comments').insert({post_id:post.id,user_id:currentUser.id,author_id:currentUser.id,content,body:content,status:'published'});
      send.disabled=false;
      if(r.error){status.textContent='Your comment could not be sent. Please try again.';return;}
      input.value='';await renderComments(post,list);toast('Comment planted ✿');
    });
    body.append(list,form,status);renderComments(post,list);
  });
}
async function renderComments(post,holder) {
  holder.replaceChildren();const r=await client.from('post_comments').select('id,user_id,author_id,content,body,created_at').eq('post_id',post.id).eq('status','published').order('created_at',{ascending:true}).limit(100);
  if(r.error){holder.append(emptyState('Comments could not load.'));return;}
  const rows=r.data||[];const ids=[...new Set(rows.map(x=>x.user_id||x.author_id))];const names=new Map();
  if(ids.length){const p=await client.from('profiles').select('id,username,avatar_url').in('id',ids);(p.data||[]).forEach(x=>names.set(x.id,x));}
  if(!rows.length){holder.append(emptyState('No comments yet. Start with a kind little note.'));return;}
  rows.forEach(row=>{
    const profile=names.get(row.user_id||row.author_id)||{username:'gardener'};
    const item=document.createElement('div');item.className='comment-item';item.append(avatarNode(profile.username,profile.avatar_url));
    const copy=document.createElement('div');const strong=document.createElement('strong');strong.textContent='@'+profile.username;
    const p=document.createElement('p');p.textContent=row.content||row.body;copy.append(strong,p);item.append(copy);holder.append(item);
  });
}
function openSafetyMenu(post) {
  if(post.isSample){toast('Sample inspiration is provided by BLOOM.');return;}
  openModal('Keep the garden kind','Choose how to handle this Plant.',body=>{
    const report=button('Report this Plant','button button-soft',()=>openReportForm(post));
    const block=button('Block @'+(post.creator||'gardener'),'button button-soft',()=>blockUser(post.user_id||post.author_id,post.creator));
    body.append(report,block);
  });
}
function openReportForm(post) {
  if(!requireAuth(()=>openReportForm(post)))return;
  openModal('Report this Plant','Reports go to BLOOM moderation for review.',body=>{
    const form=document.createElement('form');form.className='form-stack';
    const label=document.createElement('label');label.textContent='Reason';
    const select=document.createElement('select');['Spam or scam','Harassment or bullying','Hate or harmful content','Copyright or impersonation','Other safety concern'].forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;select.append(o);});label.append(select);
    const detailLabel=document.createElement('label');detailLabel.textContent='Details (optional)';
    const details=document.createElement('textarea');details.maxLength=1000;details.placeholder='Add any context that may help our moderators.';detailLabel.append(details);
    const status=document.createElement('div');status.className='inline-status';
    const submit=document.createElement('button');submit.className='button button-primary';submit.type='submit';submit.textContent='Send report';
    form.append(label,detailLabel,submit,status);
    form.addEventListener('submit',async e=>{e.preventDefault();submit.disabled=true;const r=await client.from('reports').insert({reporter_id:currentUser.id,target_type:'post',target_id:post.id,reason:select.value,details:details.value.trim()||null});submit.disabled=false;if(r.error){status.textContent='Report could not be submitted. Please try again.';return;}clearModal();toast('Thank you. Your report was sent.');});
    body.append(form);
  });
}
async function blockUser(userId,username) {
  if(!requireAuth(()=>blockUser(userId,username)))return;
  if(userId===currentUser.id){toast('You cannot block your own account.');return;}
  if(!window.confirm('Block @'+(username||'this gardener')+'? Their Plants and messages will be hidden from your garden.'))return;
  const r=await client.from('blocked_users').insert({blocker_id:currentUser.id,blocked_id:userId});
  if(r.error && r.error.code!=='23505'){toast('Could not block this account.');return;}
  clearModal();toast('Account blocked. You can unblock them in Settings.');
  loadFeed();loadGreenhouse();
}

async function openShareDrawer(post) {
  if(!requireAuth(()=>openShareDrawer(post)))return;
  if(post.isSample){toast('Sample Plants cannot be sent in a private chat.');return;}
  selectedSharePost=post;
  openModal('Share this Plant','Choose a recent DM or an Interest Circle.',async body=>{
    const status=document.createElement('div');status.className='inline-status';status.textContent='Loading your conversations…';body.append(status);
    const targets=await getShareTargets();
    status.textContent='';
    if(!targets.length){body.append(emptyState('You have not joined a circle or started a DM yet. Open The Greenhouse to find your people.'));return;}
    targets.forEach(target=>{
      const row=button('','dm-row',async()=>{
        row.disabled=true;const result=await sendPlantShare(post,target.id);
        row.disabled=false;if(result){clearModal();toast('Sent! Your Plant is on its way.');}
      });
      const icon=document.createElement('span');icon.className='circle-symbol';icon.textContent=target.is_dm?'✉':categoryInfo(target.category).emoji;
      const info=document.createElement('span');info.className='circle-meta';const strong=document.createElement('strong');strong.textContent=target.name;const small=document.createElement('small');small.textContent=target.is_dm?'Direct message':'Interest Circle';info.append(strong,small);
      const send=document.createElement('span');send.className='text-button';send.textContent='Send ↗';row.append(icon,info,send);body.append(row);
    });
  });
}
async function getShareTargets() {
  const mine=await client.from('circle_members').select('circle_id').eq('user_id',currentUser.id);
  if(mine.error||!mine.data?.length)return [];
  const ids=mine.data.map(x=>x.circle_id);
  const c=await client.from('circles').select('id,name,category,is_dm,created_at').in('id',ids).order('created_at',{ascending:false}).limit(30);
  if(c.error)return [];
  const rows=c.data||[];
  const dms=rows.filter(x=>x.is_dm);
  const otherIds=[];
  if(dms.length){
    const members=await client.from('circle_members').select('circle_id,user_id').in('circle_id',dms.map(x=>x.id)).neq('user_id',currentUser.id);
    (members.data||[]).forEach(x=>otherIds.push(x.user_id));
  }
  const unique=[...new Set(otherIds)], profiles=new Map();
  if(unique.length){const p=await client.from('profiles').select('id,username').in('id',unique);(p.data||[]).forEach(x=>profiles.set(x.id,x));}
  const dmTargets=dms.map(circle=>{
    return {id:circle.id,is_dm:true,name:'Direct message'};
  });
  if(dms.length){
    const members=await client.from('circle_members').select('circle_id,user_id').in('circle_id',dms.map(x=>x.id)).neq('user_id',currentUser.id);
    const byCircle=new Map((members.data||[]).map(x=>[x.circle_id,x.user_id]));
    dmTargets.forEach(t=>t.name='@'+(profiles.get(byCircle.get(t.id))?.username||'gardener'));
  }
  return rows.filter(x=>!x.is_dm).map(x=>({id:x.id,is_dm:false,name:x.name,category:x.category})).concat(dmTargets);
}
async function sendPlantShare(post,circleId) {
  const content='Sent!';
  const r=await client.from('messages').insert({
    circle_id:circleId,sender_id:currentUser.id,message_type:'post_share',content,shared_post_id:post.id,
    author_id:currentUser.id,body:content,group_id:null
  });
  if(r.error){toast('That Plant could not be shared. Check you are still a member of the chat.');return false;}
  return true;
}

async function loadGreenhouse() {
  if(!currentUser){setStatus('#greenhouseStatus','Sign in to enter The Greenhouse.');return;}
  const circleList=$('#circleList'), dmList=$('#dmList');
  circleList.replaceChildren(Object.assign(document.createElement('div'),{className:'loading-skeleton'}));
  const [publicCircles,membership]=await Promise.all([
    client.from('circles').select('id,name,category,description,is_dm,created_at').eq('is_dm',false).order('created_at',{ascending:false}).limit(80),
    client.from('circle_members').select('circle_id').eq('user_id',currentUser.id)
  ]);
  const circles=publicCircles.error?CIRCLE_FALLBACK:(publicCircles.data||[]);
  const myIds=(membership.data||[]).map(x=>x.circle_id);
  const memberIds=new Set(myIds);
  circleList.replaceChildren();
  circles.forEach(circle=>circleList.append(renderCircleCard(circle,memberIds.has(circle.id))));
  if(!circles.length)circleList.append(emptyState('No circles yet. Your interest communities will appear here.'));
  dmList.replaceChildren();
  if(myIds.length){
    const conversations=await client.from('circles').select('id,name,category,is_dm,created_at').in('id',myIds).eq('is_dm',true).order('created_at',{ascending:false});
    const dms=conversations.data||[];
    if(dms.length){
      const allMembers=await client.from('circle_members').select('circle_id,user_id').in('circle_id',dms.map(x=>x.id)).neq('user_id',currentUser.id);
      const otherIds=[...new Set((allMembers.data||[]).map(x=>x.user_id))], names=new Map();
      if(otherIds.length){const p=await client.from('profiles').select('id,username,avatar_url').in('id',otherIds);(p.data||[]).forEach(x=>names.set(x.id,x));}
      const otherByCircle=new Map((allMembers.data||[]).map(x=>[x.circle_id,x.user_id]));
      dms.forEach(dm=>dmList.append(renderDmRow(dm,names.get(otherByCircle.get(dm.id))?.username||'Gardener')));
    }
  }
  if(!dmList.children.length)dmList.append(emptyState('Your one-to-one conversations will appear here. Search for a gardener to start a DM.'));
  setStatus('#greenhouseStatus','Your people, your circles, and your conversations.');
  renderGreenhousePanels();
}
function renderCircleCard(circle,isMember) {
  const card=document.createElement('article');card.className='circle-card';
  const icon=document.createElement('span');icon.className='circle-symbol';icon.textContent=categoryInfo(circle.category).emoji;
  const meta=document.createElement('div');meta.className='circle-meta';const title=document.createElement('strong');title.textContent=circle.name;
  const desc=document.createElement('small');desc.textContent=circle.description||categoryInfo(circle.category).label+' community';meta.append(title,desc);
  const actions=document.createElement('div');actions.className='circle-actions';
  const tag=document.createElement('span');tag.className='soft-count';tag.textContent=isMember?'Joined':'Open';
  const action=button(circle.sample?'Preview':(isMember?'Open':'Join'),'button button-soft button-small',async()=>{
    if(circle.sample){openSampleCircle(circle);return;}
    if(!requireAuth(()=>loadGreenhouse()))return;
    if(!isMember){const r=await client.from('circle_members').insert({circle_id:circle.id,user_id:currentUser.id,role:'member'});if(r.error&&r.error.code!=='23505'){toast('Could not join this circle.');return;}toast('Welcome to '+circle.name+' ✿');}
    await loadGreenhouse();openCircleChat(circle);
  });
  actions.append(tag,action);card.append(icon,meta,actions);return card;
}
function renderDmRow(circle,username) {
  const b=button('','dm-row',()=>openCircleChat(circle,true,username));
  b.append(avatarNode(username,null));const meta=document.createElement('span');meta.className='circle-meta';
  const strong=document.createElement('strong');strong.textContent='@'+username;
  const small=document.createElement('small');small.textContent='Private conversation';meta.append(strong,small);b.append(meta);return b;
}
function renderGreenhousePanels() {
  const search=($('#greenhouseSearch')?.value||'').toLowerCase().trim();
  const circles=$('#circlesPanel'),dms=$('#dmsPanel');
  if(circles)circles.hidden=greenhouseTab!=='circles';
  if(dms)dms.hidden=greenhouseTab!=='dms';
  const target=greenhouseTab==='circles'?$('#circleList'):$('#dmList');
  if(target && search) $$('.circle-card,.dm-row',target).forEach(n=>n.hidden=!n.textContent.toLowerCase().includes(search));
}
async function startNewDm() {
  if(!requireAuth(()=>startNewDm()))return;
  openModal('Find a gardener','Search public profiles by username to start a private one-to-one conversation.',body=>{
    const form=document.createElement('form');form.className='form-stack';
    const label=document.createElement('label');label.textContent='Search gardeners';
    const input=document.createElement('input');input.type='search';input.placeholder='Type a username…';input.autocomplete='off';label.append(input);
    const results=document.createElement('div');results.className='dm-list';
    const status=document.createElement('div');status.className='inline-status';form.append(label,results,status);body.append(form);
    let timer=null;
    input.addEventListener('input',()=>{
      clearTimeout(timer);timer=setTimeout(async()=>{
        const q=input.value.trim();results.replaceChildren();if(q.length<2){status.textContent='Enter at least two characters.';return;}
        status.textContent='Searching…';const r=await client.from('profiles').select('id,username,bio,avatar_url').ilike('username','%'+q+'%').neq('id',currentUser.id).limit(12);
        if(r.error){status.textContent='Search is unavailable. Try again.';return;}
        status.textContent=r.data?.length?'Choose someone to start a DM.':'No public gardeners found.';
        (r.data||[]).forEach(profile=>{
          const b=button('','dm-row',async()=>{
            b.disabled=true;const dm=await client.rpc('bloom_create_dm',{target_user_id:profile.id});b.disabled=false;
            if(dm.error){status.textContent='Could not start a DM. The database migration may still be pending.';return;}
            clearModal();const circle={id:dm.data,name:'@'+profile.username,is_dm:true,category:'general'};
            openCircleChat(circle,true,profile.username);
          });
          b.append(avatarNode(profile.username,profile.avatar_url));const meta=document.createElement('span');meta.className='circle-meta';const strong=document.createElement('strong');strong.textContent='@'+profile.username;const small=document.createElement('small');small.textContent=profile.bio||'BLOOM gardener';meta.append(strong,small);b.append(meta,document.createTextNode('Message ↗'));results.append(b);
        });
      },230);
    });
  });
}
async function openCircleChat(circle,isDm=false,dmUsername='Gardener') {
  if(!requireAuth(()=>openCircleChat(circle,isDm,dmUsername)))return;
  activeChat=circle;
  openModal(circle.name||'Conversation',isDm?'A private conversation between gardeners.':'An Interest Circle for people who share this interest.',body=>{
    const status=document.createElement('div');status.className='inline-status';status.textContent='Loading conversation…';
    const messages=document.createElement('div');messages.className='chat-messages';messages.id='activeChatMessages';
    const form=document.createElement('form');form.className='chat-compose';
    const input=document.createElement('input');input.placeholder='Write a message…';input.maxLength=1000;
    const imageInput=document.createElement('input');imageInput.type='file';imageInput.accept='image/jpeg,image/png,image/webp,image/avif';imageInput.className='file-input';imageInput.setAttribute('aria-label','Attach an image');
    const attach=button('＋','button button-soft button-small',()=>imageInput.click());attach.setAttribute('aria-label','Attach image');
    const send=document.createElement('button');send.type='submit';send.textContent='↑';form.append(input,attach,send,imageInput);
    body.append(status,messages,form);
    imageInput.addEventListener('change',async()=>{
      const file=imageInput.files?.[0];if(!file)return;
      if(!file.type.startsWith('image/')||file.size>12*1024*1024){status.textContent='Choose an image under 12 MB.';imageInput.value='';return;}
      attach.disabled=true;status.textContent='Uploading image…';
      try{
        const blob=await applyPhotoFilter(file,'original');const path=currentUser.id+'/chat/'+crypto.randomUUID()+'.webp';
        const up=await client.storage.from('bloom-media').upload(path,blob,{contentType:'image/webp',upsert:false});
        if(up.error)throw up.error;
        const url=client.storage.from('bloom-media').getPublicUrl(path).data.publicUrl;
        const saved=await client.from('messages').insert({circle_id:circle.id,sender_id:currentUser.id,message_type:'image',content:url,author_id:currentUser.id,body:url,group_id:null});
        if(saved.error){await client.storage.from('bloom-media').remove([path]);throw saved.error;}
        imageInput.value='';status.textContent='Image shared.';
      }catch(error){status.textContent='Image could not be shared. Check your Storage policies.';}
      attach.disabled=false;
    });
    loadChatMessages(circle,messages,status);
    chatChannel=client.channel('bloom-chat-'+circle.id).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:'circle_id=eq.'+circle.id},payload=>{
      if(activeChat?.id===circle.id) appendChatMessage(payload.new,messages);
    }).subscribe();
    form.addEventListener('submit',async e=>{
      e.preventDefault();const content=input.value.trim();if(!content)return;send.disabled=true;
      const r=await client.from('messages').insert({circle_id:circle.id,sender_id:currentUser.id,message_type:'text',content,author_id:currentUser.id,body:content,group_id:null});
      send.disabled=false;if(r.error){status.textContent='Message could not be sent. Check your membership or connection.';return;}
      input.value='';
    });
  });
}
async function loadChatMessages(circle,holder,status) {
  const r=await client.from('messages').select('id,circle_id,sender_id,message_type,content,shared_post_id,created_at').eq('circle_id',circle.id).order('created_at',{ascending:true}).limit(100);
  holder.replaceChildren();
  if(r.error){status.textContent='Could not load messages. Check your circle membership.';return;}
  status.textContent='Connected · be kind and let everyone bloom.';
  for(const message of (r.data||[])) await appendChatMessage(message,holder,true);
  holder.scrollTop=holder.scrollHeight;
  if(!r.data?.length){const empty=document.createElement('div');empty.className='inline-status';empty.textContent='Say hello and plant the first message ✿';holder.append(empty);}
}
async function appendChatMessage(message,holder,loadShared=false) {
  const mine=message.sender_id===currentUser?.id;
  const node=document.createElement('div');node.className='chat-message'+(mine?' mine':'');
  let senderName=mine?'You':'Gardener';
  if(!mine && message.sender_id) {
    const sender=await client.from('profiles').select('username').eq('id',message.sender_id).maybeSingle();
    if(sender.data?.username)senderName='@'+sender.data.username;
  }
  const who=document.createElement('small');who.textContent=senderName;
  node.append(who);
  if(message.message_type==='post_share' && message.shared_post_id) {
    node.append(document.createTextNode(message.content||'Sent!'));
    const {data}=await client.from('posts').select('id,image_url,media_url,caption,category').eq('id',message.shared_post_id).maybeSingle();
    if(data){
      const preview=document.createElement('button');preview.type='button';preview.className='shared-post-preview';
      const img=document.createElement('img');img.src=safeUrl(data.image_url||data.media_url)||'';img.alt='Shared Plant';img.loading='lazy';
      const copy=document.createElement('span');const title=document.createElement('strong');title.textContent=data.caption||'A shared Plant';
      const creator=await client.from('profiles').select('username').eq('id',data.user_id).maybeSingle();
      const small=document.createElement('small');small.textContent='@'+(creator.data?.username||'gardener')+' · '+categoryInfo(data.category).label+' · Tap to view';copy.append(title,small);preview.append(img,copy);
      preview.addEventListener('click',()=>openSharedPostViewer(message.shared_post_id));
      node.append(preview);
    }
  } else if(message.message_type==='image') {
    const url=safeUrl(message.content);if(url){const img=document.createElement('img');img.src=url;img.alt='Shared image';img.style.maxWidth='100%';img.style.borderRadius='10px';node.append(img);}
  } else node.append(document.createTextNode(message.content||''));
  holder.append(node);holder.scrollTop=holder.scrollHeight;
}
async function openSharedPostViewer(postId) {
  const {data,error}=await client.from('posts').select('id,user_id,image_url,media_url,caption,category,likes_count,sunlight_count,created_at').eq('id',postId).maybeSingle();
  if(error||!data){toast('That shared Plant is unavailable.');return;}
  const profile=await client.from('profiles').select('username,avatar_url').eq('id',data.user_id).maybeSingle();
  const overlay=document.createElement('div');overlay.className='modal-overlay post-viewer-overlay';
  const sheet=document.createElement('section');sheet.className='modal-sheet';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');
  const head=document.createElement('div');head.className='modal-head';const heading=document.createElement('div');const h=document.createElement('h2');h.textContent='Shared Plant';const p=document.createElement('p');p.textContent='A little moment from your conversation.';heading.append(h,p);
  const back=button('←','modal-close',()=>overlay.remove());back.setAttribute('aria-label','Back to chat');head.append(heading,back);
  const image=document.createElement('img');image.src=safeUrl(data.image_url||data.media_url)||'';image.alt=data.caption||'Shared Plant';image.style.width='100%';image.style.maxHeight='55vh';image.style.objectFit='contain';image.style.borderRadius='16px';image.style.background='var(--nude)';
  const caption=document.createElement('p');caption.className='plant-caption';caption.style.marginTop='12px';caption.textContent=data.caption||'';
  const author=document.createElement('div');author.className='inline-status';author.textContent='@'+(profile.data?.username||'gardener');
  const actions=document.createElement('div');actions.className='form-actions';
  const sunlight=button('☀ Send sunlight','button button-soft',async()=>{if(!requireAuth(()=>openSharedPostViewer(postId)))return;const r=await client.from('post_reactions').insert({post_id:postId,user_id:currentUser.id,reaction_type:'sunlight'});if(r.error&&r.error.code!=='23505')toast('Could not send sunlight.');else toast('A little sunlight sent ☀');});
  const heart=button('♡ Like','button button-soft',async()=>{if(!requireAuth(()=>openSharedPostViewer(postId)))return;const r=await client.from('post_reactions').insert({post_id:postId,user_id:currentUser.id,reaction_type:'heart'});if(r.error&&r.error.code!=='23505')toast('Could not like this Plant.');else toast('A little heart sent ♡');});
  const comment=button('◌ Comment','button button-soft',()=>openComments({...data,isSample:false}));
  const close=button('Back to chat','button button-primary',()=>overlay.remove());
  actions.append(sunlight,heart,comment,close);
  sheet.append(head,author,image,caption,actions);overlay.append(sheet);
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
  $('#modalRoot').append(overlay);
}

async function loadNotifications() {
  if(!currentUser)return;
  const holder=$('#notificationList');holder.replaceChildren();
  const r=await client.from('notifications').select('id,user_id,actor_id,type,post_id,is_read,created_at,body').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(80);
  if(r.error){setStatus('#notificationsStatus','Notifications could not load.');return;}
  const rows=r.data||[];const actors=[...new Set(rows.map(x=>x.actor_id).filter(Boolean))];const names=new Map();
  if(actors.length){const p=await client.from('profiles').select('id,username').in('id',actors);(p.data||[]).forEach(x=>names.set(x.id,x.username));}
  setStatus('#notificationsStatus',rows.length?rows.filter(x=>!x.is_read).length+' unread signals':'Your garden is quiet for now.');
  rows.forEach(item=>{
    const row=document.createElement('article');row.className='notification-item'+(!item.is_read?' unread':'');
    const icon=document.createElement('span');icon.className='notification-icon';icon.textContent=item.type==='sunlight'?'☀':item.type==='like'?'♡':item.type==='comment'?'◌':'↗';
    const copy=document.createElement('span');copy.className='notification-copy';const strong=document.createElement('strong');strong.textContent=item.body||('@'+(names.get(item.actor_id)||'gardener')+' sent a garden signal.');
    const p=document.createElement('p');p.textContent='@'+(names.get(item.actor_id)||'gardener')+' · '+ago(item.created_at);copy.append(strong,p);
    const time=document.createElement('span');time.className='notification-time';time.textContent=item.is_read?'Read':'New';
    row.append(icon,copy,time);
    row.addEventListener('click',async()=>{
      if(!item.is_read){await client.from('notifications').update({is_read:true,read_at:new Date().toISOString()}).eq('id',item.id);item.is_read=true;row.classList.remove('unread');time.textContent='Read';}
      if(item.post_id)openPlantViewer(item.post_id);
    });
    holder.append(row);
  });
  if(!rows.length)holder.append(emptyState('When someone gives your Plant sunlight, leaves a comment, or shares a moment, you’ll see it here.'));
  const dot=$('#notificationDot');if(dot)dot.hidden=!rows.some(x=>!x.is_read);
}
async function markAllNotificationsRead() {
  if(!requireAuth(()=>markAllNotificationsRead()))return;
  const r=await client.from('notifications').update({is_read:true,read_at:new Date().toISOString()}).eq('user_id',currentUser.id).eq('is_read',false);
  if(r.error){toast('Could not mark notifications as read.');return;}
  loadNotifications();toast('All caught up ✿');
}
function subscribeNotifications() {
  if(notificationChannel&&client){client.removeChannel(notificationChannel).catch(()=>{});notificationChannel=null;}
  if(!client||!currentUser)return;
  notificationChannel=client.channel('bloom-notifications-'+currentUser.id)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:'user_id=eq.'+currentUser.id},payload=>{
      if(notificationAlertsEnabled)toast(payload.new.body||'A new garden signal arrived ✿');
      if(currentView==='notifications')loadNotifications();
      else $('#notificationDot').hidden=false;
    }).subscribe();
}

async function openCreateStudio() {
  if(!requireAuth(()=>openCreateStudio()))return;
  if(!requireThreeInterests())return;
  studioFile=null;studioFilter='original';
  openModal('Create a Plant','Take a photo or upload one, add a little filter, and share it with your interest garden.',body=>{
    const preview=document.createElement('div');preview.className='studio-preview';preview.id='studioPreview';
    preview.append(Object.assign(document.createElement('span'),{className:'studio-placeholder',textContent:'✿'}));
    const fileActions=document.createElement('div');fileActions.className='file-actions';
    const camera=button('Use camera','button button-soft',()=>startCamera(preview,status));
    const gallery=button('Upload photo','button button-soft',()=>galleryInput.click());
    const captureInput=document.createElement('input');captureInput.type='file';captureInput.accept='image/*';captureInput.capture='environment';captureInput.className='file-input';
    const galleryInput=document.createElement('input');galleryInput.type='file';galleryInput.accept='image/jpeg,image/png,image/webp,image/avif';galleryInput.className='file-input';
    captureInput.addEventListener('change',()=>{if(captureInput.files?.[0])setStudioFile(captureInput.files[0],preview);});
    galleryInput.addEventListener('change',()=>{if(galleryInput.files?.[0])setStudioFile(galleryInput.files[0],preview);});
    const useCapture=button('Open device camera','button button-soft',()=>captureInput.click());
    fileActions.append(camera,useCapture,gallery,captureInput,galleryInput);
    const filterRow=document.createElement('div');filterRow.className='filter-row';
    FILTERS.forEach(f=>{
      const b=button(f.label,'filter-chip'+(f.key===studioFilter?' selected':''),()=>{
        studioFilter=f.key;$$('.filter-chip',filterRow).forEach(x=>x.classList.toggle('selected',x.dataset.filter===f.key));
        $$('.filter-chip',filterRow).forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.filter===f.key)));
        const img=$('#studioPreview img');if(img)img.style.filter=f.css;
      });b.dataset.filter=f.key;b.setAttribute('aria-pressed',String(f.key===studioFilter));filterRow.append(b);
    });
    const form=document.createElement('form');form.className='form-stack';
    const captionLabel=document.createElement('label');captionLabel.textContent='Caption';
    const caption=document.createElement('textarea');caption.name='caption';caption.maxLength=2000;caption.required=true;caption.placeholder='What would you like to share with the garden?';captionLabel.append(caption);
    const categoryLabel=document.createElement('label');categoryLabel.textContent='Interest category';
    const category=document.createElement('select');category.name='category';INTERESTS.forEach(i=>{const o=document.createElement('option');o.value=i.key;o.textContent=i.emoji+' '+i.label;category.append(o);});category.value=(currentProfile?.interests||[])[0]||'art';categoryLabel.append(category);
    const status=document.createElement('div');status.className='inline-status';status.id='studioStatus';
    const submit=document.createElement('button');submit.className='button button-primary';submit.type='submit';submit.textContent='Publish Plant ✿';
    form.append(captionLabel,categoryLabel,status,submit);
    body.append(preview,fileActions,filterRow,form);
    form.addEventListener('submit',async e=>{
      e.preventDefault();if(!studioFile){status.textContent='Add a photo before publishing your Plant.';return;}
      const cap=caption.value.trim();if(!cap){status.textContent='Write a little caption first.';return;}
      submit.disabled=true;status.textContent='Preparing your photo…';
      try{
        const blob=await applyPhotoFilter(studioFile,studioFilter);
        const ext='webp';const path=currentUser.id+'/plants/'+crypto.randomUUID()+'.'+ext;
        const upload=await client.storage.from('bloom-media').upload(path,blob,{contentType:'image/webp',upsert:false,cacheControl:'31536000'});
        if(upload.error)throw upload.error;
        const imageUrl=client.storage.from('bloom-media').getPublicUrl(path).data.publicUrl;
        const chosen=category.value;const title=cap.slice(0,90)||'A little Plant';
        const insert=await client.from('posts').insert({
          user_id:currentUser.id,author_id:currentUser.id,image_url:imageUrl,media_url:imageUrl,
          filter_applied:studioFilter,caption:cap,category:chosen,sunlight_count:0,likes_count:0,
          title,body:cap,fandom:chosen,status:'published',link:null,media_type:'image'
        });
        if(insert.error){await client.storage.from('bloom-media').remove([path]);throw insert.error;}
        clearModal();toast('Your Plant is in the garden ✿');showView('feed');await loadFeed();await loadGardenGrid();
      }catch(error){console.error('[BLOOM] publish:',error);status.textContent='Your Plant could not be published. Check the database migration and bloom-media Storage policies.';submit.disabled=false;}
    });
  });
}
async function startCamera(preview,status) {
  if(!navigator.mediaDevices?.getUserMedia){status.textContent='This browser does not support direct camera access. Use “Open device camera” instead.';return;}
  try{
    stopCamera();
    cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    preview.replaceChildren();const video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;video.srcObject=cameraStream;preview.append(video);video.style.width='100%';video.style.height='100%';video.style.objectFit='cover';
    const capture=button('Capture photo','button button-primary',()=>{
      const canvas=document.createElement('canvas');canvas.width=video.videoWidth||1200;canvas.height=video.videoHeight||1500;
      canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
      canvas.toBlob(blob=>{if(blob){const file=new File([blob],'bloom-camera.webp',{type:'image/webp'});stopCamera();setStudioFile(file,preview);status.textContent='Photo captured. Choose a filter and add your caption.';}},'image/webp',.92);
    });
    const holder=document.createElement('div');holder.className='file-actions';holder.append(capture);preview.parentElement.insertBefore(holder,preview.nextSibling);
    status.textContent='Camera ready. Take your photo when you are happy with the frame.';
  }catch(error){status.textContent='Camera access was not granted. You can upload a photo or use your device camera picker.';console.warn('[BLOOM] camera:',error.message);}
}
function setStudioFile(file,preview) {
  if(!file||!file.type.startsWith('image/')){toast('Choose an image file.');return;}
  if(file.size>25*1024*1024){toast('Choose an image under 25 MB.');return;}
  studioFile=file;revokeStudioUrl();studioObjectUrl=URL.createObjectURL(file);
  preview.replaceChildren();const img=document.createElement('img');img.src=studioObjectUrl;img.alt='Photo preview';img.style.filter=FILTERS.find(f=>f.key===studioFilter)?.css||'none';preview.append(img);
}
async function applyPhotoFilter(file,filterKey) {
  const image=await createImageBitmap(file);
  const max=1800,scale=Math.min(1,max/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
  const ctx=canvas.getContext('2d');ctx.filter=FILTERS.find(f=>f.key===filterKey)?.css||'none';ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close?.();
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Photo processing failed.')),'image/webp',.9));
  return blob;
}

async function openEditProfile() {
  if(!requireAuth(()=>openEditProfile()))return;
  const profile=currentProfile||await loadOwnProfile();
  openModal('Edit your Garden Grid','Keep your profile feeling like you.',body=>{
    const form=document.createElement('form');form.className='form-stack';
    const userLabel=document.createElement('label');userLabel.textContent='Username';
    const username=document.createElement('input');username.name='username';username.required=true;username.minLength=3;username.maxLength=40;username.pattern='[A-Za-z0-9_]{3,40}';username.value=profile.username||'';userLabel.append(username);
    const bioLabel=document.createElement('label');bioLabel.textContent='Bio';
    const bio=document.createElement('textarea');bio.name='bio';bio.maxLength=240;bio.value=profile.bio||'';bio.placeholder='A little about your world…';bioLabel.append(bio);
    const avatarLabel=document.createElement('label');avatarLabel.textContent='Profile photo';
    const avatarInput=document.createElement('input');avatarInput.type='file';avatarInput.accept='image/jpeg,image/png,image/webp,image/avif';avatarLabel.append(avatarInput);
    const status=document.createElement('div');status.className='inline-status';
    const submit=document.createElement('button');submit.className='button button-primary';submit.type='submit';submit.textContent='Save profile';
    form.append(userLabel,bioLabel,avatarLabel,submit,status);
    form.addEventListener('submit',async e=>{
      e.preventDefault();submit.disabled=true;status.textContent='Saving your garden…';
      let avatarUrl=profile.avatar_url||null;
      const file=avatarInput.files?.[0];
      try{
        if(file){
          if(!file.type.startsWith('image/')||file.size>10*1024*1024)throw new Error('Choose an image under 10 MB.');
          const blob=await applyPhotoFilter(file,'original');const path=currentUser.id+'/avatars/'+crypto.randomUUID()+'.webp';
          const up=await client.storage.from('bloom-media').upload(path,blob,{contentType:'image/webp',upsert:false});
          if(up.error)throw up.error;avatarUrl=client.storage.from('bloom-media').getPublicUrl(path).data.publicUrl;
        }
        const r=await client.from('profiles').update({username:username.value.trim(),bio:bio.value.trim(),avatar_url:avatarUrl}).eq('id',currentUser.id);
        if(r.error)throw r.error;
        await loadOwnProfile();clearModal();loadGardenGrid();toast('Profile updated ✿');
      }catch(error){status.textContent=error.message.includes('unique')?'That username is already taken. Choose another.':(error.message||'Profile could not be saved.');submit.disabled=false;}
    });
    body.append(form);
  });
}
async function openSettings() {
  if(!requireAuth(()=>openSettings()))return;
  await loadOwnProfile();blockedUsers=[];
  openModal('Settings','Make BLOOM feel more like your own little corner.',body=>{
    const theme=document.body.dataset.theme||'light';
    const appearance=document.createElement('section');appearance.className='settings-section';
    const h1=document.createElement('h3');h1.textContent='Appearance';appearance.append(h1);
    appearance.append(settingsToggleRow('Cream / Nude light theme','The default BLOOM look.',theme!=='dark',value=>setTheme(value?'light':'dark')));
    const account=document.createElement('section');account.className='settings-section';const h2=document.createElement('h3');h2.textContent='Account & Profile';account.append(h2);
    account.append(settingsActionRow('Edit username, bio, and avatar','Update your Garden Grid.',()=>openEditProfile()));
    account.append(settingsActionRow('Change password','Set a new password for your account.',()=>openChangePassword()));
    const interests=document.createElement('section');interests.className='settings-section';const h3=document.createElement('h3');h3.textContent='Your Mix Interests';interests.append(h3);
    const grid=document.createElement('div');grid.className='interest-choice-grid';
    INTERESTS.forEach(i=>{const label=document.createElement('label');label.className='interest-choice';const input=document.createElement('input');input.type='checkbox';input.value=i.key;input.checked=(currentProfile?.interests||[]).includes(i.key);const text=document.createElement('span');text.textContent=i.emoji+' '+i.label;label.append(input,text);grid.append(label);});
    const saveInterests=button('Save interests','button button-primary button-small',async()=>{
      const chosen=$$('input:checked',grid).map(i=>i.value);
      if(chosen.length<3){toast('Choose at least three interests for Your Mix.');return;}
      const r=await client.from('profiles').update({interests:chosen}).eq('id',currentUser.id);
      if(r.error){toast('Your interests could not be saved.');return;}
      currentProfile.interests=chosen;toast('Your Mix has been updated ✿');loadFeed();loadGardenGrid();
    });
    interests.append(grid,saveInterests);
    const privacy=document.createElement('section');privacy.className='settings-section';const h4=document.createElement('h3');h4.textContent='Privacy & Safety';privacy.append(h4);
    privacy.append(settingsToggleRow('Private Garden','Only you can view your private Plants for now.',Boolean(currentProfile?.is_private),async isPrivate=>{
      const r=await client.from('profiles').update({is_private:isPrivate}).eq('id',currentUser.id);
      if(r.error){toast('Privacy setting could not be saved.');return;}
      currentProfile.is_private=isPrivate;toast(isPrivate?'Your garden is private.':'Your garden is public.');loadFeed();
    }));
    privacy.append(settingsActionRow('Blocked gardeners','View or unblock accounts you have blocked.',()=>openBlockedUsers()));
    privacy.append(settingsToggleRow('Notification alerts','Show in-app alerts for new garden activity.',notificationAlertsEnabled,value=>{notificationAlertsEnabled=value;localStorage.setItem('bloom-notification-alerts',String(value));}));
    const support=document.createElement('section');support.className='settings-section';const h5=document.createElement('h3');h5.textContent='Support & Info';support.append(h5);
    support.append(settingsActionRow('Feedback Booth','Tell us what you think or report a bug.',()=>openFeedbackBooth()));
    support.append(settingsActionRow('Community Guidelines','The shared values that help the garden grow.',()=>openGuidelines()));
    const session=document.createElement('section');session.className='settings-section';const h6=document.createElement('h3');h6.textContent='Session Controls';session.append(h6);
    session.append(settingsActionRow('Log out','Sign out of this device.',async()=>{await client.auth.signOut();clearModal();currentUser=null;currentProfile=null;updateSignedInUI();toast('You have been signed out.');showView('feed');loadFeed();}));
    session.append(settingsActionRow('Delete account','Permanently delete your BLOOM account and profile.',()=>deleteAccount()));
    body.append(appearance,account,interests,privacy,support,session);
  });
}
function settingsToggleRow(title,description,enabled,onChange) {
  const row=document.createElement('div');row.className='settings-row';const copy=document.createElement('div');const strong=document.createElement('strong');strong.textContent=title;const p=document.createElement('p');p.textContent=description;copy.append(strong,p);
  const toggle=button('','toggle',()=>{const next=toggle.getAttribute('aria-checked')!=='true';toggle.setAttribute('aria-checked',String(next));onChange(next);});
  toggle.setAttribute('role','switch');toggle.setAttribute('aria-checked',String(Boolean(enabled)));toggle.setAttribute('aria-label',title);row.append(copy,toggle);return row;
}
function settingsActionRow(title,description,onClick) {
  const row=document.createElement('div');row.className='settings-row';const copy=document.createElement('div');const strong=document.createElement('strong');strong.textContent=title;const p=document.createElement('p');p.textContent=description;copy.append(strong,p);const open=button('Open ↗','button button-soft button-small',onClick);row.append(copy,open);return row;
}
function openChangePassword() {
  openModal('Change password','Choose a strong password you do not use elsewhere.',body=>{
    const form=document.createElement('form');form.className='form-stack';const label=document.createElement('label');label.textContent='New password';
    const input=document.createElement('input');input.type='password';input.minLength=10;input.required=true;input.autocomplete='new-password';label.append(input);
    const status=document.createElement('div');status.className='inline-status';const submit=document.createElement('button');submit.className='button button-primary';submit.type='submit';submit.textContent='Update password';
    form.append(label,submit,status);form.addEventListener('submit',async e=>{e.preventDefault();submit.disabled=true;const r=await client.auth.updateUser({password:input.value});submit.disabled=false;if(r.error){status.textContent='Password could not be updated. Check password requirements.';return;}clearModal();toast('Password updated.');});body.append(form);
  });
}
async function openBlockedUsers() {
  if(!requireAuth(()=>openBlockedUsers()))return;
  openModal('Blocked gardeners','Accounts you have blocked cannot see your Plants or message you in BLOOM.',async body=>{
    const list=document.createElement('div');list.className='dm-list';body.append(list);
    const r=await client.from('blocked_users').select('id,blocked_id,created_at').eq('blocker_id',currentUser.id).order('created_at',{ascending:false});
    if(r.error){list.append(emptyState('Blocked accounts could not load.'));return;}
    const rows=r.data||[];if(!rows.length){list.append(emptyState('You have not blocked anyone.'));return;}
    const ids=rows.map(x=>x.blocked_id);const p=await client.from('profiles').select('id,username').in('id',ids);const names=new Map((p.data||[]).map(x=>[x.id,x.username]));
    rows.forEach(item=>{const row=document.createElement('div');row.className='blocked-row';const strong=document.createElement('strong');strong.textContent='@'+(names.get(item.blocked_id)||'gardener');const unblock=button('Unblock','button button-soft button-small',async()=>{const d=await client.from('blocked_users').delete().eq('id',item.id);if(d.error){toast('Could not unblock this account.');return;}row.remove();toast('Account unblocked.');loadFeed();});row.append(strong,unblock);list.append(row);});
  });
}
async function deleteAccount() {
  if(!requireAuth(()=>deleteAccount()))return;
  const confirmation=window.prompt('To permanently delete your BLOOM account, type DELETE');
  if(confirmation!=='DELETE')return;
  toast('Requesting account deletion…');
  const result=await client.functions.invoke('delete-account',{body:{}});
  if(result.error){toast('Account deletion could not be completed. Please contact BLOOM support.');return;}
  await client.auth.signOut();currentUser=null;currentProfile=null;updateSignedInUI();showView('feed');loadFeed();toast('Your account has been deleted.');
}
function openFeedbackBooth() {
  openModal('Feedback Booth','Ideas, bugs, and honest feedback help BLOOM grow.',body=>{
    const form=document.createElement('form');form.className='form-stack';
    const categoryLabel=document.createElement('label');categoryLabel.textContent='What is this about?';
    const category=document.createElement('select');[['idea','An idea or suggestion'],['bug','A bug or something broken'],['complaint','A complaint or safety concern'],['other','Something else']].forEach(([v,l])=>{const o=document.createElement('option');o.value=v;o.textContent=l;category.append(o);});categoryLabel.append(category);
    const messageLabel=document.createElement('label');messageLabel.textContent='Your feedback';
    const message=document.createElement('textarea');message.required=true;message.minLength=10;message.maxLength=2000;message.placeholder='Tell us what happened or what you would love to see…';messageLabel.append(message);
    const status=document.createElement('div');status.className='inline-status';const submit=document.createElement('button');submit.className='button button-primary';submit.type='submit';submit.textContent='Send feedback';
    form.append(categoryLabel,messageLabel,submit,status);form.addEventListener('submit',async e=>{e.preventDefault();submit.disabled=true;const r=await client.from('feedback').insert({user_id:currentUser?.id||null,category:category.value,message:message.value.trim()});submit.disabled=false;if(r.error){status.textContent='Feedback could not be sent. Please try again.';return;}clearModal();toast('Thank you for helping BLOOM grow ✿');});body.append(form);
  });
}
function openGuidelines() {
  openModal('Community Guidelines','A few gentle rules for a garden everyone can enjoy.',body=>{
    const items=[
      ['Be kind','Disagree with ideas, not people. Harassment, hate, threats, and bullying are not welcome.'],
      ['Share responsibly','Post photos and creative work you own or have permission to share. Credit creators and link sources.'],
      ['Protect privacy','Do not post private information, addresses, passwords, or images of someone without consent.'],
      ['Keep it safe','No scams, impersonation, threats, or illegal content. Use the Safety Menu when something feels wrong.'],
      ['Respect boundaries','A block means no contact. Do not evade blocks or pressure people to respond.']
    ];
    items.forEach(([h,t])=>{const section=document.createElement('section');section.className='settings-section';const strong=document.createElement('strong');strong.textContent=h;const p=document.createElement('p');p.className='muted-copy';p.textContent=t;section.append(strong,p);body.append(section);});
  });
}

function init() {
  initTheme();
  notificationAlertsEnabled=localStorage.getItem('bloom-notification-alerts')!=='false';
  wireNavigation();
  createClient();
  if(client) initAuth();
  loadFeed();
  if(!client) setStatus('#feedStatus','Preview mode · sample Plants are ready to explore.');
  $('#greenhouseAuthButton').textContent='＋ New DM';
  showSplash();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();