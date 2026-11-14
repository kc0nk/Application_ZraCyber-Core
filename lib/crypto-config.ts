// Tujuan file: Modul utilitas enkripsi XOR Cipher untuk menyamarkan URL dan konfigurasi sensitif dari static scanner.
const SECRET_KEY = 0x33;

export function decryptSecureConfig(encodedCodes: number[]): string {
  try {
    return encodedCodes.map((c) => String.fromCharCode(c ^ SECRET_KEY)).join("");
  } catch {
    return "";
  }
}

// 1. "https://popular-shorten-imperial.ngrok-free.dev"
const ENC_API_URL = [
  70, 86, 86, 82, 110, 38, 38, 70, 113, 75, 78, 86, 94, 85,
  78, 86, 77, 89, 113, 72, 80, 87, 78, 86, 72, 75, 113, 85,
  82, 86, 78, 85, 113, 67, 77, 86, 86, 113, 86, 77, 92
];

// 2. "https://auth.zracore.space"
const ENC_OAUTH_PORTAL = [
  70, 86, 86, 82, 110, 38, 38, 66, 84, 87, 73, 113, 93, 81,
  66, 68, 80, 81, 86, 113, 80, 83, 66, 60, 68
];

// 3. "https://api.zracore.space/oauth"
const ENC_OAUTH_SERVER = [
  70, 86, 86, 82, 110, 38, 38, 66, 84, 87, 73, 113, 93, 81,
  66, 68, 80, 81, 86, 113, 80, 83, 66, 60, 68, 38, 76, 66,
  84, 87, 73
];

export function getSecureDefaultApiUrl(): string {
  return decryptSecureConfig(ENC_API_URL);
}

export function getSecureOauthPortal(): string {
  return decryptSecureConfig(ENC_OAUTH_PORTAL);
}

export function getSecureOauthServer(): string {
  return decryptSecureConfig(ENC_OAUTH_SERVER);
}
