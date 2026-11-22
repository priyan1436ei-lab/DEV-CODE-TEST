import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  GoogleAuthProvider,
  getAuth,
  setPersistence,
  signInWithCredential,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

function initFirestoreClient(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    try {
      return initializeFirestore(
        app,
        {
          experimentalForceLongPolling: true,
          localCache: memoryLocalCache(),
        },
        firebaseConfig.firestoreDatabaseId
      );
    } catch {
      return getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
  }
}

export const db = initFirestoreClient();
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Persist authenticated Firebase sessions across desktop restarts & offline launches
void setPersistence(auth, browserLocalPersistence).catch(() => {
  // Non-fatal in restricted browser contexts
});

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: Array<{
      providerId?: string | null;
      email?: string | null;
    }>;
  };
}

export function isFirestoreOfflineError(error: unknown): boolean {
  if (!error) return false;
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '').toLowerCase()
      : '';
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
  const lower = message.toLowerCase();

  if (
    code === 'permission-denied' ||
    lower.includes('missing or insufficient permissions') ||
    lower.includes('permission-denied') ||
    lower.includes('quota exceeded')
  ) {
    return false;
  }

  return (
    code === 'unavailable' ||
    lower.includes('client is offline') ||
    lower.includes('could not reach cloud firestore') ||
    lower.includes('backend didn\'t respond') ||
    lower.includes('network-request-failed')
  );
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface UploadedProjectAsset {
  assetId: string;
  storagePath: string;
  downloadUrl: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

export async function uploadProjectImageToStorage(
  uid: string,
  projectId: string,
  file: Blob,
  fileName: string
): Promise<UploadedProjectAsset> {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const contentType = file.type || 'image/png';
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error('Only PNG, JPEG, WebP, GIF, and SVG images are permitted.');
  }
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
    throw new Error('Image must be smaller than 10 MB.');
  }

  const ext = fileName.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'png';
  const assetId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const storagePath = `users/${safeUid}/projects/${safeProjectId}/assets/${assetId}`;
  const fileRef = storageRef(storage, storagePath);

  await uploadBytes(fileRef, file, { contentType });
  const downloadUrl = await getDownloadURL(fileRef);

  return {
    assetId,
    storagePath,
    downloadUrl,
    fileName: fileName.slice(0, 120),
    contentType,
    sizeBytes: file.size,
  };
}

/**
 * Hybrid Google Sign-In:
 * 1. On Electron Desktop with GOOGLE_DESKTOP_OAUTH_CLIENT_ID configured: uses System Browser OAuth 2.0 + PKCE
 *    and exchanges the Google ID token via Firebase signInWithCredential() (zero auth/unauthorized-domain risk).
 * 2. On Electron Desktop (default http://localhost:<port>) and Web: uses Firebase signInWithPopup().
 *    Surfaces explicit remediation guidance if Firebase Console Authorized Domains blocks the origin.
 */
export async function signInWithGoogle(): Promise<User> {
  if (typeof window !== 'undefined' && window.devmindDesktop?.signInWithGooglePkce) {
    try {
      const oauthStatus = await window.devmindDesktop.getDesktopOAuthStatus?.();
      if (oauthStatus?.pkceConfigured) {
        const pkceTokens = await window.devmindDesktop.signInWithGooglePkce();
        const credential = GoogleAuthProvider.credential(
          pkceTokens.idToken,
          pkceTokens.accessToken ?? null
        );
        const signedIn = await signInWithCredential(auth, credential);
        return signedIn.user;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('DESKTOP_PKCE_UNCONFIGURED')) {
        throw err;
      }
    }
  }

  try {
    const credential = await signInWithPopup(auth, googleProvider);
    return credential.user;
  } catch (err) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code || '')
        : '';
    if (code === 'auth/unauthorized-domain') {
      const currentOrigin =
        typeof window !== 'undefined' ? window.location.origin : 'unknown origin';
      throw new Error(
        `Firebase Auth rejected "${currentOrigin}" (auth/unauthorized-domain). ` +
          `Add "${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}" under Firebase Console → Authentication → Settings → Authorized domains, ` +
          `or set GOOGLE_DESKTOP_OAUTH_CLIENT_ID to use System Browser PKCE sign-in on Desktop.`
      );
    }
    throw err;
  }
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore connection check deferred: client is currently offline.');
    }
  }
}

void testConnection();
