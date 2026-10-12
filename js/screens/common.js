import { html } from '../vendor/preact.mjs';
import { whatsappNumber, fillTemplate, messageVars, brl } from '../data.js';
import { getState, toast } from '../state.js';
import { openUrl, shareText, copyText } from '../ui.js';

/**
 * Manda uma mensagem para o cliente: se o contato for um número, abre a
 * conversa no WhatsApp já com o texto; senão, abre o "Compartilhar".
 */
export async function sendMessage(client, text, { preferShare = false } = {}) {
  const n = client && whatsappNumber(client.contact);
  if (n && !preferShare) {
    openUrl(`https://wa.me/${n}?text=${encodeURIComponent(text)}`);
    return;
  }
  const r = await shareText(text);
  if (r === 'copied') toast('Mensagem copiada. Cole na conversa com o cliente.', 'info');
  if (r === 'failed') toast('Não foi possível compartilhar nem copiar.', 'bad');
}

export function templateText(kind, client, lic) {
  return fillTemplate(getState().data.settings.templates[kind], messageVars(client, lic));
}

export async function copyKey(key) {
  if (await copyText(key)) toast('Chave copiada.');
  else toast('Não foi possível copiar. Toque e segure a chave para selecionar.', 'bad');
}

/**
 * Gráfico de receita por mês: uma série só (dourado), colunas finas com o
 * topo arredondado, mês atual em destaque e com o valor escrito; tocar numa
 * coluna mostra o valor dela na linha de cima.
 */
export function RevenueChart({ months, selected, onSelect }) {
  const W = 320;
  const H = 132;
  const top = 18;
  const bottom = 22;
  const plotH = H - top - bottom;
  const slot = W / months.length;
  const barW = Math.min(24, slot * 0.46);
  const max = niceMax(Math.max(...months.map((m) => m.revenue), 0));
  const cur = months.length - 1;
  const sel = selected ?? cur;
  const m = months[sel];
  const y = (v) => top + plotH - (max ? (v / max) * plotH : 0);
  const bar = (x, v) => {
    const h = Math.max(0, top + plotH - y(v));
    if (h < 1) return '';
    const r = Math.min(4, h, barW / 2);
    const x0 = x - barW / 2;
    const y0 = top + plotH - h;
    const yb = top + plotH;
    return `M${x0},${yb}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + barW - r}Q${x0 + barW},${y0} ${x0 + barW},${y0 + r}V${yb}Z`;
  };
  const summary = months.map((mm) => `${mm.long}: ${brl(mm.revenue)}`).join('; ');
  return html`<div class="chart">
    <div class="readout"><b>${brl(m.revenue)}</b> em ${m.long}${m.sales ? ` · ${m.sales} ${m.sales === 1 ? 'venda' : 'vendas'}` : ''}</div>
    <svg viewBox=${`0 0 ${W} ${H}`} role="img" aria-label=${`Receita dos últimos 6 meses. ${summary}`}>
      <line class="axis" x1="0" x2=${W} y1=${top + plotH + 0.5} y2=${top + plotH + 0.5} />
      ${months.map((mm, i) => {
        const cx = slot * i + slot / 2;
        return html`<g key=${mm.key}>
          <path class=${`col ${i === cur || i === sel ? '' : 'dim'}`} d=${bar(cx, mm.revenue)} />
          ${i === cur && mm.revenue > 0 ? html`<text class="val" x=${cx} y=${y(mm.revenue) - 6} text-anchor="middle">${compactBrl(mm.revenue)}</text>` : null}
          <text x=${cx} y=${H - 4} text-anchor="middle" style=${i === sel ? 'fill:var(--text)' : ''}>${mm.label}</text>
          <rect class="hit" x=${slot * i} y="0" width=${slot} height=${H} onClick=${() => onSelect(i)} onPointerEnter=${(e) => { if (e.pointerType === 'mouse') onSelect(i); }}><title>${mm.long}: ${brl(mm.revenue)}</title></rect>
        </g>`;
      })}
    </svg>
  </div>`;
}

function niceMax(v) {
  if (v <= 0) return 0;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const f of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (f * p >= v) return f * p;
  return 10 * p;
}

function compactBrl(v) {
  if (v >= 1000) return `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return brl(v, { cents: v % 1 !== 0 });
}
