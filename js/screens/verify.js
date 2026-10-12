import { html, useState } from '../vendor/preact.mjs';
import { useStore, getState, updateData, openLayer, toast, toastError } from '../state.js';
import { addLicense, planLabel, uid } from '../data.js';
import { verifyKey, normalizeKey } from '../license.js';
import { Banner, Button, Kv, Icon } from '../ui.js';
import { ClientSheet, LicenseSheet, AssignSheet } from './clients.js';

export function Verify() {
  const data = useStore((s) => s.data);
  const [text, setText] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);

  async function check(t = text) {
    if (!t.trim()) return;
    setBusy(true);
    try {
      setRes({ key: normalizeKey(t), r: await verifyKey(t, getState().session.pub) });
    } catch (e) { toastError(e); } finally { setBusy(false); }
  }

  async function paste() {
    try {
      const t = await navigator.clipboard.readText();
      if (!t) { toast('A área de transferência está vazia.', 'info'); return; }
      setText(t);
      check(t);
    } catch {
      toast('Toque e segure no campo e escolha Colar.', 'info');
    }
  }

  const known = res ? data.licenses.find((l) => l.key === res.key) : null;
  const owner = known && known.clientId ? data.clients.find((c) => c.id === known.clientId) : null;
  const r = res && res.r;

  const addToRecords = () => {
    try {
      let id = null;
      updateData((d) => { const x = addLicense(d, { id: uid(), key: res.key, source: 'manual', price: null }); id = x.license.id; return x.data; });
      toast('Chave adicionada aos registros.');
      openLayer({ component: AssignSheet, props: { licenseId: id } });
    } catch (e) { toastError(e); }
  };

  return html`<div class="page">
    <section class="card stack">
      <p class="muted" style="margin:0">Cole uma chave para ver o plano, a validade e se ela foi gerada com o seu .pem. Útil quando um cliente diz que a chave não funciona.</p>
      <textarea class="textarea mono" rows="4" placeholder="ST6-…" value=${text} onInput=${(e) => { setText(e.target.value); setRes(null); }} autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Chave"></textarea>
      <div class="btn-row">
        <${Button} icon="paste" onClick=${paste}>Colar</${Button}>
        <${Button} kind="primary" icon="shield" loading=${busy} disabled=${!text.trim()} onClick=${() => check()}>Verificar</${Button}>
      </div>
    </section>

    ${r ? html`
      ${!r.info ? html`<${Banner} kind="bad" icon="xCircle" title="Não é uma chave">${r.reason}</${Banner}>`
        : r.signature === false ? html`<${Banner} kind="bad" icon="xCircle" title="Chave falsa ou alterada">A assinatura não confere com o seu .pem. Pode ter sido digitada errado, alterada, ou gerada com outra chave privada.</${Banner}>`
          : r.expired ? html`<${Banner} kind="warn" icon="clock" title="Chave verdadeira, mas vencida">Venceu em ${r.info.validUntil}. Gere uma renovação.</${Banner}>`
            : html`<${Banner} kind="ok" icon="checkCircle" title="Chave válida">Gerada com o seu .pem e dentro da validade.</${Banner}>`}
      ${r.info ? html`<section class="card">
        <${Kv} rows=${[
          ['Plano', `${planLabel(r.info.plan)}${r.info.plan === 'personalizado' ? ` (${r.info.durationDays} dias)` : ''}`],
          ['Válida até', r.info.expiresAt ? r.info.validUntil : 'sem vencimento'],
          ['Código do PC', r.info.machine || 'qualquer PC'],
          ['Série', html`<span class="num">${r.info.serial}</span>`],
          ['Nos registros', known ? (owner ? owner.name : 'sim, sem cliente') : 'não'],
        ]} />
        ${r.info.machine ? html`<p class="faint small" style="margin:12px 0 0">Se o cliente trocou de PC ou formatou, o código muda e esta chave para de funcionar. Peça o código novo e gere outra chave.</p>` : null}
      </section>` : null}
      ${known ? html`<div class="btn-row">
          ${owner ? html`<${Button} icon="user" onClick=${() => openLayer({ component: ClientSheet, props: { clientId: owner.id } })}>Abrir cliente</${Button}>` : html`<span></span>`}
          <${Button} icon="key" onClick=${() => openLayer({ component: LicenseSheet, props: { licenseId: known.id } })}>Ver registro</${Button}>
        </div>`
        : r.signature ? html`<${Button} block icon="plus" onClick=${addToRecords}>Adicionar aos registros</${Button}>` : null}
    ` : html`<div class="empty"><${Icon} name="shield" /><p>O resultado aparece aqui.</p></div>`}
  </div>`;
}
