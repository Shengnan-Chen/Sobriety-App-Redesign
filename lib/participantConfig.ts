import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@participant_config';

export interface ParticipantConfig {
  fullId: string;       // e.g. '2872-1-1-1'  — as shown in Empatica Care Lab app
  serialNumber: string; // e.g. '3YK671D258'  — watch serial from Empatica Care Lab app
  // Derived S3 identifiers (computed at setup time, stored for quick access)
  orgId: string;        // '2872'
  siteId: string;       // '1'
  participantId: string;// '1'
  subjectId: string;    // '1-1-1'
  deviceId: string;     // '1-3YK671D258'
}

/** Parses the two visible Empatica fields into all S3 identifiers we need. */
export function parseParticipantConfig(
  fullId: string,
  serialNumber: string,
): ParticipantConfig | null {
  const parts = fullId.trim().split('-');
  if (parts.length < 4) return null;
  const [orgId, siteId, participantId] = parts;
  if (!orgId || !siteId || !participantId) return null;
  const serial    = serialNumber.trim().toUpperCase(); // normalise — S3 keys are uppercase
  const subjectId = parts.slice(1).join('-');          // '1-1-1'
  const deviceId  = `${siteId}-${serial}`;             // '1-3YK671D258'
  return { fullId: fullId.trim(), serialNumber: serial, orgId, siteId, participantId, subjectId, deviceId };
}

export async function saveParticipantConfig(config: ParticipantConfig): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export async function loadParticipantConfig(): Promise<ParticipantConfig | null> {
  const json = await AsyncStorage.getItem(STORAGE_KEY);
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}

export async function clearParticipantConfig(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
