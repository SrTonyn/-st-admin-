import { html, useEffect, useState } from '../vendor/preact.mjs';
import { useStore, getState, setState, updateData, openLayer, closeLayer, toast, toastError } from '../state.js';
import { addClient, addLicense, licensesOf, currentLicense, statusOf, planLabel, parseMoney, moneyInput, brl, uid } from '../data.js';
import { issueKey, decodeKey, renewalStart, formatMachineCode, validUntilText, PLAN_BY_ID, PLAN_ORDER, DAY, dayNumber, EPOCH } from '../license.js';
import { Avatar, Banner, Button, Chips, Empty, Field, Kv, Pill, Sheet, Switch } from '../ui.js';
import { ClientForm } from './clients.js';
import { copyKey, sendMessage, templateText } from './common.js';

const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dateInputToTs = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime() : Date.now();
};

function previewExpiry(issuedAt, duration) {
  if (!duration) return null;
  return EPOCH + Math.max(0, dayNumber(issuedAt)) * DAY + (duration + 1) * DAY;
}

export function Generate() {
  const data = useStore((s) => s.data);
  const prefill = useStore((s) => s.prefill);
  const [clientId, setClientId] = useState(null);
  const [plan, setPlan] = useState('mensal');
  const [days, setDays] = useState('');
  const [machine, setMachine] = useState('');
  const [renew, setRenew] = useState(false);
  const [price, setPrice] = useState(moneyInput(data.settings.prices.mensal));
  const [priceTouched, setPriceTouched] = useState(false);
  const [paidAt, setPaidAt] = useState(todayInput());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [machineErr, setMachineErr] = useState('');

  // chegou de "Renovar" ou "Nova chave" de um cliente
  useEffect(() => {
    if (!prefill || !prefill.clientId) return;
    const c = data.clients.find((x) => x.id === prefill.clientId);
    if (!c) return;
    setClientId(c.id);
    const cur = currentLicense(licensesOf(data, c.id));
    if (cur) {
      if (cur.machine) setMachine(cur.machine);
      if (prefill.renew && cur.plan !== 'teste' && cur.plan !== 'vitalicio') {
        setPlan(cur.plan);
        if (cur.plan === 'personalizado') setDays(String(cur.durationDays));
        setPrice(moneyInput(data.settings.prices[cur.plan] ?? 0));
      }
      setRenew(!!prefill.renew && !!cur.expiresAt && cur.expiresAt > Date.now());
    }
    setState({ prefill: null });
  }, [prefill]);

  const client = clientId ? data.clients.find((c) => c.id === clientId) : null;
  const current = client ? currentLicense(licensesOf(data, client.id)) : null;
  const canRenew = !!(current && current.expiresAt && current.expiresAt > Date.now() && plan !== 'vitalicio');
  const p = PLAN_BY_ID[plan];
  const duration = plan === 'vitalicio' ? 0 : plan === 'personalizado' ? Number(days) || 0 : p.days;
  const issuedAt = renew && canRenew ? renewalStart(current.expiresAt) : Date.now();
  const expiry = previewExpiry(issuedAt, duration);

  const choosePlan = (id) => {
    setPlan(id);
    if (!priceTouched) setPrice(moneyInput(data.settings.prices[id] ?? 0));
  };

  const pickClient = () => openLayer({ component: ClientPicker, props: { onPick: (id) => { setClientId(id); const cur = id ? currentLicense(licensesOf(getState().data, id)) : null; if (cur && cur.machine && !machine) setMachine(cur.machine); } } });

  function checkMachine(v) {
    if (!v.trim()) { setMachineErr(''); return null; }
    try { const f = formatMachineCode(v); setMachineErr(''); return f; } catch (e) { setMachineErr(e.message); return undefined; }
  }

  async function generate() {
    const session = getState().session;
    if (!session.unlocked || !session.seed) { toast('Desbloqueie o app para gerar chaves.', 'bad'); return; }
    if (plan === 'personalizado' && (!Number.isInteger(Number(days)) || Number(days) < 1 || Number(days) > 3650)) { toast('Informe quantos dias a chave vale (1 a 3650).', 'bad'); return; }
    const m = checkMachine(machine);
    if (m === undefined) return;
    setBusy(true);
    try {
      const key = await issueKey(session.seed, { plan, days: plan === 'personalizado' ? Number(days) : undefined, machine: m, issuedAt });
      const info = decodeKey(key);
      let newId = null;
      updateData((d) => {
        const r = addLicense(d, {
          id: uid(), key, clientId: client ? client.id : null, price: parseMoney(price), paidAt: dateInputToTs(paidAt),
          note, source: 'celular', renewalOf: renew && canRenew ? current.id : null,
        });
        newId = r.license.id;
        return r.data;
      });
      openLayer({ component: KeyResult, props: { licenseId: newId, onDone: reset } });
      if (info.expiresAt && info.expiresAt < Date.now()) toast('Atenção: essa chave já nasce vencida.', 'bad');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setClientId(null); setPlan('mensal'); setDays(''); setMachine(''); setRenew(false); setPriceTouched(false);
    setPrice(moneyInput(getState().data.settings.prices.mensal)); setPaidAt(todayInput()); setNote(''); setMachineErr('');
  }

  return html`<div class="page">
    <section class="card stack">
      <${Field} label="Cliente">
        ${client ? html`<button type="button" class="item" style="border:1px solid var(--line);border-radius:12px;min-height:60px" onClick=${pickClient}>
            <${Avatar} name=${client.name} />
            <div class="grow"><div class="t ellipsis">${client.name}</div><div class="d ellipsis">${current ? `${planLabel(current.plan)} · ${statusOf(current).label}` : 'Primeira chave'}</div></div>
            <span class="faint small">Trocar</span>
          </button>`
          : html`<div class="btn-row">
            <${Button} icon="search" onClick=${pickClient}>Escolher</${Button}>
            <${Button} icon="plus" onClick=${() => openLayer({ component: ClientForm, props: { onSaved: (id) => setClientId(id) } })}>Novo cliente</${Button}>
          </div>`}
      </${Field}>

      <${Field} label="Plano">
        <${Chips} value=${plan} onChange=${choosePlan} items=${PLAN_ORDER.map((id) => ({ id, label: PLAN_BY_ID[id].label }))} />
      </${Field}>
      ${plan === 'personalizado' ? html`<${Field} label="Quantos dias" id="g-days" hint="Por exemplo 15, 60 ou 90.">
        <input id="g-days" class="input" inputmode="numeric" pattern="[0-9]*" value=${days} onInput=${(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Dias" />
      </${Field}>` : null}

      <${Field} label="Código do PC do cliente" id="g-machine" error=${machineErr} hint="Aparece na tela Licença do app dele. Deixe em branco para a chave valer em qualquer PC.">
        <input id="g-machine" class=${`input mono ${machineErr ? 'invalid' : ''}`} value=${machine} placeholder="Ex.: 7KQ2-M9XD" autocomplete="off" autocapitalize="characters" spellcheck="false"
          onInput=${(e) => { setMachine(e.target.value.toUpperCase()); setMachineErr(''); }} onBlur=${() => { const f = checkMachine(machine); if (f) setMachine(f); }} />
      </${Field}>

      ${canRenew ? html`<div class="switch-row">
        <div class="grow"><div style="font-weight:600">Somar ao tempo que falta</div><div class="faint small">A licença atual vale até ${validUntilText(current.expiresAt)}. A nova começa depois dela.</div></div>
        <${Switch} on=${renew} onChange=${setRenew} label="Somar ao tempo que falta" />
      </div>` : null}

      <div class="btn-row">
        <${Field} label="Valor recebido" id="g-price">
          <div class="money"><span class="prefix">R$</span><input id="g-price" class="input" inputmode="decimal" value=${price} onInput=${(e) => { setPrice(e.target.value); setPriceTouched(true); }} placeholder="0,00" /></div>
        </${Field}>
        <${Field} label="Pago em" id="g-paid">
          <input id="g-paid" class="input" type="date" value=${paidAt} onInput=${(e) => setPaidAt(e.target.value)} />
        </${Field}>
      </div>
      <${Field} label="Observação (opcional)" id="g-note">
        <input id="g-note" class="input" value=${note} onInput=${(e) => setNote(e.target.value)} placeholder="Ex.: pagou pelo Pix às 14h" />
      </${Field}>
    </section>

    <section class="card">
      <${Kv} rows=${[
        ['Plano', `${p.label}${plan === 'personalizado' && duration ? ` (${duration} dias)` : ''}`],
        ['Válida até', plan === 'vitalicio' ? 'sem vencimento' : expiry ? validUntilText(expiry) : '—'],
        ['PC', machine.trim() && !machineErr ? machine.trim() : 'qualquer PC'],
        ['Valor', brl(parseMoney(price) || 0)],
      ]} />
    </section>
    ${!client ? html`<p class="faint small" style="margin:-4px 2px 0">Sem cliente escolhido, a chave fica em "Chaves sem cliente" e não entra na contagem.</p>` : null}
    <${Button} kind="primary" block icon="key" loading=${busy} onClick=${generate}>Gerar chave</${Button}>
  </div>`;
}

/* ------------------------------------------------------------------ escolher cliente */

function ClientPicker({ onPick }) {
  const data = useStore((s) => s.data);
  const [q, setQ] = useState('');
  const nq = q.trim().toLowerCase();
  const list = [...data.clients].filter((c) => !nq || `${c.name} ${c.contact}`.toLowerCase().includes(nq)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const choose = (id) => { onPick(id); closeLayer(); };
  const create = () => {
    try {
      const name = q.trim();
      let id = null;
      updateData((d) => { const r = addClient(d, { name }); id = r.client.id; return r.data; });
      choose(id);
      toast('Cliente cadastrado. Dá para completar o contato depois.');
    } catch (e) { toastError(e); }
  };
  return html`<${Sheet} title="Escolher cliente">
    <input class="input" type="search" placeholder="Nome ou contato" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Procurar cliente" autofocus />
    ${q.trim() ? html`<${Button} kind="primary" block icon="plus" onClick=${create}>Cadastrar "${q.trim()}"</${Button}>` : null}
    ${list.length ? html`<section class="card flush"><div class="list">
      ${list.slice(0, 60).map((c) => {
        const cur = currentLicense(licensesOf(data, c.id));
        return html`<button type="button" class="item" key=${c.id} onClick=${() => choose(c.id)}>
          <${Avatar} name=${c.name} /><div class="grow"><div class="t ellipsis">${c.name}</div><div class="d ellipsis">${c.contact || 'Sem contato'}</div></div>
          <div class="side"><${Pill} status=${statusOf(cur)} /></div>
        </button>`;
      })}
    </div></section>` : data.clients.length ? html`<p class="faint small" style="margin:0">Ninguém com esse nome. Toque em Cadastrar.</p>` : html`<${Empty} icon="users" title="Nenhum cliente ainda">Digite o nome acima para cadastrar.</${Empty}>`}
    <${Button} kind="ghost" block onClick=${() => choose(null)}>Gerar sem cliente</${Button}>
  </${Sheet}>`;
}

/* ------------------------------------------------------------------ chave pronta */

function KeyResult({ licenseId, onDone }) {
  const data = useStore((s) => s.data);
  const lic = data.licenses.find((l) => l.id === licenseId);
  if (!lic) return null;
  const client = lic.clientId ? data.clients.find((c) => c.id === lic.clientId) : null;
  const done = () => { closeLayer(); if (onDone) onDone(); };
  return html`<${Sheet} title="Chave gerada" footer=${html`<${Button} block onClick=${done}>Concluir</${Button}>`}>
    <${Banner} kind="ok" icon="checkCircle" title=${client ? `Chave de ${client.name}` : 'Chave sem cliente'}>
      ${planLabel(lic.plan)}, ${lic.expiresAt ? `válida até ${validUntilText(lic.expiresAt)}` : 'sem vencimento'}${lic.machine ? html`, só no PC <span class="nowrap">${lic.machine}</span>` : ', em qualquer PC'}. Já está salva nos seus registros.
    </${Banner}>
    <div class="keybox">${lic.key}</div>
    <div class="stack tight">
      <${Button} kind="primary" block icon="send" onClick=${() => sendMessage(client, templateText('send', client, lic), { preferShare: !client })}>${client ? `Enviar para ${client.name.split(/\s+/)[0]}` : 'Enviar'}</${Button}>
      <${Button} block icon="copy" onClick=${() => copyKey(lic.key)}>Copiar só a chave</${Button}>
    </div>
  </${Sheet}>`;
}

