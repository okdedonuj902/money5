import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDc_mhkGwuiXS81NNXR3kWrnczPtByWlog",
  authDomain: "my-budget-app-fe8cb.firebaseapp.com",
  projectId: "my-budget-app-fe8cb",
  storageBucket: "my-budget-app-fe8cb.firebasestorage.app",
  messagingSenderId: "32037479697",
  appId: "1:32037479697:web:7e3ba53677975eab2858b0"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

