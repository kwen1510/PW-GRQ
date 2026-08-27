import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth';

let auth;
let config;

export async function initializeAuthentication() {
  const response = await fetch('/api/config', { cache: 'no-store' });
  config = await response.json();
  if (!config.authRequired) {
    const response = await fetch('/api/me', { cache: 'no-store' });
    if (!response.ok) throw new Error('Local authentication is unavailable');
    return { required: false, user: (await response.json()).user };
  }
  if (!config.firebase) throw new Error('Firebase web configuration is missing');
  auth = getAuth(initializeApp(config.firebase));
  const user = await new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (value) => { unsubscribe(); resolve(value); });
  });
  if (!user) return { required: true, user: null };
  return { required: true, user: await verifyTeacher(user) };
}

async function verifyTeacher(user) {
  const token = await user.getIdToken();
  const verification = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!verification.ok) {
    await signOut(auth);
    const body = await verification.json().catch(() => ({}));
    throw new Error(body.error || 'This account is not authorised');
  }
  return (await verification.json()).user;
}

export async function signInTeacher(email, password) {
  if (!auth) throw new Error('Firebase authentication is not configured');
  try {
    const credential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    await verifyTeacher(credential.user);
    return credential.user;
  } catch (error) {
    await signOut(auth).catch(() => {});
    if (error.code === 'auth/too-many-requests') throw new Error('Too many sign-in attempts. Wait a few minutes and try again.');
    if (error.code === 'auth/operation-not-allowed') throw new Error('Email/password sign-in has not been enabled in Firebase yet.');
    if (error.message === 'Email or password is incorrect') throw error;
    throw new Error('Email or password is incorrect');
  }
}

export async function requestPasswordReset(email) {
  if (!auth) throw new Error('Firebase authentication is not configured');
  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
  } catch (error) {
    // Preserve the same result for unknown and known addresses to avoid account discovery.
    if (error.code === 'auth/user-not-found') return;
    if (error.code === 'auth/too-many-requests') throw new Error('Too many reset requests. Wait a few minutes and try again.');
    if (error.code === 'auth/network-request-failed') throw new Error('The password reset service could not be reached. Check your connection and try again.');
    throw new Error('The password reset request could not be completed. Try again later.');
  }
}

export async function signOutTeacher() {
  if (auth) await signOut(auth);
}

export async function idToken() {
  return auth?.currentUser ? auth.currentUser.getIdToken() : '';
}

export function currentUser() {
  return auth?.currentUser || null;
}
