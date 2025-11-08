import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getMessaging, getToken, onMessage, isSupported
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, setDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const cfg = {
  apiKey: "AIzaSyACn_-2BLztKYmBKXtrKNtMsC-2Y238oug",
  authDomain: "woori-1ecf5.firebaseapp.com",
  projectId: "woori-1ecf5",
  messagingSenderId: "1073097361525",
  appId: "1:1073097361525:web:3218ced6a040aaaf4d503c"
};

const app = initializeApp(cfg);
const auth = getAuth(app);
const db   = getFirestore(app);

let vapidKey = "BDR1RJklUhPgWbxUpsX-T9tsRCJamok1icmmkSgaz2NGoTj0HiaMpuJ7jY2hsPibWdIlZfC3XnuvMlA6TxOKQfQ"; // 👉 Web Push 인증 키(있으면 입력). 없으면 Firebase 콘솔에서 발급.

(async () => {
  if (!(await isSupported())) return;

  const messaging = getMessaging(app);

  // 포그라운드 수신: 페이지가 보일 땐 시스템 알림 대신 UI만
  onMessage(messaging, (payload) => {
    const d = payload?.data || {};
    if (document.visibilityState === 'visible') {
      // TODO: 여기에 대시보드 토스트/사운드 표시만 처리
      // showToast(d.title || '새 알림', d.body || '');
      // playIMChime();
      return;
    }
    // 백그라운드 알림은 SW가 처리함 → 여기서 Notification API 호출 금지
  });

  // 로그인 사용자 기준으로 토큰 발급/저장
  onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    try {
      // 서비스 워커 등록이 먼저 끝나 있어야 함
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });

      const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: await navigator.serviceWorker.ready });
      if (!token) return;

      const tokenRef = doc(db, `users/${user.uid}/fcmTokens/${token}`);
      await setDoc(tokenRef, {
        createdAt: serverTimestamp(),
        ua: navigator.userAgent,
        platform: navigator.platform,
        lang: navigator.language
      }, { merge: true });
    } catch (e) {
      console.error('FCM 토큰 등록 실패:', e);
    }
  });

  // (선택) 로그아웃 훅에서 토큰 정리 예시
  // export async function removeCurrentToken() {
  //   const user = auth.currentUser;
  //   if (!user) return;
  //   const token = await getToken(messaging, { vapidKey });
  //   if (token) await deleteDoc(doc(db, `users/${user.uid}/fcmTokens/${token}`));
  // }
})();