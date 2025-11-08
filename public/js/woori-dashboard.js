/* =====================================================
   woori-dashboard.js (Part 1 / 3)
   - Firebase init / Auth check
   - Utilities / Toast / Sound / Push / Logout cleanup
===================================================== */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signOut,
  reauthenticateWithCredential, EmailAuthProvider, updatePassword
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, collection, query, where, orderBy, onSnapshot,
  Timestamp, updateDoc, deleteDoc, doc, getDoc, serverTimestamp, limit, setDoc, deleteField
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
  getMessaging, getToken, onMessage, isSupported
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js';

/* ======== 공통 유틸 ======== */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
}[m] || m));
const Z = n => String(n).padStart(2, '0');
const toDate = ts => ts?.toDate?.() || null;
const fmt = d => `${d.getFullYear()}-${Z(d.getMonth()+1)}-${Z(d.getDate())} ${Z(d.getHours())}:${Z(d.getMinutes())}:${Z(d.getSeconds())}`;

/* ======== Firebase 초기화 ======== */
const firebaseConfig = {
  apiKey: "AIzaSyACn_-2BLztKYmBKXtrKNtMsC-2Y238oug",
  authDomain: "woori-1ecf5.firebaseapp.com",
  projectId: "woori-1ecf5",
  storageBucket: "woori-1ecf5.firebasestorage.app",
  messagingSenderId: "1073097361525",
  appId: "1:1073097361525:web:3218ced6a040aaaf4d503c",
  databaseURL: "https://woori-1ecf5-default-rtdb.firebaseio.com"
};
const app = initializeApp(firebaseConfig);
const needLP = !('ReadableStream' in window) || navigator.connection?.saveData === true;
const db = initializeFirestore(app, needLP ? { experimentalForceLongPolling: true, useFetchStreams: false } : {});
const auth = getAuth(app);

/* ======== 기본 상태 ======== */
let cur = null, isAdmin = false;

/* ======== 시계 ======== */
const clock = $('#clock');
function tick(){ clock.textContent = fmt(new Date()); }
tick(); setInterval(tick, 1000);

/* ======== Toast ======== */
function showToast(msg, type='info', ms=3000){
  const wrap = $('#toasts'); if(!wrap) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<div class="icon">💬</div><div class="msg">${esc(msg)}</div><button class="t-close">×</button>`;
  el.querySelector('.t-close').onclick = () => el.remove();
  wrap.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
const toast = (m,t)=>showToast(m,t);

/* ======== Audio Chime ======== */
const AC = window.AudioContext || window.webkitAudioContext;
const audio = { ctx:null, out:null, unlocked:false };
function initAudioContext(){
  if(!AC) return;
  if(!audio.ctx){
    audio.ctx = new AC();
    audio.out = audio.ctx.createGain();
    audio.out.gain.value = 0.35;
    audio.out.connect(audio.ctx.destination);
  }
}
function unlockAudio(){
  if(!AC) return;
  initAudioContext();
  try{
    const buffer = audio.ctx.createBuffer(1,1,audio.ctx.sampleRate);
    const src = audio.ctx.createBufferSource();
    src.buffer = buffer; src.connect(audio.out); src.start(0);
  }catch{}
  if(audio.ctx.state === 'suspended') audio.ctx.resume().catch(()=>{});
  audio.unlocked = true;
  ['click','touchstart','keydown'].forEach(ev=>window.removeEventListener(ev, unlockAudio, true));
}
['click','touchstart','keydown'].forEach(ev=>window.addEventListener(ev, unlockAudio, {capture:true,passive:true}));
function playChime(kind='note'){
  if(!AC) return;
  initAudioContext();
  if(!audio.unlocked) return;
  const osc = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();
  osc.connect(g); g.connect(audio.out);
  osc.frequency.value = (kind==='join'?880:kind==='leave'?440:988);
  osc.type = 'sine'; g.gain.value = 0.3;
  osc.start(); osc.stop(audio.ctx.currentTime + 0.2);
}

/* ======== Push 알림 (FCM) ======== */
const VAPID_KEY='BDR1RJklUhPgWbxUpsX-T9tsRCJamok1icmmkSgaz2NGoTj0HiaMpuJ7jY2hsPibWdIlZfC3XnuvMlA6TxOKQfQ';
const TOKEN_KEY='fcmToken';
const btnEnablePush=$('#btn-enable-push');

function setEnableBtnVisibility(){
  if(!btnEnablePush) return;
  const perm=('Notification' in window)?Notification.permission:'unsupported';
  const hasToken=!!localStorage.getItem(TOKEN_KEY);
  const loggedIn=!!auth.currentUser;
  btnEnablePush.style.display=(perm==='default'&&!hasToken&&loggedIn)?'inline-block':'none';
}

async function initPush(user,{fromClick=false}={}){
  try{
    if(!(await isSupported())) return;
    const reg=await navigator.serviceWorker.register('/sw.js');
    if(Notification.permission==='default'&&!fromClick) return;
    if(Notification.permission!=='granted'){
      const perm=await Notification.requestPermission();
      if(perm!=='granted') return;
    }
    const messaging=getMessaging(app);
    const token=await getToken(messaging,{vapidKey:VAPID_KEY,serviceWorkerRegistration:reg});
    if(!token) return;
    await setDoc(doc(db,'users',user.uid,'fcmTokens',token),{
      at:serverTimestamp(),ua:navigator.userAgent||''
    },{merge:true});
    localStorage.setItem(TOKEN_KEY,token);
    setEnableBtnVisibility();
    toast('알림이 활성화되었습니다.','success');
    onMessage(messaging,p=>{
      const n=p.notification||{}; toast(`${n.title||'알림'} · ${n.body||''}`,'info'); playChime('note');
    });
  }catch(e){console.warn('initPush error',e);}
}

/* ======== Logout cleanup ======== */
async function logoutAndCleanup(user){
  try{
    const reg=await navigator.serviceWorker.getRegistration('/sw.js');
    const messaging=getMessaging(app);
    const token=await getToken(messaging,{vapidKey:VAPID_KEY,serviceWorkerRegistration:reg});
    if(token) await deleteDoc(doc(db,'users',user.uid,'fcmTokens',token));
  }catch{}
  localStorage.removeItem(TOKEN_KEY);
  await signOut(auth);
  location.replace('login.html');
}

/* ======== 로그인 상태 감지 ======== */
onAuthStateChanged(auth,async u=>{
  cur=u||null;
  const me=$('#me');
  me.textContent=u?`${u.displayName||'사용자'}님`:'로그인이 필요합니다';
  if(!u) return location.href='login.html';
  try{isAdmin=(await getDoc(doc(db,'admins',u.uid))).exists();}catch{}
  initPush(u,{fromClick:false});
  setEnableBtnVisibility();
  btnEnablePush?.addEventListener('click',()=>initPush(auth.currentUser,{fromClick:true}),{once:true});
});
/* =====================================================
   woori-dashboard.js (Part 2 / 3)
   - Ward Task subscribe / render
   - Pickup / Drop / Quick status
   - Surgery subscribe / chart
   - Chart.js visualizations
===================================================== */

/* ===== 날짜 유틸 ===== */
const Z2 = n => String(n).padStart(2,'0');
const toYMD = d => `${d.getFullYear()}-${Z2(d.getMonth()+1)}-${Z2(d.getDate())}`;
const parseYMD = ymd => { const [y,m,dd] = (ymd||'').split('-').map(Number); const d=new Date(y,m-1,dd); d.setHours(0,0,0,0); return d; };
let selectedYMD = toYMD(new Date());

const dayInput = $('#day'), prevBtn = $('#prev-day'), nextBtn = $('#next-day');
dayInput.value = selectedYMD;
prevBtn.onclick = () => { const d=parseYMD(selectedYMD); d.setDate(d.getDate()-1); selectedYMD=toYMD(d); dayInput.value=selectedYMD; subscribeByDate(selectedYMD,true); subscribeSurgeryByDate(selectedYMD,true); };
nextBtn.onclick = () => { const d=parseYMD(selectedYMD); d.setDate(d.getDate()+1); selectedYMD=toYMD(d); dayInput.value=selectedYMD; subscribeByDate(selectedYMD,true); subscribeSurgeryByDate(selectedYMD,true); };
dayInput.onchange = () => { selectedYMD=dayInput.value; subscribeByDate(selectedYMD,true); subscribeSurgeryByDate(selectedYMD,true); };

/* ===== 상태 ===== */
let snapshotData = [], prevSnapshot = new Map(), unsub = null;

/* ===== Firestore: 업무 ===== */
function subscribeByDate(ymd, notify){
  try{ unsub && unsub(); }catch{}
  const start=parseYMD(ymd), end=new Date(start); end.setDate(end.getDate()+1);
  const qy=query(
    collection(db,'wardTasks'),
    where('createdAt','>=',Timestamp.fromDate(start)),
    where('createdAt','<',Timestamp.fromDate(end)),
    orderBy('createdAt','desc')
  );
  unsub = onSnapshot(qy,snap=>{
    const newData=snap.docs.map(d=>({id:d.id,...d.data()}));
    if(notify) prevSnapshot=new Map(newData.map(x=>[x.id,x]));
    snapshotData=newData;
    render();
  });
}

/* ===== Render: 업무 목록 ===== */
const list = $('#list');
const cntOpen=$('#cnt-open'), cntProg=$('#cnt-prog'), cntDone=$('#cnt-done');

function chip(t,c=''){const s=document.createElement('span');s.className='chip'+(c?' '+c:'');s.textContent=t;return s;}
function btn(label,fn,cls=''){const b=document.createElement('button');b.className='btn small'+(cls?' '+cls:'');b.textContent=label;b.onclick=fn;return b;}

function render(){
  const base=snapshotData.map(x=>({...x,status:x.status||'open'}));
  const o=base.filter(x=>x.status==='open').length;
  const p=base.filter(x=>x.status==='in_progress').length;
  const d=base.filter(x=>x.status==='done').length;
  cntOpen.textContent=o; cntProg.textContent=p; cntDone.textContent=d;
  if(base.length===0){ list.innerHTML='<div class="k">오늘 업무가 없습니다.</div>'; updateStatusChart(0,0,0); return; }
  const frag=document.createDocumentFragment();
  base.forEach(t=>frag.appendChild(renderTask(t)));
  list.innerHTML=''; list.appendChild(frag);
  updateStatusChart(o,p,d);
}

function renderTask(d){
  const el=document.createElement('div'); el.className='task';
  const left=document.createElement('div'); left.className='left';
  const chips=document.createElement('div'); chips.className='chips';
  chips.append(chip(d.category==='misc'?'기타':'이송업무'));
  chips.append(chip(d.priority==='STAT'?'긴급':'보통', d.priority==='STAT'?'warn':''));  
  chips.append(chip(d.status==='open'?'대기':d.status==='in_progress'?'진행중':'완료', d.status==='open'?'stat-open':d.status==='in_progress'?'stat-prog':'stat-done'));
  left.append(chips);

  const title=document.createElement('div');
  title.textContent=(d.dept||d.title||'(제목 없음)') + (d.note?` · ${d.note}`:'');
  left.append(title);

  const mine = cur && d.assignedTo?.uid===cur.uid;
  const actions=document.createElement('div'); actions.className='row'; actions.style.gap='6px';

  if(mine || isAdmin){
    if(d.status==='open') actions.append(btn('시작',()=>quickStatus(d.id,'in_progress')));
    if(d.status==='in_progress') actions.append(btn('완료',()=>quickStatus(d.id,'done')));
    if(d.status==='done') actions.append(btn('진행중',()=>quickStatus(d.id,'in_progress')));
    if(d.status!=='open') actions.append(btn('대기',()=>quickStatus(d.id,'open')));
    actions.append(btn('삭제',()=>delTask(d.id),'danger'));
  }

  if(!d.assignedTo?.uid && d.status==='open' && cur){
    actions.append(btn('픽업',()=>pickupTask(d.id)));
  }

  if(mine){
    actions.append(btn('픽업취소',()=>dropTask(d.id)));
  }

  left.append(actions);

  const right=document.createElement('div'); right.className='right';
  right.innerHTML=`<div class="k">${d.assignedTo?.name||'-'}</div><div class="k">${fmt(toDate(d.createdAt)||new Date())}</div>`;
  el.append(left,right); return el;
}

/* ===== 픽업 / 반납 ===== */
async function pickupTask(id){
  try{
    if(!cur) return alert('로그인이 필요합니다.');
    const ref=doc(db,'wardTasks',id);
    const snap=await getDoc(ref); const x=snap.data();
    if(!x) return;
    if(x.assignedTo?.uid) return toast('이미 다른 분이 픽업했습니다.','warn');
    await updateDoc(ref,{
      assignedTo:{ uid:cur.uid, name:(auth.currentUser?.displayName||'사용자') },
      updatedAt:serverTimestamp(),
      'timestamps.assignedAt':serverTimestamp()
    });
    const found=snapshotData.find(t=>t.id===id);
    if(found){ found.assignedTo={ uid:cur.uid, name:(auth.currentUser?.displayName||'사용자') }; render(); }
    toast('업무를 픽업했습니다.','success'); playChime('join');
  }catch(e){ console.error(e); toast('픽업 실패','error'); }
}

async function dropTask(id){
  try{
    if(!cur) return alert('로그인이 필요합니다.');
    const ref=doc(db,'wardTasks',id);
    const snap=await getDoc(ref); const x=snap.data();
    if(!x) return;
    if(x.assignedTo?.uid!==cur.uid && !isAdmin) return alert('담당자만 가능합니다.');
    await updateDoc(ref,{
      assignedTo:deleteField(),status:'open',
      updatedAt:serverTimestamp(),'timestamps.reopenedAt':serverTimestamp()
    });
    const found=snapshotData.find(t=>t.id===id);
    if(found){ delete found.assignedTo; found.status='open'; render(); }
    toast('픽업을 취소했습니다.','warn'); playChime('leave');
  }catch(e){ console.error(e); toast('취소 실패','error'); }
}

/* ===== 상태전환 ===== */
async function quickStatus(id,next){
  try{
    const ref=doc(db,'wardTasks',id);
    const snap=await getDoc(ref); const curDoc=snap.data();
    if(curDoc?.assignedTo?.uid && curDoc.assignedTo.uid!==cur?.uid && !isAdmin)
      return toast('담당자만 변경할 수 있습니다.','error');
    const patch={status:next,updatedAt:serverTimestamp()};
    if(next==='in_progress') patch['timestamps.startedAt']=serverTimestamp();
    if(next==='done') patch['timestamps.doneAt']=serverTimestamp();
    if(next==='open') patch['timestamps.reopenedAt']=serverTimestamp();
    await updateDoc(ref,patch);
    const found=snapshotData.find(t=>t.id===id);
    if(found){ found.status=next; render(); }
    toast(`상태를 '${next}'로 변경했습니다.`,'info'); playChime('note');
  }catch(e){ console.error(e); toast('변경 실패','error'); }
}

/* ===== 삭제 ===== */
async function delTask(id){
  if(!confirm('삭제하시겠습니까?')) return;
  await deleteDoc(doc(db,'wardTasks',id));
  snapshotData=snapshotData.filter(t=>t.id!==id);
  render();
  toast('삭제되었습니다.','warn'); playChime('leave');
}

/* ===== 차트 (Chart.js) ===== */
let statusChart=null, surgeryChart=null;
function updateStatusChart(open,prog,done){
  const ctx=document.getElementById('statusChart')?.getContext('2d'); if(!ctx) return;
  const data={labels:['대기','진행중','완료'],datasets:[{data:[open,prog,done],backgroundColor:['#334155','#2563eb','#16a34a']}]};
  const opt={plugins:{legend:{labels:{color:'#e5e7eb'}}}};
  if(statusChart){statusChart.data.datasets[0].data=[open,prog,done];statusChart.update();}
  else{statusChart=new Chart(ctx,{type:'doughnut',data,options:opt});}
}

/* ===== 수술 ===== */
let unsubSurgery=null, surgeryData=[];
function subscribeSurgeryByDate(ymd,notify){
  try{unsubSurgery&&unsubSurgery();}catch{}
  const start=parseYMD(ymd); const end=new Date(start); end.setDate(end.getDate()+1);
  const qy=query(
    collection(db,'surgeries'),
    where('createdAt','>=',Timestamp.fromDate(start)),
    where('createdAt','<',Timestamp.fromDate(end)),
    orderBy('createdAt','desc')
  );
  unsubSurgery=onSnapshot(qy,snap=>{
    surgeryData=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderSurgery();
  });
}

const opWaitEl=$('#op-wait'), opProgEl=$('#op-prog'), opDoneEl=$('#op-done'), surgListEl=$('#surg-list');
function renderSurgery(){
  const base=surgeryData.map(x=>({...x,status:x.status||'waiting'}));
  const C={w:base.filter(x=>x.status==='waiting').length,p:base.filter(x=>x.status==='operating').length,d:base.filter(x=>x.status==='done').length};
  opWaitEl.textContent=C.w; opProgEl.textContent=C.p; opDoneEl.textContent=C.d;
  updateSurgeryChart(C.w,C.p,C.d);
  if(!base.length){ surgListEl.innerHTML='<div class="k">오늘 수술이 없습니다.</div>'; return; }
  const frag=document.createDocumentFragment();
  base.slice(0,5).forEach(x=>{
    const el=document.createElement('div');
    el.className='s-item';
    el.innerHTML=`<div><b>${esc(x.surgeryName||'-')}</b><div class="k">${fmt(toDate(x.createdAt)||new Date())}</div></div>
      <div><span class="chip ${x.status==='done'?'stat-done':x.status==='operating'?'stat-prog':'stat-open'}">${x.status}</span></div>`;
    frag.append(el);
  });
  surgListEl.innerHTML=''; surgListEl.append(frag);
}
function updateSurgeryChart(w,p,d){
  const ctx=document.getElementById('surgeryChart')?.getContext('2d'); if(!ctx) return;
  const data={labels:['대기','진행중','완료'],datasets:[{data:[w,p,d],backgroundColor:['#6b7280','#f59e0b','#10b981']}]};
  const opt={plugins:{legend:{labels:{color:'#e5e7eb'}}}};
  if(surgeryChart){surgeryChart.data.datasets[0].data=[w,p,d];surgeryChart.update();}
  else{surgeryChart=new Chart(ctx,{type:'doughnut',data,options:opt});}
}
/* =====================================================
   woori-dashboard.js (Part 3 / 3)
   - Chat drawer + badge + iframe sync
   - Password modal
   - Hamburger menu / logout
===================================================== */

/* ======== Chat Drawer & Badge ======== */
const chatBtn = document.getElementById('btn-chat');
const chatBadge = document.getElementById('chat-badge');
const chatFab = document.getElementById('chat-fab');
const chatFabBadge = document.getElementById('chat-fab-badge');
const chatDim = document.getElementById('chat-dim');
const chatDrawer = document.getElementById('chat-drawer');
const chatClose = document.getElementById('chat-close');
const chatFrame = document.getElementById('chat-frame');
const CHAT_ROOM = 'global';

let chatOpen = false;
const LS_LAST_READ_KEY = `freetalk_chat_lastRead_${CHAT_ROOM}`;
const getLastRead = () => Number(localStorage.getItem(LS_LAST_READ_KEY) || 0);
const setLastReadNow = () => localStorage.setItem(LS_LAST_READ_KEY, String(Date.now()));
const setBadge = (el,n)=>{if(!el)return;if(n>0){el.style.display='inline-block';el.textContent=(n>99?'99+':String(n));}else{el.style.display='none';}};

/* Firestore unread badge */
let stopChatSnap=null,lastUnreadCount=-1;
function subscribeChatBadge(){
  const qy=query(collection(db,'rooms',CHAT_ROOM,'messages'),orderBy('createdAt','asc'),limit(200));
  stopChatSnap=onSnapshot(qy,snap=>{
    const last=getLastRead(); let unread=0;
    snap.forEach(d=>{const ts=d.data()?.createdAt; const ms=ts?.toMillis?.()||0; if(ms>last) unread++;});
    if(unread!==lastUnreadCount){
      setBadge(chatBadge,unread); setBadge(chatFabBadge,unread);
      document.title=unread>0?`(${unread}) 대시보드`:'대시보드';
      lastUnreadCount=unread;
    }
  });
}
subscribeChatBadge();

/* Drawer open/close */
function ensureChatSrc(){
  if(!chatFrame?.getAttribute('src'))
    chatFrame?.setAttribute('src',`chat.html?room=${CHAT_ROOM}&embed=1`);
}
function markChatReadNow(){
  setLastReadNow(); setBadge(chatBadge,0); setBadge(chatFabBadge,0);
  document.title='대시보드';
}
function openChat(){
  if(!auth.currentUser) return alert('로그인 후 이용해주세요.');
  ensureChatSrc(); if(chatDim) chatDim.style.display='block';
  chatDrawer?.classList.add('open'); chatDrawer?.setAttribute('aria-hidden','false');
  chatOpen=true; markChatReadNow();
}
function closeChat(){
  chatDrawer?.classList.remove('open'); chatDrawer?.setAttribute('aria-hidden','true');
  if(chatDim) chatDim.style.display='none';
  chatOpen=false;
}
chatBtn?.addEventListener('click',openChat);
chatFab?.addEventListener('click',openChat);
chatDim?.addEventListener('click',closeChat);
chatClose?.addEventListener('click',closeChat);
window.addEventListener('keydown',e=>{if(e.key==='Escape')closeChat();});
ensureChatSrc();

/* Chat message events (new/read) */
let lastChatToastAt=0;
window.addEventListener('message',e=>{
  const fromChat=(e.source===chatFrame?.contentWindow);
  if(!fromChat||e.origin!==location.origin)return;
  const data=e.data||{};
  if(data.type==='chat:new'&&data.room===CHAT_ROOM){
    if(!chatOpen&&document.visibilityState==='visible'){
      const now=Date.now(); if(now-lastChatToastAt>5000){
        toast('새 채팅이 도착했습니다.','info'); playChime('note'); lastChatToastAt=now;
      }
    }
  }else if(data.type==='chat:read'&&data.room===CHAT_ROOM){ markChatReadNow(); }
});
window.addEventListener('focus',()=>{if(chatOpen)markChatReadNow();});

/* ======== Password Modal ======== */
const pwModal=$('#pw-modal');
const pwCancel=$('#pw-cancel');
const pwSave=$('#pw-save');
const pwCur=$('#pw-current');
const pwNew1=$('#pw-new1');
const pwNew2=$('#pw-new2');
const btnChangePw=$('#btn-pw');

function openPwModal(){
  if(!auth.currentUser) return alert('로그인이 필요합니다.');
  pwCur.value='';pwNew1.value='';pwNew2.value='';
  pwModal.style.display='flex'; pwModal.removeAttribute('inert'); pwModal.setAttribute('aria-hidden','false');
  pwCur.focus();
}
function closePwModal(){
  pwModal.style.display='none'; pwModal.setAttribute('aria-hidden','true'); pwModal.setAttribute('inert','');
}
btnChangePw?.addEventListener('click',openPwModal);
pwCancel?.addEventListener('click',closePwModal);
pwModal?.addEventListener('click',e=>{if(e.target===pwModal)closePwModal();});
pwSave?.addEventListener('click',async()=>{
  try{
    const u=auth.currentUser; if(!u)return alert('로그인이 필요합니다.');
    const curpw=pwCur.value.trim(), n1=pwNew1.value.trim(), n2=pwNew2.value.trim();
    if(!curpw) return alert('현재 비밀번호 입력');
    if(n1.length<6) return alert('새 비밀번호는 6자 이상');
    if(n1!==n2) return alert('새 비밀번호 확인 불일치');
    const email=u.email; if(!email) return alert('이메일 정보 없음');
    const cred=EmailAuthProvider.credential(email,curpw);
    await reauthenticateWithCredential(u,cred);
    await updatePassword(u,n1);
    alert('비밀번호가 변경되었습니다.');
    closePwModal();
  }catch(e){
    const msg={
      'auth/wrong-password':'현재 비밀번호가 올바르지 않습니다.',
      'auth/weak-password':'새 비밀번호가 너무 짧습니다.',
      'auth/too-many-requests':'시도가 많습니다. 잠시 후 시도하세요.'
    }[e.code]||('오류: '+(e.message||e.code));
    alert(msg);
  }
});

/* ======== Hamburger Menu ======== */
const menuToggle=$('#menu-toggle');
const menuPanel=$('#menu-panel');
const menuClose=menuPanel?.querySelector('.menu-close');
menuToggle?.addEventListener('click',()=>{menuPanel.classList.add('show');menuPanel.setAttribute('aria-hidden','false');});
menuClose?.addEventListener('click',()=>{menuPanel.classList.remove('show');menuPanel.setAttribute('aria-hidden','true');});
menuPanel?.addEventListener('click',e=>{if(e.target===menuPanel){menuPanel.classList.remove('show');menuPanel.setAttribute('aria-hidden','true');}});
document.getElementById('openPwModal')?.addEventListener('click',e=>{e.preventDefault();menuPanel.classList.remove('show');openPwModal();});
document.getElementById('logout')?.addEventListener('click',async e=>{
  e.preventDefault();
  if(!auth.currentUser) return location.href='login.html';
  if(!confirm('로그아웃 하시겠어요?')) return;
  await logoutAndCleanup(auth.currentUser);
});
