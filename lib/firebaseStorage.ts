import { ref, getDownloadURL } from 'firebase/storage';
import { auth, storage } from './firebase';
import * as FileSystem from 'expo-file-system/legacy';
import { retryAsync } from './retry';

const BUCKET = 'sobreity-test.firebasestorage.app';

// Streams the file directly to Firebase Storage REST API using native code.
// Avoids loading the file into a JS Blob, which fails for large videos on Android.
async function nativeUpload(
  localUri: string,
  storagePath: string,
  contentType: string,
): Promise<string> {
  const token = await auth.currentUser?.getIdToken();
  const encodedPath = encodeURIComponent(storagePath);
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?uploadType=media&name=${encodedPath}`;

  const result = await FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      ...(token ? { Authorization: `Firebase ${token}` } : {}),
      'Content-Type': contentType,
    },
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Upload HTTP ${result.status}: ${result.body.slice(0, 200)}`);
  }

  return getDownloadURL(ref(storage, storagePath));
}

export async function uploadVideo(
  localUri: string,
  participantId: string,
  gameType: string,
  label: string,
): Promise<string | null> {
  try {
    const timestamp = Date.now();
    const path = `videos/${participantId}/${gameType}/${label}_${timestamp}.mp4`;
    console.log(`[Storage] Uploading video: ${path}`);
    // Retry on transient network failures so a flaky connection doesn't lose the recording.
    const url = await retryAsync(() => nativeUpload(localUri, path, 'video/mp4'), 3, 2000);
    console.log(`[Storage] Video uploaded: ${url}`);
    return url;
  } catch (e) {
    console.log('[Storage] Video upload error (all retries failed):', e);
    return null;
  }
}

export async function uploadAudio(
  localUri: string,
  participantId: string,
  phrase: string,
  index: number,
): Promise<string | null> {
  try {
    const timestamp = Date.now();
    const safeName = phrase.replace(/[^a-z0-9]/gi, '_').slice(0, 30);
    const path = `audio/${participantId}/tongue_twister/${index}_${safeName}_${timestamp}.m4a`;
    console.log(`[Storage] Uploading audio: ${path}`);
    const url = await nativeUpload(localUri, path, 'audio/m4a');
    console.log(`[Storage] Audio uploaded: ${url}`);
    return url;
  } catch (e) {
    console.log('[Storage] Audio upload error:', e);
    return null;
  }
}
