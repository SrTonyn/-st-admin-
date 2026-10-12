/**
 * Chaves de licença do ST Optimizer Pro (formato ST6), no navegador.
 *
 * É o mesmo formato de src/main/license/keys.js do app do PC:
 *   15 bytes de dados (versão · plano · dia de emissão · duração · código do PC · série)
 *   + 64 bytes de assinatura Ed25519, em base32 (Crockford), agrupados de 6 em 6.
 * Uma chave gerada aqui é aceita pelo app do PC (e vice-versa) desde que o
 * .pem seja o mesmo usado para gerar o instalador.
 */
import * as ed from './vendor/noble-ed25519.mjs';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PREFIX = 'ST6';
const DOMAIN = new TextEncoder().encode('ST-OPTIMIZER-PRO/LICENSE/v1');
export const EPOCH = Date.UTC(2024, 0, 1);
export const DAY = 86400000;
const PAYLOAD_LEN = 15;
const SIG_LEN = 64;

export const PLANS = {
  1: { id: 'mensal', label: 'Mensal', days: 30 },
  2: { id: 'anual', label: 'Anual', days: 365 },
  3: { id: 'vitalicio', label: 'Vitalício', days: 0 },
  4: { id: 'teste', label: 'Teste', days: 3 },
  5: { id: 'personalizado', label: 'Personalizado', days: null },
};
export const PLAN_BY_ID = Object.fromEntries(Object.entries(PLANS).map(([n, p]) => [p.id, { ...p, code: Number(n) }]));
export const PLAN_ORDER = ['mensal', 'anual', 'vitalicio', 'teste', 'personalizado'];

export function b32encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function b32decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error('caractere inválido');
    value = ((value << 5) | v) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

function group(s, size = 6) {
  return s.match(new RegExp(`.{1,${size}}`, 'g')).join('-');
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const u16 = (b, o) => (b[o] << 8) | b[o + 1];
const u32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];

/** Código do PC no formato que o cliente vê na tela Licença (ex.: 7KQ2-M9XD). */
export function parseMachineCode(code) {
  if (!code || !String(code).trim()) return null;
  let buf;
  try { buf = b32decode(code); } catch { buf = null; }
  if (!buf || buf.length !== 5 || String(code).replace(/[\s-]/g, '').length !== 8) {
    throw new Error('Código do PC inválido. São 8 letras/números, como 7KQ2-M9XD.');
  }
  return buf;
}

export function formatMachineCode(code) {
  return group(b32encode(parseMachineCode(code)), 4);
}

export function dayNumber(ms) {
  return Math.floor((ms - EPOCH) / DAY);
}

/** Último dia de validade (dd/mm/aaaa). Os dias da chave contam em UTC, como no app do PC. */
export function validUntilText(expiresAt) {
  if (!expiresAt) return null;
  return new Date(expiresAt - DAY).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

/**
 * Data de início para RENOVAR sem o cliente perder os dias que ainda tem:
 * a chave nova começa no último dia da chave atual.
 */
export function renewalStart(currentExpiresAt, now = Date.now()) {
  if (!currentExpiresAt || currentExpiresAt <= now) return now;
  return currentExpiresAt - DAY;
}

/**
 * Gera uma chave.
 * @param {Uint8Array} seed chave privada Ed25519 (32 bytes, do .pem)
 */
export async function issueKey(seed, { plan = 'mensal', days, machine = null, issuedAt = Date.now(), serial } = {}) {
  const p = PLAN_BY_ID[plan];
  if (!p) throw new Error(`Plano desconhecido: ${plan}`);
  let duration = days !== undefined && days !== null && days !== '' ? Number(days) : p.days;
  if (p.id === 'vitalicio') duration = 0;
  if (!Number.isInteger(duration) || duration < 0 || duration > 65535) throw new Error('Duração inválida (0 a 65535 dias).');
  if (p.id !== 'vitalicio' && duration === 0) throw new Error('Informe a duração em dias.');
  const payload = new Uint8Array(PAYLOAD_LEN);
  payload[0] = 1;
  payload[1] = p.code;
  const day = Math.max(0, dayNumber(issuedAt));
  payload[2] = day >> 8; payload[3] = day & 255;
  payload[4] = duration >> 8; payload[5] = duration & 255;
  const mb = machine ? parseMachineCode(machine) : new Uint8Array(5);
  payload.set(mb, 6);
  let s = serial;
  if (s === undefined) { const r = new Uint8Array(4); crypto.getRandomValues(r); s = u32(r, 0); }
  s >>>= 0;
  payload[11] = (s >>> 24) & 255; payload[12] = (s >>> 16) & 255; payload[13] = (s >>> 8) & 255; payload[14] = s & 255;
  const sig = await ed.signAsync(concat(DOMAIN, payload), seed);
  return `${PREFIX}-${group(b32encode(concat(payload, sig)))}`;
}

/** Lê o conteúdo de uma chave SEM conferir a assinatura. */
export function decodeKey(text) {
  const t = String(text || '').toUpperCase().replace(/[\s\-–—_.]+/g, '');
  if (!t.startsWith(PREFIX)) throw new Error('formato');
  const raw = b32decode(t.slice(PREFIX.length));
  if (raw.length < PAYLOAD_LEN + SIG_LEN) throw new Error('tamanho');
  const payload = raw.slice(0, PAYLOAD_LEN);
  const sig = raw.slice(PAYLOAD_LEN, PAYLOAD_LEN + SIG_LEN);
  if (payload[0] !== 1) throw new Error('versão');
  const plan = PLANS[payload[1]];
  if (!plan) throw new Error('plano');
  const issuedDay = u16(payload, 2);
  const duration = u16(payload, 4);
  const machine = payload.slice(6, 11);
  const bound = machine.some((b) => b !== 0);
  const issuedAt = EPOCH + issuedDay * DAY;
  const expiresAt = duration === 0 ? null : issuedAt + (duration + 1) * DAY;
  return {
    payload, sig,
    plan: plan.id, planLabel: plan.label,
    issuedAt,
    durationDays: duration,
    expiresAt,
    validUntil: validUntilText(expiresAt),
    machine: bound ? group(b32encode(machine), 4) : null,
    serial: u32(payload, 11).toString(16).toUpperCase().padStart(8, '0'),
  };
}

/** Normaliza a chave colada (maiúsculas, grupos de 6) para guardar e comparar. */
export function normalizeKey(text) {
  const t = String(text || '').toUpperCase().replace(/[\s\-–—_.]+/g, '');
  if (!t.startsWith(PREFIX)) return String(text || '').trim();
  return `${PREFIX}-${group(t.slice(PREFIX.length))}`;
}

/** Confere a assinatura com a chave pública (32 bytes). */
export async function verifyKey(text, publicKey, { now = Date.now() } = {}) {
  let info;
  try { info = decodeKey(text); } catch {
    return { ok: false, reason: 'Isso não é uma chave do ST Optimizer (começa com ST6-).' };
  }
  let valid = false;
  try { valid = await ed.verifyAsync(info.sig, concat(DOMAIN, info.payload), publicKey); } catch { valid = false; }
  const pub = { plan: info.plan, planLabel: info.planLabel, issuedAt: info.issuedAt, durationDays: info.durationDays, expiresAt: info.expiresAt, validUntil: info.validUntil, machine: info.machine, serial: info.serial };
  if (!valid) return { ok: false, signature: false, reason: 'Assinatura inválida: a chave foi alterada ou é de outro .pem.', info: pub };
  if (info.expiresAt && now > info.expiresAt) return { ok: false, signature: true, expired: true, reason: `Chave verdadeira, mas expirou em ${info.validUntil}.`, info: pub };
  return { ok: true, signature: true, info: pub };
}

/* ------------------------------------------------------------- chave privada */

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Lê o arquivo st-license-private.pem (PKCS#8, Ed25519) e devolve os 32 bytes
 * da chave. Não aceita chave pública nem outros tipos de chave.
 */
export function parsePrivatePem(text) {
  const m = /-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/.exec(String(text || ''));
  if (!m) throw new Error('Este arquivo não é a chave privada (st-license-private.pem).');
  let der;
  try { der = base64ToBytes(m[1].replace(/\s+/g, '')); } catch { throw new Error('O arquivo .pem está corrompido.'); }
  // OID 1.3.101.112 (Ed25519) = 06 03 2B 65 70; a chave vem em OCTET STRING 04 22 04 20 <32 bytes>
  const oid = [0x06, 0x03, 0x2b, 0x65, 0x70];
  const hasOid = der.some((_, i) => oid.every((b, j) => der[i + j] === b));
  if (!hasOid) throw new Error('Esta chave não é do tipo usado pelo ST Optimizer (Ed25519).');
  for (let i = 0; i + 36 <= der.length; i++) {
    if (der[i] === 0x04 && der[i + 1] === 0x22 && der[i + 2] === 0x04 && der[i + 3] === 0x20) {
      return der.slice(i + 4, i + 36);
    }
  }
  throw new Error('Não foi possível ler a chave dentro do arquivo .pem.');
}

export async function publicKeyFromSeed(seed) {
  return ed.getPublicKeyAsync(seed);
}

/** "Impressão digital" da chave pública, para conferir que é o mesmo .pem do PC. */
export async function fingerprint(publicKey) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', publicKey));
  return group(b32encode(hash.slice(0, 5)), 4);
}

export function bytesToHex(b) {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(h) {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
