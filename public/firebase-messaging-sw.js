importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyC_U_pYSYWNm6Q1ufFwQE_tYlQZIYeDU0g",
    authDomain: "gitdelivr.in",
    projectId: "cdn-generator",
    storageBucket: "cdn-generator.firebasestorage.app",
    messagingSenderId: "44677120607",
    appId: "1:44677120607:web:b4719f7b7c6414cd19d1ea",
    measurementId: "G-9RK16SGB09"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/favicon.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});