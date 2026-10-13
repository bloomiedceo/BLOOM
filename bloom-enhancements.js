/* BLOOM feature upgrades. This is a front-end demo, not a shared online service. */
(function(){
'use strict';
const $=(sel,root=document)=>root.querySelector(sel);
const $$=(sel,root=document)=>Array.from(root.querySelectorAll(sel));
const safeRead=(key,fallback)=>{try{const value=localStorage.getItem(key);return value?JSON.parse(value):fallback}catch(_){return fallback}};
const safeWrite=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch(_){return false}};
const toast=message=>{if(typeof window.showToast==='function')window.showToast(message);else console.info(message)};
const getPosts=()=>safeRead('bloom-demo-posts',[]);
const getLiked=()=>safeRead('bloom-demo-liked',[]);
const getSaved=()=>safeRead('bloom-demo-saved',[]);
const getWishlist=()=>safeRead('bloom-demo-wishlist',[]);
const retainedPreviewUrls=new Set();
window.addEventListener('pagehide',()=>{retainedPreviewUrls.forEach(url=>URL.revokeObjectURL(url));retainedPreviewUrls.clear()});
const fandoms=['All fandoms','BTS','BLACKPINK','Stray Kids','TWICE','SEVENTEEN','ATEEZ','NewJeans','Multi-stan','Other'];
function addButton(label,action,pressed){const b=document.createElement('button');b.type='button';b.className='small-action';b.textContent=label;b.dataset.action=action;if(pressed!==undefined)b.setAttribute('aria-pressed',String(pressed));return b}
function makePostCard(post){
 const article=document.createElement('article');article.className='feed-card';article.dataset.postId=post.id;article.dataset.fandom=post.fandom||'Other';
 const art=document.createElement('div');art.className='feed-art';art.style.background='linear-gradient(135deg,#e6dcff,#ffcfe3)';art.textContent=post.emoji||'💗';
  if(post.mediaPreview){const photo=document.createElement('img');photo.className='bloom-shared-photo';photo.src=post.mediaPreview;photo.alt='Photo in your local post preview';photo.loading='lazy';art.replaceChildren(photo);}
 const content=document.createElement('div');content.className='feed-content';
 const meta=document.createElement('div');meta.className='meta';meta.textContent=(post.kind||'Fan update')+' · '+(post.fandom||'Other')+' · '+(post.demo?'Your browser':'Community demo');
 const title=document.createElement('h3');title.textContent=post.title||'A little fan moment';
 const body=document.createElement('p');body.textContent=post.caption||'';content.append(meta,title,body);
 if(post.link){const link=document.createElement('a');link.href=post.link;link.target='_blank';link.rel='noopener noreferrer';link.className='shop-link';link.textContent='Open shared link ↗';content.append(link)}
 const actions=document.createElement('div');actions.className='feed-actions';const liked=getLiked().includes(post.id),saved=getSaved().includes(post.id);
 actions.append(addButton(liked?'♥ Liked':'♡ Like','like',liked),addButton(saved?'★ Saved':'☆ Save','save',saved),addButton('💬 Discuss','discuss'));content.append(actions);article.append(art,content);return article;
}
function enhanceFeed(){
 const grid=$('.feed-grid');if(!grid)return;
 $$('.feed-card',grid).forEach((card,i)=>{const id='sample-'+(i+1);card.dataset.postId=id;card.dataset.fandom=['BTS','BLACKPINK','Stray Kids'][i%3];const meta=$('.meta',card);if(meta&&!meta.textContent.includes('· '+card.dataset.fandom))meta.textContent+=' · '+card.dataset.fandom;const actions=$('.feed-actions',card);if(actions)actions.replaceChildren(addButton('♡ Like','like',getLiked().includes(id)),addButton('☆ Save','save',getSaved().includes(id)),addButton('💬 Discuss','discuss'))});
 const controls=document.createElement('div');controls.className='bloom-controls';controls.innerHTML='<input id="bloom-feed-search" type="search" aria-label="Search fan posts" placeholder="Search fan posts…"><select id="bloom-fandom-filter" aria-label="Filter by fandom"></select><button class="pill lavender" id="bloom-show-saved" type="button" aria-pressed="false">☆ Saved posts</button>';
 const select=$('#bloom-fandom-filter',controls);fandoms.forEach((f,i)=>{const o=document.createElement('option');o.value=i===0?'all':f;o.textContent=f;select.append(o)});grid.before(controls);
 const status=document.createElement('p');status.className='bloom-enhance-note';status.id='bloom-feed-status';status.textContent='Likes, saves, and posts on this preview are stored only in this browser. They are not shared with other fans.';controls.after(status);
 function apply(){const q=$('#bloom-feed-search').value.trim().toLowerCase(),f=select.value,savedOnly=$('#bloom-show-saved').getAttribute('aria-pressed')==='true';$$('.feed-card',grid).forEach(card=>{card.hidden=!((f==='all'||card.dataset.fandom===f)&&card.textContent.toLowerCase().includes(q)&&(!savedOnly||getSaved().includes(card.dataset.postId)))})}
 controls.addEventListener('input',apply);
 document.addEventListener('bloom:feed-updated',apply);
 $('#bloom-show-saved',controls).addEventListener('click',e=>{const b=e.currentTarget,on=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(on));b.textContent=on?'★ Showing saved':'☆ Saved posts';apply()});
 grid.addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(!b)return;const card=b.closest('.feed-card'),id=card?.dataset.postId;if(!id)return;
 if(b.dataset.action==='like'){const a=getLiked(),next=a.includes(id)?a.filter(x=>x!==id):a.concat(id);if(!safeWrite('bloom-demo-liked',next)){toast('Browser storage unavailable; this change may not persist.');return}b.setAttribute('aria-pressed',String(next.includes(id)));b.textContent=next.includes(id)?'♥ Liked':'♡ Like';toast(next.includes(id)?'Liked on this browser ♡':'Like removed')}
 if(b.dataset.action==='save'){const a=getSaved(),next=a.includes(id)?a.filter(x=>x!==id):a.concat(id);if(!safeWrite('bloom-demo-saved',next)){toast('Browser storage unavailable; this change may not persist.');return}b.setAttribute('aria-pressed',String(next.includes(id)));b.textContent=next.includes(id)?'★ Saved':'☆ Save';apply();toast(next.includes(id)?'Saved on this browser ♡':'Removed from saved posts')}
 if(b.dataset.action==='discuss'){openMessages('Stanner Lounge');toast('Demo room opened. Messages are not sent to other people.')}
 });
 getPosts().forEach(p=>grid.prepend(makePostCard(p)));
}
function enhancePostComposer(){
 const form=$('#post-form');if(!form||form.dataset.bloomComposerReady)return;form.dataset.bloomComposerReady='true';
 const kind=$('#post-kind'),caption=$('#post-caption'),link=$('#post-link');
 const addField=(tag,id,labelText,after,attrs={})=>{const label=document.createElement('label');label.htmlFor=id;label.textContent=labelText;const field=document.createElement(tag);field.id=id;field.className='bloom-field';Object.entries(attrs).forEach(([k,v])=>field.setAttribute(k,v));after.after(label,field);return field};
 const title=addField('input','bloom-post-title','Post title',kind,{maxlength:'90',placeholder:'Give your fan moment a title',required:'required'});
 const fandom=addField('select','bloom-post-fandom','Fandom',title);
 fandoms.slice(1).forEach(f=>{const o=document.createElement('option');o.value=f;o.textContent=f;fandom.append(o)});
 const photo=addField('input','bloom-post-photo','Add a photo or take one with your camera',link,{type:'file',accept:'image/jpeg,image/png,image/webp',capture:'environment'});
 const filter=addField('select','bloom-post-filter','Photo filter',photo);
 [['none','Original'],['grayscale(1)','Black & white'],['sepia(.35)','Warm'],['contrast(1.12) saturate(1.15)','Crisp'],['saturate(1.4)','Vivid']].forEach(([v,label])=>{const o=document.createElement('option');o.value=v;o.textContent=label;filter.append(o)});
 const preview=document.createElement('div');preview.className='bloom-post-photo-preview';preview.hidden=true;
 const image=document.createElement('img');image.alt='Preview of your selected post photo';preview.append(image);photo.insertAdjacentElement('afterend',preview);
 const note=document.createElement('p');note.className='bloom-enhance-note';note.textContent='Photo preview stays on this device until you publish. BLOOM will resize the image and remove embedded camera metadata before upload.';preview.after(note);
 let previewUrl='';
 const paintPreview=()=>{image.style.filter=filter.value==='none'?'none':filter.value};
 photo.addEventListener('change',()=>{const file=photo.files?.[0];if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl='';preview.hidden=true;if(!file)return;if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>8*1024*1024){photo.value='';toast('Choose a JPG, PNG, or WebP image under 8 MB.');return}previewUrl=URL.createObjectURL(file);image.src=previewUrl;preview.hidden=false;paintPreview()});
 filter.addEventListener('change',paintPreview);
 async function prepareImage(file,cssFilter){
  if(!file)return null;
  const source=await createImageBitmap(file),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  if(!ctx){source.close();throw new Error('Photo editing is not supported by this browser.')}
  try{
   const longest=Math.max(source.width,source.height);
   for(const preset of [{edge:1600,quality:0.84},{edge:1400,quality:0.76},{edge:1200,quality:0.68}]){
    const scale=Math.min(1,preset.edge/longest);canvas.width=Math.max(1,Math.round(source.width*scale));canvas.height=Math.max(1,Math.round(source.height*scale));
    ctx.filter=cssFilter==='none'?'none':cssFilter;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',preset.quality));
    if(blob&&blob.size<=4.7*1024*1024)return blob;
   }
   throw new Error('This photo is still too large after compression. Try a smaller image.');
  }finally{source.close()}
 }
 form.addEventListener('submit',async e=>{
  e.preventDefault();e.stopImmediatePropagation();
  const text=caption.value.trim(),heading=title.value.trim(),url=link.value.trim(),file=photo.files?.[0];
  if(!text||!heading){toast('Add a title and update first.');return}
  if(url&&!/^https?:\/\//i.test(url)){toast('Please use a valid http or https link.');return}
  if(window.BLOOM_SUPABASE_CONFIG?.url&&typeof window.bloomPublishPost!=='function'){toast('BLOOM is still connecting. Wait a moment and try again.');return}
  if(typeof window.bloomPublishPost==='function'){
   const submit=$('button[type="submit"]',form),original=submit?.textContent;if(submit){submit.disabled=true;submit.textContent='Publishing…'}
   try{
    const mediaBlob=await prepareImage(file,filter.value);
    const result=await window.bloomPublishPost({title:heading,body:text,fandom:fandom.value,link:url,mediaBlob});
    if(!result?.ok)return;
    closeModal('post-modal');form.reset();preview.hidden=true;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl='';toast('Your post is live on BLOOM! 🌸');$('#activity')?.scrollIntoView({behavior:'smooth',block:'start'});
   }catch(err){toast(err?.message||'Post could not be published. Please try again.')}
   finally{if(submit){submit.disabled=false;submit.textContent=original||'Publish to BLOOM'}}
   return;
  }
  const localImage=previewUrl||'';if(localImage)retainedPreviewUrls.add(localImage);
  const post={id:'local-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),title:heading,caption:text,kind:kind.value,fandom:fandom.value,link:url,mediaPreview:localImage,emoji:'💗',demo:true,createdAt:new Date().toISOString()};
  const posts=getPosts();posts.unshift(post);if(!safeWrite('bloom-demo-posts',posts)){toast('Could not save this demo post in browser storage.');return}
  const grid=$('.feed-grid');if(grid)grid.prepend(makePostCard(post));closeModal('post-modal');form.reset();preview.hidden=true;previewUrl='';toast('Post added to this browser preview only.');$('#activity')?.scrollIntoView({behavior:'smooth',block:'start'});
 },true);
}
 function enhanceMarketplace(){
 const grid=$('#product-grid');if(!grid)return;const search=$('#filter-search');if(search){search.setAttribute('aria-label','Search products by name or category');search.placeholder='Search merch, albums, accessories…'}
 const section=$('#discover');if(!section)return;const tools=document.createElement('div');tools.className='bloom-market-tools';
 const own=document.createElement('button');own.className='pill primary';own.type='button';own.textContent='＋ List your product';own.addEventListener('click',()=>openModal('bloom-product-modal'));
 let wishlistOnly=false;
 const wish=document.createElement('button');wish.className='pill white';wish.type='button';wish.textContent='♡ My wishlist';wish.setAttribute('aria-pressed','false');
 const reset=document.createElement('button');reset.className='pill white';reset.type='button';reset.textContent='Show all products';
 tools.append(own,wish,reset);const parent=search?.parentElement;if(parent)parent.insertAdjacentElement('afterend',tools);else grid.before(tools);
 function applyFilters(){const q=(search?.value||'').trim().toLowerCase();const active=$('.filter.active',section);const category=active?.dataset.filter||'all';const saved=getWishlist();$$('.product-card',grid).forEach(card=>{const name=(card.dataset.name||'').toLowerCase();const text=(card.textContent||'').toLowerCase();const categoryMatch=category==='all'||card.dataset.category===category;const searchMatch=!q||name.includes(q)||text.includes(q);const savedMatch=!wishlistOnly||saved.includes(card.dataset.name);card.hidden=!(categoryMatch&&searchMatch&&savedMatch)});}
 wish.addEventListener('click',()=>{wishlistOnly=!wishlistOnly;wish.setAttribute('aria-pressed',String(wishlistOnly));wish.textContent=wishlistOnly?'★ Showing wishlist':'♡ My wishlist';applyFilters();const count=$$('.product-card',grid).filter(c=>!c.hidden).length;toast(wishlistOnly?(count?count+' saved product(s) shown.':'Your wishlist is empty on this browser.'):'Showing products matching your filters.');});
 reset.addEventListener('click',()=>{wishlistOnly=false;wish.setAttribute('aria-pressed','false');wish.textContent='♡ My wishlist';if(search)search.value='';$$('.filter',section).forEach(btn=>btn.classList.toggle('active',btn.dataset.filter==='all'));applyFilters();});
 if(search)search.addEventListener('input',applyFilters);
 $$('.filter',section).forEach(btn=>btn.addEventListener('click',()=>{ $$('.filter',section).forEach(other=>other.classList.toggle('active',other===btn));wishlistOnly=false;wish.setAttribute('aria-pressed','false');wish.textContent='♡ My wishlist';applyFilters();}));
 $$('.product-card',grid).forEach((card,i)=>{if(!card.dataset.name)card.dataset.name=$('h3',card)?.textContent||('product-'+i);const name=card.dataset.name;const btn=$('.heart',card);if(btn){const update=()=>{const yes=getWishlist().includes(name);btn.textContent=yes?'♥':'♡';btn.setAttribute('aria-pressed',String(yes));btn.setAttribute('aria-label',(yes?'Remove from':'Add to')+' wishlist: '+name)};update();btn.addEventListener('click',()=>{const list=getWishlist(),next=list.includes(name)?list.filter(x=>x!==name):list.concat(name);if(safeWrite('bloom-demo-wishlist',next)){update();applyFilters();toast(next.includes(name)?'Added to this browser wishlist ♡':'Removed from wishlist')}})}});
 safeRead('bloom-demo-products',[]).slice().reverse().forEach(item=>{const card=document.createElement('article');card.className='product-card';card.dataset.name=item.name.toLowerCase();card.dataset.category='seller';card.innerHTML='<div class="product-visual v-lilac"><span class="product-emoji">🎁</span><span class="tag">Your demo listing</span></div><div class="product-info"><div class="product-type"></div><h3></h3><p>Seller listing preview · not published to a marketplace.</p><div class="product-bottom"><span class="price"></span><a class="shop-link" rel="noopener noreferrer">View listing ↗</a></div></div>';$('.product-type',card).textContent=item.category;$('.product-info h3',card).textContent=item.name;$('.price',card).textContent=item.price||'Price not set';const a=$('.shop-link',card);if(item.url){a.href=item.url;a.target='_blank'}else{a.href='#';a.addEventListener('click',ev=>{ev.preventDefault();toast('Add a shop URL before publishing this listing.')})}grid.prepend(card)});
 const modal=document.createElement('div');modal.className='modal-backdrop';modal.id='bloom-product-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','bloom-product-title');
 modal.innerHTML='<div class="modal"><div class="modal-head"><h2 id="bloom-product-title">List your product ✨</h2><button class="modal-close" type="button" aria-label="Close" id="bloom-product-close">×</button></div><p class="bloom-inline-status">Listings are saved only in this browser preview. No checkout, inventory, or public seller account is connected.</p><form id="bloom-product-form" class="bloom-modal-form"><label for="bloom-product-name">Product name</label><input id="bloom-product-name" maxlength="100" required placeholder="e.g. Handmade photocard holder"><label for="bloom-product-category">Category</label><select id="bloom-product-category"><option>Accessories</option><option>Albums & music</option><option>Photocards & collectibles</option><option>Clothing</option><option>Fan-made crafts</option><option>Other</option></select><label for="bloom-product-price">Price (text)</label><input id="bloom-product-price" maxlength="40" placeholder="e.g. RM 25"><label for="bloom-product-url">Product or shop URL (optional)</label><input id="bloom-product-url" type="url" placeholder="https://…"><button class="pill primary" type="submit">Add demo listing</button></form></div>';
 document.body.append(modal);$('#bloom-product-close').addEventListener('click',()=>closeModal(modal.id));modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal.id)});
 $('#bloom-product-form').addEventListener('submit',e=>{e.preventDefault();const name=$('#bloom-product-name').value.trim(),price=$('#bloom-product-price').value.trim(),url=$('#bloom-product-url').value.trim();if(url&&!/^https?:\/\//i.test(url)){toast('Please enter a valid http or https URL.');return}const items=safeRead('bloom-demo-products',[]);items.unshift({id:'seller-'+Date.now(),name,category:$('#bloom-product-category').value,price,url,demo:true});if(!safeWrite('bloom-demo-products',items)){toast('Browser storage unavailable; listing not saved.');return}
 const card=document.createElement('article');card.className='product-card';card.dataset.name=name.toLowerCase();card.dataset.category='seller';card.innerHTML='<div class="product-visual v-lilac"><span class="product-emoji">🎁</span><span class="tag">Your demo listing</span></div><div class="product-info"><div class="product-type"></div><h3></h3><p>Seller listing preview · not published to a marketplace.</p><div class="product-bottom"><span class="price"></span><a class="shop-link" rel="noopener noreferrer">View listing ↗</a></div></div>';
 $('.product-type',card).textContent=$('#bloom-product-category').value;$('.product-info h3',card).textContent=name;$('.price',card).textContent=price||'Price not set';const a=$('.shop-link',card);if(url){a.href=url;a.target='_blank'}else{a.href='#';a.addEventListener('click',ev=>{ev.preventDefault();toast('Add a shop URL before publishing this listing.')})}grid.prepend(card);closeModal(modal.id);e.target.reset();applyFilters();toast('Demo listing added on this browser.')});
 applyFilters();
}
function scrollToLiveChat(){
  const panel=$('#bloom-live-community');
  if(!panel){toast('BLOOM LIVE is still connecting. Refresh the page and try again.');return}
  panel.scrollIntoView({behavior:'smooth',block:'start'});
  const heading=$('#bloom-live-chat-title');
  if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true})}
  toast('Use Groups & live chat in BLOOM LIVE. Sign in and join a group to send shared messages.');
}
function enhanceMessaging(){
  window.scrollToBloomChat=scrollToLiveChat;
  $$('.room').forEach(card=>card.addEventListener('click',event=>{event.preventDefault();scrollToLiveChat()}));
}
function enhanceMusic(){
 if($('#bloom-music'))return;const section=document.createElement('section');section.className='section';section.id='bloom-music';
 section.innerHTML='<div class="wrap"><div class="section-head"><div><div class="kicker">Listen together</div><h2>BLOOM MUSIC ✨</h2></div><p>Find your next repeat song, open a Spotify playlist, and keep the mini-player close while you explore.</p></div><div class="bloom-music"><div class="bloom-music-grid"><article class="bloom-track-feature"><h3>🎧 K-pop, on repeat</h3><p class="bloom-enhance-note">Spotify embed · playback and availability depend on Spotify and your region.</p><div class="bloom-player-host" id="bloom-player-host"><p class="bloom-player-placeholder">Your Spotify player lives here. Dock it to keep the controls visible while you browse.</p><iframe class="bloom-spotify-frame" title="Spotify K-pop playlist" src="https://open.spotify.com/embed/playlist/37i9dQZF1DX9tPFwDMOaN1?utm_source=generator" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"></iframe></div></article><article class="bloom-track-feature"><h3>Pick your listening mood</h3><p class="bloom-enhance-note">Choose a playlist to open its official Spotify embed. Mini-player controls jump to this dashboard; audio playback is handled by Spotify.</p><div id="bloom-built-in-playlists" class="bloom-quick-tracks"><button type="button" data-playlist="37i9dQZF1DX9tPFwDMOaN1"><span>🌷</span><span>K-pop hits · playlist</span></button><button type="button" data-playlist="37i9dQZF1DX4FcAKI5NHwU"><span>💜</span><span>K-pop boy groups · playlist</span></button><button type="button" data-playlist="37i9dQZF1DX6QClArzhQUF"><span>🎀</span><span>K-pop girl groups · playlist</span></button></div><form id="bloom-add-playlist-form" class="bloom-add-playlist"><label for="bloom-playlist-url">Add a Spotify playlist to BLOOM MUSIC</label><input id="bloom-playlist-url" type="url" inputmode="url" placeholder="Paste a Spotify playlist link" required aria-describedby="bloom-playlist-status"><input id="bloom-playlist-name" type="text" maxlength="60" placeholder="Playlist name (optional)" aria-label="Playlist name (optional)"><button class="pill lavender" type="submit">＋ Add playlist</button><p id="bloom-playlist-status" role="status" aria-live="polite">Paste a public Spotify playlist link. Custom playlists are saved in this browser.</p></form><h4 class="bloom-playlist-subhead">Saved on this browser</h4><div id="bloom-user-playlists" class="bloom-quick-tracks" aria-label="Your added playlists"></div><h4 class="bloom-playlist-subhead">Shared with BLOOM</h4><p id="bloom-community-playlists-status" class="bloom-enhance-note" role="status" aria-live="polite">Loading shared playlists…</p><div id="bloom-community-playlists" class="bloom-quick-tracks" aria-label="Community Spotify playlists"></div><a class="pill primary" style="margin-top:15px" href="https://open.spotify.com/" target="_blank" rel="noopener noreferrer">Open Spotify ↗</a></article></div></div></div>';
 const community=$('#community');if(community)community.before(section);else $('main')?.append(section);
   const frame=$('.bloom-spotify-frame',section);const loadPlaylist=(id,label)=>{frame.src='https://open.spotify.com/embed/playlist/'+id+'?utm_source=generator';$('#bloom-mini-status').textContent='Now showing · '+label;toast('Playlist loaded inside BLOOM MUSIC.');frame.scrollIntoView({behavior:'smooth',block:'center'})};$$('[data-playlist]',section).forEach(b=>b.addEventListener('click',()=>loadPlaylist(b.dataset.playlist,b.textContent.trim())));const playlistForm=$('#bloom-add-playlist-form',section),playlistInput=$('#bloom-playlist-url',section),playlistName=$('#bloom-playlist-name',section),playlistStatus=$('#bloom-playlist-status',section),userPlaylistList=$('#bloom-user-playlists',section);const readPlaylists=()=>{try{const value=JSON.parse(localStorage.getItem('bloom-custom-playlists')||'[]');return Array.isArray(value)?value.filter(x=>x&&/^[A-Za-z0-9]{10,64}$/.test(x.id)&&typeof x.name==='string').slice(0,30):[]}catch(_){return[]}};const writePlaylists=items=>{try{localStorage.setItem('bloom-custom-playlists',JSON.stringify(items));return true}catch(_){return false}};const parsePlaylistId=value=>{const raw=value.trim();if(/^[A-Za-z0-9]{10,64}$/.test(raw))return raw;const uri=raw.match(/^spotify:playlist:([A-Za-z0-9]{10,64})$/);if(uri)return uri[1];try{const url=new URL(raw);if(url.protocol!=='https:'||url.hostname!=='open.spotify.com')return'';return url.pathname.match(/^\/(?:embed\/)?playlist\/([A-Za-z0-9]{10,64})\/?$/)?.[1]||''}catch(_){return''}};const renderUserPlaylists=()=>{userPlaylistList.replaceChildren();readPlaylists().forEach(item=>{const b=document.createElement('button');b.type='button';b.dataset.userPlaylist=item.id;b.textContent='🎧 '+item.name;b.addEventListener('click',()=>loadPlaylist(item.id,item.name));userPlaylistList.append(b)})};renderUserPlaylists();
  const communityStatus=$('#bloom-community-playlists-status',section),communityList=$('#bloom-community-playlists',section);
  async function renderCommunityPlaylists(){
    const api=window.bloomMusicPlaylists;
    if(!api){communityStatus.textContent='Shared playlist library is connecting…';return}
    communityStatus.textContent='Loading shared playlists…';communityList.replaceChildren();
    const {data,error}=await api.list();
    if(error){communityStatus.textContent='Could not load the shared playlist library. Your browser-saved playlists still work.';return}
    if(!data?.length){communityStatus.textContent='No community playlists yet. Sign in and add one to share it with BLOOM.';return}
    communityStatus.textContent=data.length+' playlist(s) shared with BLOOM.';
    data.forEach(item=>{const b=document.createElement('button');b.type='button';b.textContent='🌐 '+item.title;b.title='Shared by the BLOOM community';b.addEventListener('click',()=>loadPlaylist(item.spotify_playlist_id,item.title));communityList.append(b)})
  }
  document.addEventListener('bloom:music-ready',()=>{void renderCommunityPlaylists()});
  void renderCommunityPlaylists();
  playlistForm.addEventListener('submit',async event=>{
    event.preventDefault();
    const id=parsePlaylistId(playlistInput.value);
    if(!id){playlistStatus.textContent='Use a public Spotify playlist link, for example https://open.spotify.com/playlist/… . Song links and other music services are not supported yet.';return}
    const name=playlistName.value.trim()||'My K-pop playlist';
    const items=readPlaylists().filter(x=>x.id!==id);items.unshift({id,name});
    if(!writePlaylists(items)){playlistStatus.textContent='Could not save playlists in this browser. Check browser storage settings.';return}
    renderUserPlaylists();loadPlaylist(id,name);playlistInput.value='';playlistName.value='';
    const api=window.bloomMusicPlaylists;
    if(!api||!api.isSignedIn()){playlistStatus.textContent='Added “'+name+'” on this browser. Sign in to share it with everyone on BLOOM.';return}
    const button=$('button[type="submit"]',playlistForm),original=button.textContent;button.disabled=true;button.textContent='Sharing…';playlistStatus.textContent='Adding “'+name+'” to the shared BLOOM library…';
    try{
      const result=await api.add({spotifyId:id,title:name});
      if(result.error&&result.error.code==='23505'){playlistStatus.textContent='This playlist is already in the shared BLOOM library. It is ready to play here.'}
      else if(result.error){playlistStatus.textContent='It is saved on this browser, but could not be shared with BLOOM: '+result.error.message}
      else{playlistStatus.textContent='Added “'+name+'” to BLOOM MUSIC for everyone to discover.'}
      await renderCommunityPlaylists();
    }catch(_){playlistStatus.textContent='It is saved on this browser, but the shared library could not be reached. Try again later.'}
    finally{button.disabled=false;button.textContent=original}
  });
 const mini=document.createElement('div');mini.className='bloom-mini-player';mini.setAttribute('aria-label','BLOOM Spotify mini-player');mini.innerHTML='<div class="mini-cover">🎧</div><div class="mini-copy">BLOOM MUSIC<small id="bloom-mini-status">Spotify player ready · dock for quick controls</small></div><button type="button" id="bloom-mini-open">Open dashboard</button><button type="button" id="bloom-mini-dock">Dock Spotify player</button><div id="bloom-mini-player-slot" hidden></div>';document.body.append(mini);
 $('#bloom-mini-open').addEventListener('click',()=>{$('#bloom-music')?.scrollIntoView({behavior:'smooth',block:'start'});$('#bloom-mini-status').textContent='Dashboard opened · use the playlist buttons below'});
 $('#bloom-mini-dock').addEventListener('click',()=>{const slot=$('#bloom-mini-player-slot'),host=$('#bloom-player-host'),button=$('#bloom-mini-dock'),placeholder=$('.bloom-player-placeholder');if(frame.parentElement===host){slot.hidden=false;slot.append(frame);mini.classList.add('is-docked');button.textContent='Return player';$('#bloom-mini-status').textContent='Spotify controls are docked below';if(placeholder)placeholder.hidden=true;}else{host.append(frame);slot.hidden=true;mini.classList.remove('is-docked');button.textContent='Dock Spotify player';$('#bloom-mini-status').textContent='Spotify player ready · dock for quick controls';if(placeholder)placeholder.hidden=false;$('#bloom-music')?.scrollIntoView({behavior:'smooth',block:'start'});}});
}
function addMusicNav(){const nav=$('#navlinks');if(nav&&!$('a[href="#bloom-music"]',nav)){const a=document.createElement('a');a.href='#bloom-music';a.textContent='BLOOM MUSIC';nav.append(a)}}
function init(){enhanceFeed();enhancePostComposer();enhanceMarketplace();enhanceMessaging();enhanceMusic();addMusicNav()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();