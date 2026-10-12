/**
 * Estado do app (tela atual, janelas abertas, avisos) e a sessão
 * (chave privada aberta na memória enquanto o app está desbloqueado).
 */
import { useEffect, useState } from './vendor/preact.mjs';
import { loadData, saveData, VAULT_KEY } from './data.js';

let state = {
  data: loadData(),
  vault: readVault(),
  session: { unlocked: false, seed: null, pub: null, fingerprint: null },
  tab: 'painel',
  layers: [], // telas por cima (cliente, chave gerada, formulários) e diálogos
  toasts: [],
  prefill: null, // dados para a tela "Gerar" (renovar, nova chave para um cliente)
};

const listeners = new Set();

export function getState() { return state; }

export function setState(patch) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  for (const fn of listeners) fn(state);
}

/** Hook: re-renderiza quando o pedaço escolhido do estado muda. */
export function useStore(selector) {
  const [value, setValue] = useState(() => selector(state));
  useEffect(() => {
    const fn = (s) => setValue(() => selector(s));
    listeners.add(fn);
    fn(state);
    return () => listeners.delete(fn);
  }, []);
  return value;
}

/** Aplica uma alteração nos dados e salva no aparelho. */
export function updateData(fn) {
  const next = fn(state.data);
  saveData(next);
  setState({ data: next });
  return next;
}

/* ---------------------------------------------------------------- cofre e sessão */

export function readVault() {
  try {
    const t = localStorage.getItem(VAULT_KEY);
    return t ? JSON.parse(t) : null;
  } catch { return null; }
}

export function writeVault(v) {
  if (v) localStorage.setItem(VAULT_KEY, JSON.stringify(v));
  else localStorage.removeItem(VAULT_KEY);
  setState({ vault: v });
}

export function unlockSession({ seed, pub, fingerprint }) {
  setState({ session: { unlocked: true, seed, pub, fingerprint } });
}

export function lockSession() {
  const s = state.session;
  if (s.seed) s.seed.fill(0);
  closeAllLayers();
  setState({ session: { unlocked: false, seed: null, pub: null, fingerprint: null }, prefill: null, toasts: [] });
}

/* ---------------------------------------------------------------- navegação */

export function go(tab, prefill = null) {
  closeAllLayers();
  setState({ tab, prefill });
  try { window.scrollTo(0, 0); } catch { /* ignorado */ }
}

/*
 * Telas por cima (fichas, formulários, confirmações) e o botão "voltar" do
 * Android: enquanto houver alguma aberta, o histórico do navegador tem UMA
 * entrada a mais (a "guarda"). O "voltar" consome a guarda e fecha só a tela
 * de cima; se ainda sobrar alguma, a guarda é armada de novo. Fechar pelos
 * botões do app muda a pilha na hora e só mexe no histórico quando a última
 * fecha. Assim abrir uma tela logo depois de fechar outra (duas confirmações
 * seguidas, por exemplo) não se embaralha com o "voltar" que ainda não chegou.
 */
let layerSeq = 0;
let guarded = false;
let ignorePops = 0;

function armGuard() {
  // com um "voltar" nosso a caminho, arma quando ele chegar (no popstate)
  if (guarded || ignorePops > 0) return;
  try { history.pushState({ stLayer: true }, ''); guarded = true; } catch { /* ignorado */ }
}

function releaseGuard() {
  if (!guarded) return;
  guarded = false;
  ignorePops += 1;
  try { history.back(); } catch { ignorePops -= 1; }
}

export function openLayer(layer) {
  const id = ++layerSeq;
  setState((s) => ({ layers: [...s.layers, { ...layer, id }] }));
  armGuard();
  return id;
}

/** Fecha a tela de cima. */
export function closeLayer() {
  if (!state.layers.length) return;
  popLayer();
  if (!state.layers.length) releaseGuard();
}

function popLayer() {
  const top = state.layers[state.layers.length - 1];
  if (!top) return;
  setState((s) => ({ layers: s.layers.slice(0, -1) }));
  if (top.onClose) { try { top.onClose(); } catch { /* ignorado */ } }
}

function closeAllLayers() {
  const open = state.layers;
  if (!open.length) return;
  setState({ layers: [] });
  for (const l of open) if (l.onClose) { try { l.onClose(); } catch { /* ignorado */ } }
  releaseGuard();
}

window.addEventListener('popstate', () => {
  if (ignorePops > 0) {
    ignorePops -= 1;
    if (!ignorePops && state.layers.length) armGuard();
    return;
  }
  // "voltar" do Android: a guarda foi consumida; fecha a tela de cima
  guarded = false;
  popLayer();
  if (state.layers.length) armGuard();
});

/* ---------------------------------------------------------------- avisos */

let toastSeq = 0;
export function toast(text, kind = 'ok', ms = 2800) {
  const id = ++toastSeq;
  setState((s) => ({ toasts: [...s.toasts.slice(-1), { id, text, kind }] }));
  setTimeout(() => dismissToast(id), ms);
}

export function dismissToast(id) {
  setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export function toastError(e) {
  toast((e && e.message) || String(e), 'bad', 4500);
}

/** Pergunta com Sim/Não. Resolve true se confirmar. */
export function confirmDialog({ title, text, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    openLayer({ type: 'dialog', title, text, confirmLabel, danger, resolve, onClose: () => resolve(false) });
  });
}
