const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const DEFAULT_PASSWORD_HASH_ITERATIONS = 75000;

export function normalizeLicenseKey(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function sha256Hex(value, pepper = "") {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(`${pepper}${value}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashLicenseKey(licenseKey, pepper) {
  return sha256Hex(normalizeLicenseKey(licenseKey), pepper);
}

export async function hashSessionToken(token, pepper) {
  return sha256Hex(token, pepper);
}

export async function hashPassword(password, pepper = "", iterations = DEFAULT_PASSWORD_HASH_ITERATIONS) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(`${pepper}${password}`), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256
  );
  return `pbkdf2-sha256:${iterations}:${base64UrlEncode(salt)}:${base64UrlEncode(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, storedHash, pepper = "") {
  const [algo, iterationsText, saltText, hashText] = String(storedHash || "").split(":");
  if (algo !== "pbkdf2-sha256" || !iterationsText || !saltText || !hashText) return false;
  const iterations = Number(iterationsText);
  const salt = base64UrlDecode(saltText);
  const expected = base64UrlDecode(hashText);
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(`${pepper}${password}`), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    expected.byteLength * 8
  );
  return timingSafeEqual(new Uint8Array(bits), expected);
}

export async function encryptString(plainText, secret, keyVersion = "v1") {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const key = await importAesKey(secret);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, textEncoder.encode(String(plainText || "")));
  return `${keyVersion}:${base64UrlEncode(iv)}:${base64UrlEncode(new Uint8Array(cipher))}`;
}

export async function decryptString(payload, secret) {
  const [, ivText, cipherText] = String(payload || "").split(":");
  if (!ivText || !cipherText) throw new Error("Invalid encrypted payload");
  const key = await importAesKey(secret);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlDecode(ivText) },
    key,
    base64UrlDecode(cipherText)
  );
  return textDecoder.decode(plain);
}

async function importAesKey(secret) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function timingSafeEqual(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function constantTimeEqualString(a, b) {
  const left = new Uint8Array(await crypto.subtle.digest("SHA-256", textEncoder.encode(String(a || ""))));
  const right = new Uint8Array(await crypto.subtle.digest("SHA-256", textEncoder.encode(String(b || ""))));
  return timingSafeEqual(left, right);
}

export function last4(value) {
  return String(value || "").slice(-4);
}

export function requireSecret(env, name) {
  const value = env?.[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = String(value).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(String(value).length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
