import { html, useEffect, useRef } from './vendor/preact.mjs';
import { Icon } from './icons.js';
import { useStore, closeLayer, dismissToast } from './state.js';
import { initials, hueFrom } from './data.js';

export { Icon };

export function Button({ kind = '', size = '', icon, loading, block, onClick, disabled, children, type = 'button', title }) {
  const cls = ['btn', kind, size, block ? 'block' : ''].filter(Boolean).join(' ');
  return html`<button type=${type} class=${cls} onClick=${onClick} disabled=${disabled || loading} title=${title}>
    ${loading ? html`<span class="spin" aria-hidden="true"></span>` : icon ? html`<${Icon} name=${icon} />` : null}
    ${children ? html`<span>${children}</span>` : null}
  </button>`;
}

export function IconButton({ icon, label, onClick }) {
  return html`<button type="button" class="icon-btn" onClick=${onClick} aria-label=${label} title=${label}><${Icon} name=${icon} /></button>`;
}

export function Switch({ on, onChange, label }) {
  return html`<button type="button" class=${`switch ${on ? 'on' : ''}`} role="switch" aria-checked=${on ? 'true' : 'false'} aria-label=${label} onClick=${() => onChange(!on)}>
    <span class="track"></span><span class="thumb"></span>
  </button>`;
}

export function Chips({ items, value, onChange }) {
  return html`<div class="chips" role="tablist">
    ${items.map((it) => html`<button type="button" role="tab" aria-selected=${value === it.id ? 'true' : 'false'} class=${`chip ${value === it.id ? 'on' : ''}`} onClick=${() => onChange(it.id)}>
      ${it.label}${it.count !== undefined ? html`<span class="count">${it.count}</span>` : null}
    </button>`)}
  </div>`;
}

export function Field({ label, hint, error, children, id }) {
  return html`<div class="field">
    ${label ? html`<label for=${id}>${label}</label>` : null}
    ${children}
    ${error ? html`<div class="error">${error}</div>` : hint ? html`<div class="hint">${hint}</div>` : null}
  </div>`;
}

const PILL = { ativo: 'ok', vencendo: 'warn', vencido: 'bad', vitalicio: 'gold', sem: 'none' };

export function Pill({ status }) {
  return html`<span class=${`pill ${PILL[status.kind] || 'none'}`}>${status.label}</span>`;
}

export function Avatar({ name, lg }) {
  return html`<span class=${`avatar ${lg ? 'lg' : ''}`} style=${`--h:${hueFrom(name)}`} aria-hidden="true">${initials(name)}</span>`;
}

export function Empty({ icon = 'info', title, children, action }) {
  return html`<div class="empty"><${Icon} name=${icon} />${title ? html`<strong>${title}</strong>` : null}${children ? html`<p>${children}</p>` : null}${action || null}</div>`;
}

export function Banner({ kind = '', icon = 'info', title, children, actions }) {
  return html`<div class=${`banner ${kind}`}><${Icon} name=${icon} /><div class="grow">${title ? html`<strong>${title}</strong>` : null}${children}${actions ? html`<div class="actions">${actions}</div>` : null}</div></div>`;
}

export function Kv({ rows }) {
  return html`<dl class="kv">${rows.filter(Boolean).map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>`;
}

/** Tela que sobe de baixo (ou ocupa a tela toda). */
export function Sheet({ title, full, children, footer, onBack }) {
  const bodyRef = useRef();
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [title]);
  return html`<div class="sheet-wrap">
    <div class="scrim" onClick=${() => closeLayer()}></div>
    <section class=${`sheet ${full ? 'full' : ''}`} role="dialog" aria-modal="true" aria-label=${title}>
      ${full ? null : html`<div class="grabber"></div>`}
      <div class="sheet-head">
        ${onBack ? html`<${IconButton} icon="chevronLeft" label="Voltar" onClick=${onBack} />` : null}
        <h2 class="ellipsis">${title}</h2>
        <${IconButton} icon="x" label="Fechar" onClick=${() => closeLayer()} />
      </div>
      <div class="sheet-body" ref=${bodyRef}>${children}</div>
      ${footer ? html`<div class="sheet-foot">${footer}</div>` : null}
    </section>
  </div>`;
}

function Dialog({ layer }) {
  const ok = () => { layer.resolve(true); closeLayer(); };
  return html`<div class="dialog-wrap" onClick=${(e) => { if (e.target === e.currentTarget) closeLayer(); }}>
    <div class="dialog" role="alertdialog" aria-modal="true" aria-label=${layer.title}>
      <h3>${layer.title}</h3>
      ${layer.text ? html`<p>${layer.text}</p>` : null}
      <div class="btn-row">
        <${Button} onClick=${() => closeLayer()}>Cancelar</${Button}>
        <${Button} kind=${layer.danger ? 'danger' : 'primary'} onClick=${ok}>${layer.confirmLabel}</${Button}>
      </div>
    </div>
  </div>`;
}

export function LayerHost() {
  const layers = useStore((s) => s.layers);
  return html`${layers.map((l) => (l.type === 'dialog'
    ? html`<${Dialog} key=${l.id} layer=${l} />`
    : html`<${l.component} key=${l.id} ...${l.props || {}} />`))}`;
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const icon = { ok: 'checkCircle', bad: 'xCircle', info: 'info' };
  // tocar no aviso fecha na hora
  return html`<div class="toasts" aria-live="polite">${toasts.map((t) => html`<div class=${`toast ${t.kind}`} key=${t.id} onClick=${() => dismissToast(t.id)}><${Icon} name=${icon[t.kind] || 'info'} /><span class="grow">${t.text}</span></div>`)}</div>`;
}

/** Teclado numérico do PIN. */
export function Keypad({ onDigit, onBack, left }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  return html`<div class="keypad">
    ${keys.map((k) => html`<button type="button" onClick=${() => onDigit(k)}>${k}</button>`)}
    ${left || html`<span></span>`}
    <button type="button" onClick=${() => onDigit('0')}>0</button>
    <button type="button" class="fn" onClick=${onBack} aria-label="Apagar"><${Icon} name="backspace" /></button>
  </div>`;
}

export function PinDots({ length, filled, shake }) {
  return html`<div class=${`dots ${shake ? 'shake' : ''}`} aria-hidden="true">${Array.from({ length }, (_, i) => html`<i class=${i < filled ? 'on' : ''}></i>`)}</div>`;
}

/* ---------------------------------------------------------------- utilidades */

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { /* tenta o método antigo */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

/** Abre o "Compartilhar" do Android (WhatsApp, Instagram…). Sem ele, copia. */
export async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

/**
 * Manda um arquivo pelo "Compartilhar" (Google Drive, WhatsApp…). O Chrome do
 * Android só compartilha alguns tipos (texto, imagem, PDF…): JSON não passa,
 * por isso o backup vai como .txt. Se não der para compartilhar, baixa.
 */
export async function shareFile(name, content, type = 'text/plain') {
  const file = new File([content], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}

/**
 * Pede um arquivo ao usuário e devolve o texto. Sem filtro de tipo de
 * propósito: no Android, .pem e .json nem sempre têm um tipo conhecido e
 * apareceriam bloqueados no seletor. Quem confere o conteúdo é quem chama.
 */
export function pickTextFile(accept) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      input.remove();
      if (!f) { resolve(null); return; }
      if (f.size > 5 * 1024 * 1024) { reject(new Error('Arquivo grande demais.')); return; }
      try { resolve({ name: f.name, text: await f.text() }); } catch (e) { reject(e); }
    });
    document.body.appendChild(input);
    input.click();
  });
}

export function openUrl(url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
