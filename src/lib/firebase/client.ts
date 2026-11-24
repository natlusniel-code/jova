"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

if (!apiKey) {
  throw new Error(
    "Firebase is not configured: NEXT_PUBLIC_FIREBASE_API_KEY is missing."
  );
}

const firebaseConfig = {
  apiKey,
  authDomain: "jova-authentication.firebaseapp.com",
  projectId: "jova-authentication",
  storageBucket: "jova-authentication.firebasestorage.app",
  messagingSenderId: "771527043754",
  appId: "1:771527043754:web:29884a5a941e5791e37ed3",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(app);
