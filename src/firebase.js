import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  browserPopupRedirectResolver,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDc_mhkGwuiXS81NNXR3kWrnczPtByWlog",
  authDomain: "my-budget-app-fe8cb.firebaseapp.com",
  projectId: "my-budget-app-fe8cb",
  storageBucket: "my-budget-app-fe8cb.firebasestorage.app",
  messagingSenderId: "32037479697",
  appId: "1:32037479697:web:7e3ba53677975eab2858b0"
};

const app = initializeApp(firebaseConfig);

// 資料庫：手機網路不穩時，自動改用較穩定的連線方式，避免一直卡在「載入中」
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});

// 登入：iPhone 的 Safari／主畫面捷徑偶爾會讓 IndexedDB 卡住，
// 所以依序準備多種儲存方式，哪個能用就用哪個。App.jsx 裡的 getAuth(getApp()) 會拿到這一份。
initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
  popupRedirectResolver: browserPopupRedirectResolver,
});
