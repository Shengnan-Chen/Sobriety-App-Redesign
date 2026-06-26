import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';

// Fixed password used behind the scenes — never shown to users.
const DEFAULT_PASSWORD = 'sobriety-app-participant';

// Tracks whether the participant-ID verification popup has been shown for the
// current login. Lives at module scope so it survives the Dashboard screen
// unmounting/remounting (e.g. during a full session) and only resets on a new
// login / logout. Reset on app cold start happens naturally (module reloads).
let verificationShownThisLogin = false;
export const wasVerificationShown = () => verificationShownThisLogin;
export const markVerificationShown = () => { verificationShownThisLogin = true; };
export const resetVerificationShown = () => { verificationShownThisLogin = false; };

// Signs in with the fixed password. If that fails (wrong password or user doesn't
// exist), calls the Cloud Function to create/fix the account, then retries.
export async function loginUser(email: string): Promise<void> {
  resetVerificationShown(); // a fresh login should show the verification popup again
  try {
    await signInWithEmailAndPassword(auth, email, DEFAULT_PASSWORD);
    console.log('[Auth] Sign-in successful for:', email);
  } catch (e: any) {
    const code = e?.code ?? '';
    console.log('[Auth] Direct sign-in failed:', code, '— calling ensureUserWithEmail');
    if (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      // Account doesn't exist or has a different password — fix it via Cloud Function
      const ensureUser = httpsCallable(functions, 'ensureUserWithEmail');
      await ensureUser({ email });
      // Retry sign-in now that the account is correct
      await signInWithEmailAndPassword(auth, email, DEFAULT_PASSWORD);
      console.log('[Auth] Sign-in successful after account fix for:', email);
    } else {
      throw e;
    }
  }
}

// Sign-up tries to create the account first, falls back to sign-in if it exists.
export async function registerUser(email: string): Promise<void> {
  try {
    await createUserWithEmailAndPassword(auth, email, DEFAULT_PASSWORD);
    console.log('[Auth] Account created for:', email);
  } catch (e: any) {
    const code = e?.code ?? '';
    if (code === 'auth/email-already-in-use') {
      // Already exists — just sign in
      await loginUser(email);
    } else {
      throw e;
    }
  }
}

export const logoutUser = () => {
  resetVerificationShown();
  return signOut(auth);
};

export const onAuthChanged = (cb: (user: User | null) => void) =>
  onAuthStateChanged(auth, cb);
