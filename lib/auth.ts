import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';

// Participants only enter their email — Firebase Auth still requires a
// password under the hood, so every account uses this fixed placeholder.
const DEFAULT_PASSWORD = 'sobriety-app-participant';

export const registerUser = (email: string) =>
  createUserWithEmailAndPassword(auth, email, DEFAULT_PASSWORD);

export const loginUser = (email: string) =>
  signInWithEmailAndPassword(auth, email, DEFAULT_PASSWORD);

export const logoutUser = () => signOut(auth);

export const onAuthChanged = (cb: (user: User | null) => void) =>
  onAuthStateChanged(auth, cb);
