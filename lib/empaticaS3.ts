import { EMPATICA_S3, EMPATICA_PARTICIPANT } from './empaticaConfig';

// ─── Pure-JS HMAC-SHA256 (no native crypto needed) ────────────────────────────
// Based on the SHA-256 / HMAC-SHA256 spec, runs in Hermes JS engine.

function toHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

// SHA-256 pure JS implementation
function sha256(data: Uint8Array): Uint8Array {
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  let [h0,h1,h2,h3,h4,h5,h6,h7] = [
    0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
    0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19,
  ];
  const msgLen = data.length;
  const bitLen = msgLen * 8;
  const padLen = ((55 - msgLen) % 64 + 64) % 64 + 1;
  const padded = new Uint8Array(msgLen + padLen + 8);
  padded.set(data);
  padded[msgLen] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLen >>> 0, false);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), false);

  for (let off = 0; off < padded.length; off += 64) {
    const w = new Uint32Array(64);
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>>3);
      const s1 = rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>>10);
      w[i] = (w[i-16]+s0+w[i-7]+s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = [h0,h1,h2,h3,h4,h5,h6,h7];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e,6)^rotr(e,11)^rotr(e,25);
      const ch = (e&f)^(~e&g);
      const tmp1 = (h+S1+ch+K[i]+w[i]) >>> 0;
      const S0 = rotr(a,2)^rotr(a,13)^rotr(a,22);
      const maj = (a&b)^(a&c)^(b&c);
      const tmp2 = (S0+maj) >>> 0;
      h=g; g=f; f=e; e=(d+tmp1)>>>0;
      d=c; c=b; b=a; a=(tmp1+tmp2)>>>0;
    }
    h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0;
    h4=(h4+e)>>>0; h5=(h5+f)>>>0; h6=(h6+g)>>>0; h7=(h7+h)>>>0;
  }
  const out = new Uint8Array(32);
  const outDv = new DataView(out.buffer);
  [h0,h1,h2,h3,h4,h5,h6,h7].forEach((v,i) => outDv.setUint32(i*4,v,false));
  return out;
}

function rotr(x: number, n: number) { return (x>>>n)|(x<<(32-n)); }

function hmacSha256(key: Uint8Array | string, data: string): Uint8Array {
  const enc = new TextEncoder();
  let k = typeof key === 'string' ? enc.encode(key) : key;
  if (k.length > 64) k = sha256(k);
  const ipad = new Uint8Array(64); const opad = new Uint8Array(64);
  for (let i=0;i<64;i++){ipad[i]=(k[i]||0)^0x36;opad[i]=(k[i]||0)^0x5c;}
  const inner = new Uint8Array(64+data.length);
  inner.set(ipad); inner.set(enc.encode(data),64);
  const outer = new Uint8Array(64+32);
  outer.set(opad); outer.set(sha256(inner),64);
  return sha256(outer);
}

// ─── AWS Signature V4 presigned URL ───────────────────────────────────────────

function isoDate(d: Date) {
  return d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
}
function isoDateShort(d: Date) { return isoDate(d).slice(0,8); }

export function presignS3Get(key: string, expirySeconds = 300): string {
  const { bucket, region, accessKeyId, secretAccessKey } = EMPATICA_S3;
  const now = new Date();
  const datetime = isoDate(now);
  const date = isoDateShort(now);
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const scope = `${date}/${region}/s3/aws4_request`;
  const credStr = `${accessKeyId}/${scope}`;

  const params = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', credStr],
    ['X-Amz-Date', datetime],
    ['X-Amz-Expires', String(expirySeconds)],
    ['X-Amz-SignedHeaders', 'host'],
  ].sort(([a],[b])=>a.localeCompare(b));

  const queryStr = params.map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const canonicalRequest = [
    'GET',
    `/${key}`,
    queryStr,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const enc = new TextEncoder();
  const strToSign = [
    'AWS4-HMAC-SHA256',
    datetime,
    scope,
    toHex(sha256(enc.encode(canonicalRequest))),
  ].join('\n');

  const sigKey = [date, region, 's3', 'aws4_request'].reduce(
    (k, v) => hmacSha256(k, v),
    enc.encode(`AWS4${secretAccessKey}`) as Uint8Array | string
  );
  const sig = toHex(hmacSha256(sigKey as Uint8Array, strToSign));

  return `https://${host}/${key}?${queryStr}&X-Amz-Signature=${sig}`;
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCSV(text: string) {
  const lines = text.trim().split('\n');
  return lines.slice(1).map(line => line.split(',').map(v => v.trim())); // skip header row
}

// ─── S3 key builder ───────────────────────────────────────────────────────────

async function findDeviceId(dateStr: string): Promise<string | null> {
  const { bucket, region } = EMPATICA_S3;
  const { orgId, siteId, participantId } = EMPATICA_PARTICIPANT;
  const prefix = `v2/${orgId}/${siteId}/${participantId}/participant_data/${dateStr}/`;
  const url = presignS3Get(`?list-type=2&prefix=${encodeURIComponent(prefix)}&delimiter=%2F`, 60);
  // Use ListObjectsV2 instead — build separate signed list request
  const listUrl = `https://${bucket}.s3.${region}.amazonaws.com/?list-type=2&prefix=${encodeURIComponent(prefix)}&delimiter=%2F`;
  // For listing we re-sign manually
  const signed = presignedList(prefix, dateStr);
  try {
    const res = await fetch(signed);
    const text = await res.text();
    const match = text.match(/<Prefix>([^<]+?\/)<\/Prefix>/g);
    if (!match) return null;
    for (const m of match) {
      const val = m.replace(/<\/?Prefix>/g,'').replace(prefix,'').replace('/','');
      if (val && val !== '') return val;
    }
    return null;
  } catch { return null; }
}

function presignedList(prefix: string, dateStr: string): string {
  const { bucket, region, accessKeyId, secretAccessKey } = EMPATICA_S3;
  const now = new Date();
  const datetime = isoDate(now);
  const date = isoDateShort(now);
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const scope = `${date}/${region}/s3/aws4_request`;
  const credStr = `${accessKeyId}/${scope}`;

  const rawParams: [string,string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', credStr],
    ['X-Amz-Date', datetime],
    ['X-Amz-Expires', '120'],
    ['X-Amz-SignedHeaders', 'host'],
    ['delimiter', '/'],
    ['list-type', '2'],
    ['prefix', prefix],
  ].sort(([a],[b])=>a.localeCompare(b)) as [string,string][];

  const queryStr = rawParams.map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const enc = new TextEncoder();
  const canonicalRequest = ['GET','/',queryStr,`host:${host}\n`,'host','UNSIGNED-PAYLOAD'].join('\n');
  const strToSign = ['AWS4-HMAC-SHA256',datetime,scope,toHex(sha256(enc.encode(canonicalRequest)))].join('\n');
  const sigKey = [date,region,'s3','aws4_request'].reduce((k,v)=>hmacSha256(k,v), enc.encode(`AWS4${secretAccessKey}`) as Uint8Array|string);
  const sig = toHex(hmacSha256(sigKey as Uint8Array, strToSign));
  return `https://${host}/?${queryStr}&X-Amz-Signature=${sig}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type EmpaticaMinuteRow = {
  timestamp: number; // unix ms
  datetime: string;
  value: number;
};

export type EmpaticaSingleLegResult = {
  pulseRate: EmpaticaMinuteRow[];
  accelerometerStd: EmpaticaMinuteRow[];
  activityIntensity: EmpaticaMinuteRow[];
  bodyPosition: EmpaticaMinuteRow[];
};

export type EmpaticaWalkTurnResult = {
  pulseRate: EmpaticaMinuteRow[];
  accelerometerStd: EmpaticaMinuteRow[];
  stepCounts: EmpaticaMinuteRow[];
  activityIntensity: EmpaticaMinuteRow[];
};

// Keep for backward compat
export type EmpaticaGameResult = EmpaticaSingleLegResult | EmpaticaWalkTurnResult;

async function fetchMetric(
  dateStr: string,
  deviceId: string,
  metric: string,
  startMs: number,
  endMs: number,
): Promise<EmpaticaMinuteRow[]> {
  const { orgId, siteId, participantId, subjectId } = EMPATICA_PARTICIPANT;
  const key = `v2/${orgId}/${siteId}/${participantId}/participant_data/${dateStr}/${deviceId}/digital_biomarkers/aggregated_per_minute/${subjectId}_${dateStr}_${metric}.csv`;
  console.log(`[S3] Fetching metric: ${metric}`);
  console.log(`[S3] Key: ${key}`);
  const url = presignS3Get(key, 300);
  const res = await fetch(url);
  console.log(`[S3] ${metric} response status: ${res.status}`);
  if (!res.ok) {
    const errText = await res.text();
    console.log(`[S3] ${metric} error body: ${errText.slice(0, 300)}`);
    return [];
  }
  const text = await res.text();
  console.log(`[S3] ${metric} raw rows: ${text.split('\n').length}`);
  const rows = parseCSV(text);
  const filtered = rows
    .filter(r => r.length >= 4 && r[3]?.trim() !== '') // skip rows with empty value (device_not_recording etc.)
    .map(r => ({ timestamp: Number(r[0]), datetime: r[1], value: Number(r[3].trim()) }))
    .filter(r => !isNaN(r.value) && r.timestamp >= startMs - 60000 && r.timestamp <= endMs + 60000);
  console.log(`[S3] ${metric} rows in window: ${filtered.length}`);
  return filtered;
}

async function fetchBase(startTime: Date, endTime: Date, metrics: string[]) {
  const dateStr = startTime.toISOString().slice(0, 10);
  const startMs = startTime.getTime();
  const endMs = endTime.getTime();
  const deviceId = EMPATICA_PARTICIPANT.deviceId;
  console.log(`[S3] Window: ${startTime.toISOString()} → ${endTime.toISOString()}`);
  return Promise.all(metrics.map(m => fetchMetric(dateStr, deviceId, m, startMs, endMs)));
}

export async function fetchSingleLegResults(
  startTime: Date,
  endTime: Date,
): Promise<EmpaticaSingleLegResult | null> {
  try {
    const [pulseRate, accelerometerStd, activityIntensity, bodyPosition] =
      await fetchBase(startTime, endTime, [
        'pulse-rate',
        'accelerometers-std',
        'activity-intensity',
        'body-position',
      ]);
    return { pulseRate, accelerometerStd, activityIntensity, bodyPosition };
  } catch (e) {
    console.log('[Empatica] fetchSingleLegResults error:', e);
    return null;
  }
}

export async function fetchWalkTurnResults(
  startTime: Date,
  endTime: Date,
): Promise<EmpaticaWalkTurnResult | null> {
  try {
    const [pulseRate, accelerometerStd, stepCounts, activityIntensity] =
      await fetchBase(startTime, endTime, [
        'pulse-rate',
        'accelerometers-std',
        'step-counts',
        'activity-intensity',
      ]);
    return { pulseRate, accelerometerStd, stepCounts, activityIntensity };
  } catch (e) {
    console.log('[Empatica] fetchWalkTurnResults error:', e);
    return null;
  }
}
