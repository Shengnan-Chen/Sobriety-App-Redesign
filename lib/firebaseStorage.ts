import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  return response.blob();
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
    const blob = await uriToBlob(localUri);
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob);
    const url = await getDownloadURL(storageRef);
    console.log(`[Storage] Video uploaded: ${url}`);
    return url;
  } catch (e) {
    console.log('[Storage] Video upload error:', e);
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
    const blob = await uriToBlob(localUri);
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob);
    const url = await getDownloadURL(storageRef);
    console.log(`[Storage] Audio uploaded: ${url}`);
    return url;
  } catch (e) {
    console.log('[Storage] Audio upload error:', e);
    return null;
  }
}
