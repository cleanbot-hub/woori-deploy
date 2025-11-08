// /js/request.js (알림 연동 완성판)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, doc, getDoc, updateDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyACn_-2BLztKYmBKXtrKNtMsC-2Y238oug",
  authDomain: "woori-1ecf5.firebaseapp.com",
  projectId: "woori-1ecf5",
  storageBucket: "woori-1ecf5.firebasestorage.app",
  messagingSenderId: "1073097361525",
  appId: "1:1073097361525:web:3218ced6a040aaaf4d503c"
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {});
const auth = getAuth(app);

const $ = id => document.getElementById(id);
const q = k => new URL(location.href).searchParams.get(k);

const box = $('detail-box');
const loading = $('loading');
const title = $('req-title');
const meta = $('req-meta');
const note = $('req-note');
const actions = $('req-actions');
const statusBox = $('req-status');

let currentTaskId = q('id');
let currentUser = null;

if (!currentTaskId) loading.textContent = '잘못된 요청입니다.';

/* 로그인 감시 */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    loading.textContent = '로그인이 필요합니다.';
    return;
  }
  currentUser = user;
  await loadRequest();
});

async function loadRequest() {
  try {
    const ref = doc(db, 'wardTasks', currentTaskId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      loading.textContent = '존재하지 않는 요청입니다.';
      return;
    }

    const x = snap.data();
    loading.style.display = 'none';
    box.style.display = 'block';
    title.textContent = x.category === 'misc' ? `[기타] ${x.title || ''}` : `[이송] ${x.dept || ''}`;
    meta.textContent =
      `요청자: ${x.createdBy?.name || '-'} · 우선순위: ${x.priority || '-'} · 상태: ${x.status || 'open'}`;
    note.textContent = x.note || '(메모 없음)';

    renderActions(x);

  } catch (e) {
    loading.textContent = `불러오기 오류: ${e.message || e}`;
  }
}

function renderActions(x) {
  actions.innerHTML = '';
  statusBox.innerHTML = '';

  const statusLabel = {
    open: '대기중',
    in_progress: '진행중',
    done: '완료됨',
    cancelled: '취소됨'
  }[x.status] || x.status;

  statusBox.innerHTML = `<span class="chip stat-${x.status || 'open'}">${statusLabel}</span>`;

  const isOwner = x.createdBy?.uid === currentUser.uid;
  const isWorker = x.assignedTo?.uid === currentUser.uid;

  // 대기중 → 다른 사용자가 수락 가능
  if (x.status === 'open' && !isOwner && !x.assignedTo?.uid) {
    actions.appendChild(btn('수락하기', async () => {
      await updateDoc(doc(db, 'wardTasks', currentTaskId), {
        assignedTo: {
          uid: currentUser.uid,
          name: currentUser.displayName || '사용자'
        },
        status: 'in_progress',
        updatedAt: serverTimestamp(),
        'timestamps.startedAt': serverTimestamp()
      });
      alert('요청을 수락했습니다.');
      await loadRequest();
    }));
  }

  // 수행자 → 완료 버튼
  if (x.status === 'in_progress' && isWorker) {
    actions.appendChild(btn('완료하기', async () => {
      await updateDoc(doc(db, 'wardTasks', currentTaskId), {
        status: 'done',
        updatedAt: serverTimestamp(),
        'timestamps.doneAt': serverTimestamp()
      });
      alert('업무를 완료했습니다.');
      await loadRequest();
    }));
  }

  // 요청자 → 취소 버튼
  if (x.status === 'open' && isOwner && !x.assignedTo?.uid) {
    actions.appendChild(btn('요청 취소', async () => {
      if (!confirm('이 요청을 취소하시겠습니까?')) return;
      await updateDoc(doc(db, 'wardTasks', currentTaskId), {
        status: 'cancelled',
        updatedAt: serverTimestamp()
      });
      alert('요청이 취소되었습니다.');
      await loadRequest();
    }, 'danger'));
  }

  // 완료/취소 후 메시지
  if (['done', 'cancelled'].includes(x.status)) {
    actions.innerHTML = `<div class="k">${x.status === 'done' ? '✅ 완료된 요청입니다.' : '❌ 취소된 요청입니다.'}</div>`;
  }
}

function btn(label, fn, extra = '') {
  const b = document.createElement('button');
  b.className = 'btn ' + (extra || '');
  b.textContent = label;
  b.onclick = fn;
  return b;
}

window.addEventListener('DOMContentLoaded', () => {
  $('main-page')?.addEventListener('click', () => (location.href = '/index.html'));
});
