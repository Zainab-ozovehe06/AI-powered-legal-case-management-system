import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: Replace with your actual Firebase config later
const firebaseConfig = {
  apiKey: "AIzaSyDA0CPgXfxc2kQctBN7xaTYsxUZC1k4yvQ",
  authDomain: "legal-case-management-sy-fcca7.firebaseapp.com",
  projectId: "legal-case-management-sy-fcca7",
  storageBucket: "legal-case-management-sy-fcca7.firebasestorage.app",
  messagingSenderId: "241445097218",
  appId: "1:241445097218:web:25bc866659a948af207c1b",
  measurementId: "G-LV654ZQHNS"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
