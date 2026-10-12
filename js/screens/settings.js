import { html, useState } from '../vendor/preact.mjs';
import { useStore, getState, updateData, writeVault, lockSession, openLayer, closeLayer, toast, toastError, confirmDialog } from '../state.js';
import {
  exportData, importBackup, importPcHistory, updateSettings, emptyData, saveData, moneyInput, parseMoney, dateText,
  DEFAULT_TEMPLATES, TEMPLATE_HELP,
} from '../data.js';
import { verifyKey, PLAN_BY_ID } from '../license.js';
import { seal, open } from '../vault.js';
import { Banner, Button, Chips, Field, Kv, Sheet, shareFile, pickTextFile } from '../ui.js';

export const APP_VERSION = '1.0.0';

/** Salva o backup (abre o "Compartilhar": Google Drive, WhatsApp para você mesmo…). */
export async function saveBackup() {
  try {
    const d = new Date();
    const name = `st-admin-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.txt`;
    const r = await shareFile(name, exportData(getState().data), 'text/plain');
    if (r === 'cancelled') return;
    updateData((x) => updateSettings(x, { lastBackupAt: Date.now() }));
    toast(r === 'downloaded' ? 'Backup salvo na pasta Downloads.' : 'Backup enviado.');
  } catch (e) { toastError(e); }
}

async function restoreBackup() {
  try {
    const f = await pickTextFile();
    if (!f) return;
    let rep;
    updateData((d) => { const r = importBackup(d, f.text); rep = r.report; return r.data; });
    toast(`Backup restaurado: ${rep.clientsAdded} clientes e ${rep.licensesAdded} chaves novas${rep.clientsUpdated + rep.licensesUpdated ? `, ${rep.clientsUpdated + rep.licensesUpdated} atualizados` : ''}.`);
  } catch (e) { toastError(e); }
}

async function importFromPc() {
  try {
    const f = await pickTextFile();
    if (!f) return;
    const pub = getState().session.pub;
    const r = await importPcHistory(getState().data, f.text, async (key) => (await verifyKey(key, pub)).signature === true);
    updateData(() => r.data);
    const { added, already, invalid } = r.report;
    const parts = [`${added} ${added === 1 ? 'chave importada' : 'chaves importadas'}`];
    if (already) parts.push(`${already} já ${already === 1 ? 'estava' : 'estavam'} aqui`);
    if (invalid) parts.push(`${invalid} de outro .pem (${invalid === 1 ? 'ignorada' : 'ignoradas'})`);
    toast(`${parts.join(', ')}.`, added ? 'ok' : 'info', 5000);
  } catch (e) { toastError(e); }
}

function Prices() {
  const prices = useStore((s) => s.data.settings.prices);
  const [vals, setVals] = useState(() => Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, moneyInput(v)])));
  const save = (k) => {
    const n = parseMoney(vals[k]);
    if (n === null) { setVals((v) => ({ ...v, [k]: moneyInput(prices[k]) })); return; }
    updateData((d) => updateSettings(d, { prices: { ...d.settings.prices, [k]: n } }));
    setVals((v) => ({ ...v, [k]: moneyInput(n) }));
  };
  return html`<section class="card stack">
    <div class="card-head" style="margin:0"><h2>Preços dos planos</h2></div>
    <p class="faint small" style="margin:0">Já vêm preenchidos ao gerar uma chave (dá para mudar na hora).</p>
    <div class="btn-row">
      ${['mensal', 'anual', 'vitalicio', 'teste'].map((k) => html`<${Field} label=${PLAN_BY_ID[k].label} id=${`p-${k}`}>
        <div class="money"><span class="prefix">R$</span><input id=${`p-${k}`} class="input" inputmode="decimal" value=${vals[k]} onInput=${(e) => setVals((v) => ({ ...v, [k]: e.target.value }))} onBlur=${() => save(k)} /></div>
      </${Field}>`)}
    </div>
  </section>`;
}

function Templates() {
  const t = useStore((s) => s.data.settings.templates);
  const [vals, setVals] = useState({ ...t });
  const save = (k) => updateData((d) => updateSettings(d, { templates: { ...d.settings.templates, [k]: vals[k] } }));
  const reset = (k) => { setVals((v) => ({ ...v, [k]: DEFAULT_TEMPLATES[k] })); updateData((d) => updateSettings(d, { templates: { ...d.settings.templates, [k]: DEFAULT_TEMPLATES[k] } })); toast('Texto padrão restaurado.'); };
  const labels = { send: 'Ao enviar a chave', remind: 'Cobrar renovação (vence em breve)', winback: 'Chamar de volta (já venceu)' };
  return html`<section class="card stack">
    <div class="card-head" style="margin:0"><h2>Mensagens</h2></div>
    <p class="faint small" style="margin:0">Use ${TEMPLATE_HELP}: o app troca pelos dados do cliente.</p>
    ${Object.keys(labels).map((k) => html`<${Field} label=${labels[k]} id=${`t-${k}`}>
      <textarea id=${`t-${k}`} class="textarea" rows="5" value=${vals[k]} onInput=${(e) => setVals((v) => ({ ...v, [k]: e.target.value }))} onBlur=${() => save(k)}></textarea>
      ${vals[k] !== DEFAULT_TEMPLATES[k] ? html`<div><${Button} size="sm" kind="ghost" icon="rotate" onClick=${() => reset(k)}>Restaurar texto padrão</${Button}></div>` : null}
    </${Field}>`)}
  </section>`;
}

function ChangePin() {
  const [cur, setCur] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pinInput = (id, v, set, label) => html`<${Field} label=${label} id=${id}><input id=${id} class="input num" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" value=${v} onInput=${(e) => { set(e.target.value.replace(/\D/g, '')); setErr(''); }} /></${Field}>`;
  const save = async () => {
    if (p1.length < 4) { setErr('O PIN novo precisa ter de 4 a 8 números.'); return; }
    if (p1 !== p2) { setErr('Os PINs novos não batem.'); return; }
    setBusy(true);
    try {
      const vault = getState().vault;
      const seed = await open(vault, cur);
      const v = await seal(seed, p1, vault.pub, vault.fingerprint);
      v.pinLength = p1.length;
      seed.fill(0);
      writeVault(v);
      closeLayer();
      toast('PIN trocado.');
    } catch (e) {
      setErr(e.code === 'BAD_PIN' ? 'O PIN atual está errado.' : e.message);
    } finally { setBusy(false); }
  };
  return html`<${Sheet} title="Trocar PIN" footer=${html`<${Button} kind="primary" block loading=${busy} onClick=${save}>Salvar PIN novo</${Button}>`}>
    ${pinInput('pin-cur', cur, setCur, 'PIN atual')}
    ${pinInput('pin-new', p1, setP1, 'PIN novo (4 a 8 números)')}
    ${pinInput('pin-new2', p2, setP2, 'PIN novo de novo')}
    ${err ? html`<${Banner} kind="bad" icon="alertCircle">${err}</${Banner}>` : null}
  </${Sheet}>`;
}

export function Settings() {
  const data = useStore((s) => s.data);
  const vault = useStore((s) => s.vault);
  const s = data.settings;

  const removeKey = async () => {
    const ok = await confirmDialog({
      title: 'Remover a chave privada deste celular?',
      text: 'Para gerar chaves de novo você vai precisar importar o arquivo .pem. Seus clientes e registros continuam aqui.',
      confirmLabel: 'Remover', danger: true,
    });
    if (!ok) return;
    lockSession();
    writeVault(null);
  };
  const wipe = async () => {
    const ok = await confirmDialog({ title: 'Apagar todos os clientes e chaves registradas?', text: 'Faça um backup antes. As chaves já entregues continuam funcionando nos PCs dos clientes; só os seus registros somem.', confirmLabel: 'Apagar tudo', danger: true });
    if (!ok) return;
    const ok2 = await confirmDialog({ title: 'Tem certeza mesmo?', text: 'Não dá para desfazer.', confirmLabel: 'Sim, apagar', danger: true });
    if (!ok2) return;
    const fresh = { ...emptyData(), settings: data.settings };
    saveData(fresh);
    updateData(() => fresh);
    toast('Registros apagados.');
  };

  return html`<div class="page">
    <section class="card stack">
      <div class="card-head" style="margin:0"><h2>Backup</h2><span class="sub">${s.lastBackupAt ? `último: ${dateText(s.lastBackupAt)}` : 'nunca feito'}</span></div>
      <p class="faint small" style="margin:0">Os clientes ficam só neste celular. Salve o backup no Google Drive (ou mande para você mesmo) de vez em quando. Ele não leva a chave privada.</p>
      <${Button} kind="primary" block icon="upload" onClick=${saveBackup}>Salvar backup</${Button}>
      <${Button} block icon="download" onClick=${restoreBackup}>Restaurar backup</${Button}>
      <${Button} block icon="download" onClick=${importFromPc}>Importar chaves do PC</${Button}>
      <details>
        <summary class="small muted" style="cursor:pointer">Onde fica o histórico do Painel ADM no PC?</summary>
        <p class="small faint" style="margin:8px 0 0">No PC, abra a pasta <b>%APPDATA%\\ST Optimizer Pro\\data</b> (cole no Explorador de Arquivos) e passe o arquivo <b>adm-history.json</b> para o celular. As chaves entram em "Sem cliente" para você dizer de quem é cada uma.</p>
      </details>
    </section>

    <${Prices} />
    <${Templates} />

    <section class="card stack">
      <div class="card-head" style="margin:0"><h2>Segurança</h2></div>
      <${Field} label="Bloquear quando sair do app por">
        <${Chips} value=${s.lockMinutes} onChange=${(v) => updateData((d) => updateSettings(d, { lockMinutes: v }))} items=${[1, 2, 5, 15, 60].map((m) => ({ id: m, label: m === 60 ? '1 hora' : `${m} min` }))} />
      </${Field}>
      <div class="btn-row">
        <${Button} icon="key" onClick=${() => openLayer({ component: ChangePin, props: {} })}>Trocar PIN</${Button}>
        <${Button} icon="lock" onClick=${lockSession}>Bloquear</${Button}>
      </div>
      <${Button} kind="danger" block icon="trash" onClick=${removeKey}>Remover a chave privada deste celular</${Button}>
    </section>

    <section class="card">
      <div class="card-head"><h2>Sobre</h2></div>
      <${Kv} rows=${[
        ['Impressão digital', html`<span class="num">${vault ? vault.fingerprint : '—'}</span>`],
        ['Clientes', String(data.clients.length)],
        ['Chaves registradas', String(data.licenses.length)],
        ['Versão do app', APP_VERSION],
      ]} />
      <p class="faint small" style="margin:12px 0 0">A impressão digital tem que ser igual à do Painel ADM do app do PC. Se for diferente, as chaves geradas aqui não vão funcionar nos instaladores feitos com aquele .pem.</p>
    </section>

    <${Button} kind="danger" block icon="trash" onClick=${wipe}>Apagar todos os registros</${Button}>
  </div>`;
}
