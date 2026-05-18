import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey:            "AIzaSyBPONo2pMk3KRhj0wHg5oJkWx2NfTZvBtY",
  authDomain:        "sobreity-test.firebaseapp.com",
  projectId:         "sobreity-test",
  storageBucket:     "sobreity-test.firebasestorage.app",
  messagingSenderId: "983766635314",
  appId:             "1:983766635314:web:755fdfa879fe341a457d2b",
};

const app = initializeApp(firebaseConfig);
export const db      = getFirestore(app);
export const auth    = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});
export const storage = getStorage(app);
