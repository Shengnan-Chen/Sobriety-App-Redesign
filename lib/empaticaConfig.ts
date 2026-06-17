// AWS S3 bucket + credentials config.
// accessKeyId / secretAccessKey must be set in .env as
// EXPO_PUBLIC_AWS_ACCESS_KEY_ID and EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY.
export const EMPATICA_S3 = {
  bucket:          'empatica-us-east-1-prod-data',
  region:          'us-east-1',
  accessKeyId:     process.env.EXPO_PUBLIC_AWS_ACCESS_KEY_ID     ?? '',
  secretAccessKey: process.env.EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY ?? '',
};

// Runtime participant config — set once at app startup from AsyncStorage.
// Falls back to empty strings so nothing crashes before setup is complete.
let _orgId         = '';
let _siteId        = '';
let _participantId = '';
let _deviceId      = '';
let _subjectId     = '';
let _fullId        = '';

export function setActiveParticipant(config: {
  orgId: string;
  siteId: string;
  participantId: string;
  deviceId: string;
  subjectId: string;
  fullId: string;
}) {
  _orgId         = config.orgId;
  _siteId        = config.siteId;
  _participantId = config.participantId;
  _deviceId      = config.deviceId;
  _subjectId     = config.subjectId;
  _fullId        = config.fullId;
}

export const EMPATICA_PARTICIPANT = {
  get orgId()         { return _orgId; },
  get siteId()        { return _siteId; },
  get participantId() { return _participantId; },
  get deviceId()      { return _deviceId; },
  get subjectId()     { return _subjectId; },
  get fullId()        { return _fullId; },
};
