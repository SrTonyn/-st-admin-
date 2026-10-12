/**
 * Cofre da chave privada: os 32 bytes da chave ficam no aparelho
 * criptografados com AES-GCM, usando uma chave derivada do PIN (PBKDF2,
 * 600 mil rodadas). Sem o PIN não dá para gerar chaves, mesmo com acesso aos
 * dados do navegador. A chave aberta só existe na memória enquanto o app
 * está desbloqueado.
 */
const ITERATIONS = 600000;

function toB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(pin, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Tranca a chave com o PIN. Devolve um objeto que pode ser salvo como JSON. */
export async function seal(seed, pin, publicKeyHex, fingerprint) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt, ITERATIONS);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, seed));
  return { v: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: toB64(salt), iv: toB64(iv), data: toB64(ct), pub: publicKeyHex, fingerprint, createdAt: Date.now() };
}

/** Abre o cofre. PIN errado = erro. */
export async function open(vault, pin) {
  const key = await deriveKey(pin, fromB64(vault.salt), vault.iterations || ITERATIONS);
  try {
    const seed = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(vault.iv) }, key, fromB64(vault.data)));
    if (seed.length !== 32) throw new Error('tamanho');
    return seed;
  } catch {
    throw Object.assign(new Error('PIN incorreto.'), { code: 'BAD_PIN' });
  }
}
