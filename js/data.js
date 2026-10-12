/**
 * Dados do app: clientes, chaves (licenças) e ajustes. Tudo fica só neste
 * aparelho (localStorage); o backup é um arquivo .json que você guarda onde
 * quiser. A chave privada NÃO entra aqui (fica no cofre, ver vault.js).
 */
import { decodeKey, normalizeKey, validUntilText, PLAN_BY_ID, DAY } from './license.js';

export const STORAGE_KEY = 'st-admin:data:v1';
export const VAULT_KEY = 'st-admin:vault:v1';
export const SOON_DAYS = 7;

export const DEFAULT_PRICES = { mensal: 29.9, anual: 239, vitalicio: 79.9, teste: 0, personalizado: 0 };

export const DEFAULT_TEMPLATES = {
  send: 'Olá, {nome}! Aqui está sua chave do ST Optimizer Pro.\n\nPlano: {plano}\nVálida até: {validade}\n\n{chave}\n\nPara ativar: abra o ST Optimizer Pro, vá em Licença, cole a chave e toque em Ativar.',
  remind: 'Olá, {nome}! Sua licença do ST Optimizer Pro (plano {plano}) vence em {validade}. Quer renovar? É só fazer o Pix e me mandar o comprovante que eu envio a chave nova.',
  winback: 'Olá, {nome}! Sua licença do ST Optimizer Pro venceu em {validade}. Se quiser voltar, a renovação é na hora: faça o Pix e me mande o comprovante.',
};

export const TEMPLATE_HELP = '{nome}, {plano}, {validade}, {chave}, {pc}';

export function emptyData() {
  return {
    format: 1,
    settings: { prices: { ...DEFAULT_PRICES }, lockMinutes: 2, templates: { ...DEFAULT_TEMPLATES }, lastBackupAt: null },
    clients: [],
    licenses: [],
  };
}

export function uid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ---------------------------------------------------------------- guardar */

function cleanSettings(s) {
  const d = emptyData().settings;
  const out = { ...d, ...(s && typeof s === 'object' ? s : {}) };
  out.prices = { ...d.prices, ...(s && s.prices) };
  for (const k of Object.keys(out.prices)) {
    const n = Number(out.prices[k]);
    out.prices[k] = Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : d.prices[k] || 0;
  }
  out.templates = { ...d.templates, ...(s && s.templates) };
  for (const k of Object.keys(d.templates)) if (typeof out.templates[k] !== 'string' || !out.templates[k].trim()) out.templates[k] = d.templates[k];
  out.lockMinutes = [1, 2, 5, 15, 60].includes(Number(out.lockMinutes)) ? Number(out.lockMinutes) : 2;
  out.lastBackupAt = Number(out.lastBackupAt) || null;
  return out;
}

function cleanClient(c) {
  if (!c || typeof c !== 'object' || !c.id || !String(c.name || '').trim()) return null;
  const now = Date.now();
  return {
    id: String(c.id),
    name: String(c.name).trim().slice(0, 80),
    contact: String(c.contact || '').trim().slice(0, 120),
    notes: String(c.notes || '').slice(0, 1000),
    createdAt: Number(c.createdAt) || now,
    updatedAt: Number(c.updatedAt) || Number(c.createdAt) || now,
  };
}

/** Recalcula os dados da licença a partir da própria chave (a chave é a fonte da verdade). */
function cleanLicense(l) {
  if (!l || typeof l !== 'object' || !l.key) return null;
  let info;
  try { info = decodeKey(l.key); } catch { return null; }
  const now = Date.now();
  const price = l.price === null || l.price === undefined || l.price === '' ? null : Number(l.price);
  return {
    id: String(l.id || uid()),
    key: normalizeKey(l.key),
    clientId: l.clientId ? String(l.clientId) : null,
    plan: info.plan,
    durationDays: info.durationDays,
    issuedAt: info.issuedAt,
    expiresAt: info.expiresAt,
    machine: info.machine,
    serial: info.serial,
    price: Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : null,
    paidAt: Number(l.paidAt) || null,
    note: String(l.note || '').slice(0, 300),
    source: ['celular', 'pc', 'manual'].includes(l.source) ? l.source : 'celular',
    renewalOf: l.renewalOf ? String(l.renewalOf) : null,
    createdAt: Number(l.createdAt) || now,
    updatedAt: Number(l.updatedAt) || Number(l.createdAt) || now,
  };
}

export function sanitize(raw) {
  const d = emptyData();
  if (!raw || typeof raw !== 'object') return d;
  d.settings = cleanSettings(raw.settings);
  const seenC = new Set();
  for (const c of Array.isArray(raw.clients) ? raw.clients : []) {
    const x = cleanClient(c);
    if (x && !seenC.has(x.id)) { seenC.add(x.id); d.clients.push(x); }
  }
  const seenK = new Set();
  for (const l of Array.isArray(raw.licenses) ? raw.licenses : []) {
    const x = cleanLicense(l);
    if (!x || seenK.has(x.key)) continue;
    if (x.clientId && !seenC.has(x.clientId)) x.clientId = null;
    seenK.add(x.key);
    d.licenses.push(x);
  }
  return d;
}

export function loadData(storage = globalThis.localStorage) {
  try {
    const txt = storage && storage.getItem(STORAGE_KEY);
    return txt ? sanitize(JSON.parse(txt)) : emptyData();
  } catch {
    return emptyData();
  }
}

export function saveData(data, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    throw new Error('Não foi possível salvar no aparelho (memória do navegador cheia?). Faça um backup agora.');
  }
}

/* ---------------------------------------------------------------- alterações */

export function addClient(data, { name, contact = '', notes = '' }) {
  const n = String(name || '').trim();
  if (!n) throw new Error('Informe o nome do cliente.');
  const now = Date.now();
  const client = { id: uid(), name: n.slice(0, 80), contact: String(contact || '').trim().slice(0, 120), notes: String(notes || '').slice(0, 1000), createdAt: now, updatedAt: now };
  return { data: { ...data, clients: [...data.clients, client] }, client };
}

export function updateClient(data, id, patch) {
  const clients = data.clients.map((c) => {
    if (c.id !== id) return c;
    const next = { ...c, ...patch, updatedAt: Date.now() };
    next.name = String(next.name || '').trim().slice(0, 80) || c.name;
    next.contact = String(next.contact || '').trim().slice(0, 120);
    return next;
  });
  return { ...data, clients };
}

/** Exclui o cliente. As chaves dele continuam guardadas, em "Chaves sem cliente". */
export function deleteClient(data, id) {
  return {
    ...data,
    clients: data.clients.filter((c) => c.id !== id),
    licenses: data.licenses.map((l) => (l.clientId === id ? { ...l, clientId: null, updatedAt: Date.now() } : l)),
  };
}

export function addLicense(data, lic) {
  const x = cleanLicense({ ...lic, id: lic.id || uid(), createdAt: lic.createdAt || Date.now(), updatedAt: Date.now() });
  if (!x) throw new Error('Chave inválida.');
  if (data.licenses.some((l) => l.key === x.key)) throw new Error('Essa chave já está nos seus registros.');
  return { data: { ...data, licenses: [...data.licenses, x] }, license: x };
}

export function updateLicense(data, id, patch) {
  return { ...data, licenses: data.licenses.map((l) => (l.id === id ? cleanLicense({ ...l, ...patch, updatedAt: Date.now() }) || l : l)) };
}

export function deleteLicense(data, id) {
  return { ...data, licenses: data.licenses.filter((l) => l.id !== id) };
}

export function updateSettings(data, patch) {
  return { ...data, settings: cleanSettings({ ...data.settings, ...patch }) };
}

/* ---------------------------------------------------------------- situação */

export function licensesOf(data, clientId) {
  return data.licenses.filter((l) => l.clientId === clientId).sort((a, b) => (b.createdAt - a.createdAt) || (b.issuedAt - a.issuedAt));
}

/** A licença que vale para o cliente: vitalícia, ou a que vence por último. */
export function currentLicense(list) {
  let best = null;
  for (const l of list) {
    if (!l.expiresAt) return l;
    if (!best || l.expiresAt > best.expiresAt) best = l;
  }
  return best;
}

/**
 * Situação de uma licença.
 * kind: vitalicio | ativo | vencendo | vencido | sem
 */
export function statusOf(lic, now = Date.now()) {
  if (!lic) return { kind: 'sem', label: 'Sem chave', daysLeft: null };
  if (!lic.expiresAt) return { kind: 'vitalicio', label: 'Vitalícia', daysLeft: null };
  const until = validUntilText(lic.expiresAt);
  const ms = lic.expiresAt - now;
  if (ms <= 0) {
    const ago = Math.max(0, Math.floor(-ms / DAY));
    return { kind: 'vencido', label: `Venceu ${until}`, daysLeft: 0, daysAgo: ago, until };
  }
  const daysLeft = Math.ceil(ms / DAY);
  if (daysLeft <= SOON_DAYS) return { kind: 'vencendo', label: daysLeft <= 1 ? 'Último dia' : `Vence em ${daysLeft} dias`, daysLeft, until };
  return { kind: 'ativo', label: `Até ${until}`, daysLeft, until };
}

export function isActive(st) {
  return st.kind === 'ativo' || st.kind === 'vencendo' || st.kind === 'vitalicio';
}

export function clientRows(data, now = Date.now()) {
  const byClient = new Map(data.clients.map((c) => [c.id, []]));
  for (const l of data.licenses) if (l.clientId && byClient.has(l.clientId)) byClient.get(l.clientId).push(l);
  return data.clients.map((client) => {
    const list = byClient.get(client.id);
    const current = currentLicense(list);
    return { client, current, status: statusOf(current, now), count: list.length };
  });
}

function monthKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function metrics(data, now = Date.now()) {
  const rows = clientRows(data, now);
  const active = rows.filter((r) => isActive(r.status));
  const byPlan = {};
  for (const r of active) byPlan[r.current.plan] = (byPlan[r.current.plan] || 0) + 1;
  const expiring = rows.filter((r) => r.status.kind === 'vencendo').sort((a, b) => a.current.expiresAt - b.current.expiresAt);
  const expired = rows.filter((r) => r.status.kind === 'vencido' && r.status.daysAgo <= 30).sort((a, b) => b.current.expiresAt - a.current.expiresAt);

  const thisMonth = monthKey(now);
  const paid = data.licenses.filter((l) => l.price && l.price > 0);
  const when = (l) => l.paidAt || l.createdAt;
  const monthPaid = paid.filter((l) => monthKey(when(l)) === thisMonth);
  const months = [];
  const d = new Date(now);
  for (let i = 5; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const key = monthKey(m.getTime());
    months.push({ key, label: MONTHS[m.getMonth()], long: `${MONTHS_LONG[m.getMonth()]} de ${m.getFullYear()}`, revenue: 0, sales: 0 });
  }
  const idx = new Map(months.map((m, i) => [m.key, i]));
  for (const l of paid) {
    const i = idx.get(monthKey(when(l)));
    if (i !== undefined) { months[i].revenue += l.price; months[i].sales += 1; }
  }
  return {
    totalClients: data.clients.length,
    activeClients: active.length,
    byPlan,
    expiring,
    expired,
    month: {
      revenue: monthPaid.reduce((s, l) => s + l.price, 0),
      sales: monthPaid.length,
      newClients: data.clients.filter((c) => monthKey(c.createdAt) === thisMonth).length,
      label: MONTHS_LONG[new Date(now).getMonth()],
    },
    months,
    totalRevenue: paid.reduce((s, l) => s + l.price, 0),
    unassigned: data.licenses.filter((l) => !l.clientId).length,
  };
}

/* ---------------------------------------------------------------- textos */

export function brl(n, { cents = true } = {}) {
  const v = Number(n) || 0;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
}

/** "29,90", "R$ 29,90", "29.9" → 29.9 */
export function parseMoney(text) {
  const t = String(text || '').replace(/[^\d,.-]/g, '');
  if (!t) return null;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function moneyInput(n) {
  if (n === null || n === undefined) return '';
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function dateText(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('pt-BR');
}

export function planLabel(id) {
  return (PLAN_BY_ID[id] && PLAN_BY_ID[id].label) || id;
}

export function fillTemplate(tpl, vars) {
  return String(tpl || '').replace(/\{(nome|plano|validade|chave|pc)\}/g, (_, k) => vars[k] ?? '');
}

export function messageVars(client, lic) {
  return {
    nome: client ? client.name.split(/\s+/)[0] : '',
    plano: lic ? planLabel(lic.plan) : '',
    validade: lic ? (lic.expiresAt ? validUntilText(lic.expiresAt) : 'sem vencimento (vitalícia)') : '',
    chave: lic ? lic.key : '',
    pc: lic && lic.machine ? lic.machine : 'qualquer PC',
  };
}

/** Número de WhatsApp a partir do contato (aceita com ou sem +55, espaços, traços). */
export function whatsappNumber(contact) {
  const digits = String(contact || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits;
  return null;
}

/** "@usuario" ou "instagram.com/usuario" → "usuario". */
export function instagramHandle(contact) {
  const t = String(contact || '').trim();
  const m = /^@([a-z0-9._]{1,30})$/i.exec(t) || /instagram\.com\/([a-z0-9._]{1,30})/i.exec(t);
  return m ? m[1] : null;
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter((p) => !/^(de|da|do|dos|das|e)$/i.test(p));
  return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function hueFrom(text) {
  let h = 0;
  for (const ch of String(text || '')) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/* ---------------------------------------------------------------- backup */

export function exportData(data) {
  return JSON.stringify({ app: 'ST Admin', format: 1, exportedAt: new Date().toISOString(), settings: data.settings, clients: data.clients, licenses: data.licenses }, null, 2);
}

function parseJson(text) {
  try { return JSON.parse(String(text || '').replace(/^﻿/, '')); } catch { throw new Error('O arquivo não é um JSON válido.'); }
}

/** Junta um backup com os dados atuais (nada é apagado; o mais recente vence). */
export function importBackup(data, text) {
  const raw = parseJson(text);
  if (!raw || raw.app !== 'ST Admin') {
    if (raw && Array.isArray(raw.items)) throw new Error('Esse é o histórico do Painel ADM do PC. Use "Importar chaves do PC".');
    throw new Error('Esse arquivo não é um backup do ST Admin.');
  }
  const inc = sanitize(raw);
  const report = { clientsAdded: 0, clientsUpdated: 0, licensesAdded: 0, licensesUpdated: 0 };
  const clients = new Map(data.clients.map((c) => [c.id, c]));
  for (const c of inc.clients) {
    const cur = clients.get(c.id);
    if (!cur) { clients.set(c.id, c); report.clientsAdded++; } else if (c.updatedAt > cur.updatedAt) { clients.set(c.id, c); report.clientsUpdated++; }
  }
  const licenses = new Map(data.licenses.map((l) => [l.key, l]));
  for (const l of inc.licenses) {
    const cur = licenses.get(l.key);
    if (!cur) { licenses.set(l.key, l); report.licensesAdded++; } else if (l.updatedAt > cur.updatedAt) { licenses.set(l.key, { ...l, id: cur.id }); report.licensesUpdated++; }
  }
  const next = {
    ...data,
    clients: [...clients.values()],
    licenses: [...licenses.values()].map((l) => (l.clientId && !clients.has(l.clientId) ? { ...l, clientId: null } : l)),
  };
  return { data: next, report };
}

/**
 * Importa o histórico do Painel ADM do PC (arquivo adm-history.json, em
 * %APPDATA%\ST Optimizer Pro\data). As chaves entram em "Chaves sem cliente".
 * @param {(key: string) => Promise<boolean>} [isGenuine] confere a assinatura
 */
export async function importPcHistory(data, text, isGenuine) {
  const raw = parseJson(text);
  const items = Array.isArray(raw) ? raw : raw && Array.isArray(raw.items) ? raw.items : null;
  if (!items) {
    if (raw && raw.app === 'ST Admin') throw new Error('Esse é um backup do ST Admin. Use "Restaurar backup".');
    throw new Error('Arquivo não reconhecido. Procure o adm-history.json do app do PC.');
  }
  const report = { added: 0, already: 0, invalid: 0 };
  const known = new Set(data.licenses.map((l) => l.key));
  const added = [];
  for (const it of items) {
    if (!it || !it.key) { report.invalid++; continue; }
    const key = normalizeKey(it.key);
    if (known.has(key)) { report.already++; continue; }
    if (isGenuine && !(await isGenuine(key))) { report.invalid++; continue; }
    const lic = cleanLicense({ id: uid(), key, clientId: null, note: it.note || '', source: 'pc', createdAt: Number(it.issuedAt) || undefined, price: null });
    if (!lic) { report.invalid++; continue; }
    known.add(key);
    added.push(lic);
    report.added++;
  }
  return { data: { ...data, licenses: [...data.licenses, ...added] }, report };
}
