importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyACn_-2BLztKYmBKXtrKNtMsC-2Y238oug",
  authDomain: "woori-1ecf5.firebaseapp.com",
  projectId: "woori-1ecf5",
  storageBucket: "woori-1ecf5.firebasestorage.app",
  messagingSenderId: "1073097361525",
  appId: "1:1073097361525:web:3218ced6a040aaaf4d503c"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  console.log("📩 백그라운드 메시지:", payload);

  self.registration.showNotification(title || "새 알림", {
    body: body || "새로운 알림이 있습니다.",
    icon: icon || "/img/icon1101.png",
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/woori-dashboard.html"));
});
