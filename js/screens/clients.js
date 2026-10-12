import { html, useState } from '../vendor/preact.mjs';
import { useStore, getState, setState, updateData, openLayer, closeLayer, go, toast, toastError, confirmDialog } from '../state.js';
import {
  clientRows, licensesOf, currentLicense, statusOf, addClient, updateClient, deleteClient, updateLicense, deleteLicense,
  planLabel, brl, dateText, parseMoney, moneyInput, whatsappNumber, instagramHandle,
} from '../data.js';
import { validUntilText } from '../license.js';
import { Avatar, Button, Chips, Empty, Field, Icon, IconButton, Kv, Pill, Sheet, openUrl } from '../ui.js';
import { copyKey, sendMessage, templateText } from './common.js';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ------------------------------------------------------------------ lista */

export function Clients() {
  const data = useStore((s) => s.data);
  const prefill = useStore((s) => s.prefill);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState((prefill && prefill.filter) || 'todos');
  const rows = clientRows(data);
  const unassigned = data.licenses.filter((l) => !l.clientId);
  const count = (k) => rows.filter((r) => (k === 'ativos' ? ['ativo', 'vencendo', 'vitalicio'].includes(r.status.kind) : r.status.kind === k)).length;
  const items = [
    { id: 'todos', label: 'Todos', count: rows.length },
    { id: 'ativos', label: 'Ativos', count: count('ativos') },
    { id: 'vencendo', label: 'Vencendo', count: count('vencendo') },
    { id: 'vencido', label: 'Vencidos', count: count('vencido') },
    ...(unassigned.length ? [{ id: 'sem', label: 'Sem cliente', count: unassigned.length }] : []),
  ];

  const nq = norm(q.trim());
  let list = rows;
  if (filter === 'ativos') list = list.filter((r) => ['ativo', 'vencendo', 'vitalicio'].includes(r.status.kind));
  else if (filter === 'vencendo' || filter === 'vencido') list = list.filter((r) => r.status.kind === filter);
  if (nq) {
    list = list.filter((r) => {
      const keys = licensesOf(data, r.client.id).map((l) => `${l.machine || ''} ${l.key}`).join(' ');
      return norm(`${r.client.name} ${r.client.contact} ${r.client.notes} ${keys}`).includes(nq);
    });
  }
  if (filter === 'vencendo') list = [...list].sort((a, b) => a.current.expiresAt - b.current.expiresAt);
  else if (filter === 'vencido') list = [...list].sort((a, b) => b.current.expiresAt - a.current.expiresAt);
  else list = [...list].sort((a, b) => a.client.name.localeCompare(b.client.name, 'pt-BR'));

  const newClient = () => openLayer({ component: ClientForm, props: {} });

  return html`<div class="page">
    <div class="row">
      <div class="input-wrap grow">
        <input class="input" type="search" placeholder="Buscar nome, contato ou código do PC" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Buscar clientes" />
        ${q ? html`<${IconButton} icon="x" label="Limpar busca" onClick=${() => setQ('')} />` : html`<span class="icon-btn" aria-hidden="true" style="position:absolute;right:2px;pointer-events:none"><${Icon} name="search" /></span>`}
      </div>
      <${Button} icon="plus" onClick=${newClient} title="Novo cliente"></${Button}>
    </div>
    <div style="overflow-x:auto;margin:0 -16px;padding:0 16px"><div style="width:max-content"><${Chips} items=${items} value=${filter} onChange=${(f) => { setFilter(f); setState({ prefill: null }); }} /></div></div>

    ${filter === 'sem' ? html`<${Unassigned} list=${unassigned} />`
      : !rows.length ? html`<section class="card"><${Empty} icon="users" title="Nenhum cliente ainda" action=${html`<${Button} kind="primary" icon="plus" onClick=${() => go('gerar')}>Gerar chave</${Button}>`}>Os clientes aparecem aqui quando você gera uma chave para eles.</${Empty}></section>`
        : !list.length ? html`<section class="card"><${Empty} icon="search" title="Ninguém encontrado">${nq ? 'Tente outro nome ou parte do contato.' : 'Nenhum cliente nesta situação.'}</${Empty}></section>`
          : html`<section class="card flush"><div class="list">
            ${list.map((r) => html`<button type="button" class="item" key=${r.client.id} onClick=${() => openLayer({ component: ClientSheet, props: { clientId: r.client.id } })}>
              <${Avatar} name=${r.client.name} />
              <div class="grow"><div class="t ellipsis">${r.client.name}</div><div class="d ellipsis">${r.current ? planLabel(r.current.plan) : 'Sem chave'}${r.client.contact ? ` · ${r.client.contact}` : ''}</div></div>
              <div class="side"><${Pill} status=${r.status} /></div>
            </button>`)}
          </div></section>`}
  </div>`;
}

function Unassigned({ list }) {
  if (!list.length) return html`<section class="card"><${Empty} icon="checkCircle" title="Tudo organizado">Todas as chaves têm um cliente.</${Empty}></section>`;
  const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt);
  return html`<div class="stack tight">
    <p class="faint small" style="margin:0 2px">Toque numa chave para dizer de quem ela é. Só assim ela entra na contagem de clientes ativos.</p>
    <section class="card flush"><div class="list">
      ${sorted.map((l) => html`<button type="button" class="item" key=${l.id} onClick=${() => openLayer({ component: AssignSheet, props: { licenseId: l.id } })}>
        <span class="avatar" style="--h:45" aria-hidden="true"><${Icon} name="key" size=${18} /></span>
        <div class="grow"><div class="t ellipsis">${l.note || planLabel(l.plan)}</div><div class="d ellipsis">${planLabel(l.plan)}${l.machine ? ` · PC ${l.machine}` : ''} · ${dateText(l.createdAt)}</div></div>
        <div class="side"><${Pill} status=${statusOf(l)} /></div>
      </button>`)}
    </div></section>
  </div>`;
}

/* ------------------------------------------------------------------ cliente */

export function ClientSheet({ clientId }) {
  const data = useStore((s) => s.data);
  const client = data.clients.find((c) => c.id === clientId);
  if (!client) return html`<${Sheet} title="Cliente" full><${Empty} icon="user" title="Cliente não encontrado" /></${Sheet}>`;
  const lics = licensesOf(data, client.id);
  const current = currentLicense(lics);
  const status = statusOf(current);
  const total = lics.reduce((s, l) => s + (l.price || 0), 0);
  const wa = whatsappNumber(client.contact);
  const ig = instagramHandle(client.contact);
  const machines = [...new Set(lics.map((l) => l.machine).filter(Boolean))];

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Excluir ${client.name}?`,
      text: lics.length ? 'As chaves dele continuam funcionando e ficam em "Chaves sem cliente".' : 'O cliente sai da sua lista.',
      confirmLabel: 'Excluir', danger: true,
    });
    if (!ok) return;
    updateData((d) => deleteClient(d, client.id));
    closeLayer();
    toast('Cliente excluído.');
  };

  return html`<${Sheet} title="Cliente" full>
    <div class="row" style="gap:14px">
      <${Avatar} name=${client.name} lg />
      <div class="grow">
        <div style="font-size:20px;font-weight:600" class="ellipsis">${client.name}</div>
        ${client.contact ? html`<div class="muted ellipsis">${client.contact}</div>` : html`<div class="faint">Sem contato</div>`}
        <div style="margin-top:6px"><${Pill} status=${status} /></div>
      </div>
    </div>

    <div class="btn-row">
      <${Button} kind="primary" icon="rotate" onClick=${() => go('gerar', { clientId: client.id, renew: !!current })}>${current ? 'Renovar' : 'Gerar chave'}</${Button}>
      ${current ? html`<${Button} icon="send" onClick=${() => sendMessage(client, templateText('send', client, current))}>Enviar chave</${Button}>`
        : html`<${Button} icon="plus" onClick=${() => go('gerar', { clientId: client.id })}>Nova chave</${Button}>`}
    </div>
    ${wa || ig ? html`<div class="btn-row">
      ${wa ? html`<${Button} icon="chat" onClick=${() => openUrl(`https://wa.me/${wa}`)}>WhatsApp</${Button}>` : null}
      ${ig ? html`<${Button} icon="external" onClick=${() => openUrl(`https://instagram.com/${ig}`)}>Instagram</${Button}>` : null}
    </div>` : null}

    <section class="card">
      <${Kv} rows=${[
        ['Plano atual', current ? planLabel(current.plan) : '—'],
        ['Válida até', current ? (current.expiresAt ? validUntilText(current.expiresAt) : 'sem vencimento') : '—'],
        ['Código do PC', machines.length ? machines.join(', ') : 'qualquer PC'],
        ['Cliente desde', dateText(client.createdAt)],
        ['Total pago', brl(total)],
      ]} />
      ${client.notes ? html`<p class="muted small" style="margin:12px 0 0;white-space:pre-wrap">${client.notes}</p>` : null}
    </section>

    <div class="section-title"><h2>Chaves</h2><span class="faint small">${lics.length}</span></div>
    ${lics.length ? html`<section class="card flush"><div class="list">
      ${lics.map((l) => html`<button type="button" class="item" key=${l.id} onClick=${() => openLayer({ component: LicenseSheet, props: { licenseId: l.id } })}>
        <div class="grow"><div class="t">${planLabel(l.plan)}${l.price ? html` <span class="faint" style="font-weight:500">· ${brl(l.price)}</span>` : null}</div>
          <div class="d ellipsis">Gerada em ${dateText(l.createdAt)}${l.machine ? ` · PC ${l.machine}` : ''}</div></div>
        <div class="side"><${Pill} status=${statusOf(l)} /></div>
      </button>`)}
    </div></section>` : html`<p class="faint small" style="margin:0">Nenhuma chave registrada para este cliente.</p>`}

    <div class="btn-row">
      <${Button} icon="settings" onClick=${() => openLayer({ component: ClientForm, props: { clientId: client.id } })}>Editar dados</${Button}>
      <${Button} kind="danger" icon="trash" onClick=${remove}>Excluir</${Button}>
    </div>
  </${Sheet}>`;
}

/* ------------------------------------------------------------------ formulário de cliente */

export function ClientForm({ clientId, initialName = '', onSaved }) {
  const existing = clientId ? getState().data.clients.find((c) => c.id === clientId) : null;
  const [name, setName] = useState(existing ? existing.name : initialName);
  const [contact, setContact] = useState(existing ? existing.contact : '');
  const [notes, setNotes] = useState(existing ? existing.notes : '');
  const [err, setErr] = useState('');

  const save = () => {
    if (!name.trim()) { setErr('Informe o nome.'); return; }
    try {
      let id = clientId;
      if (existing) updateData((d) => updateClient(d, clientId, { name, contact, notes }));
      else updateData((d) => { const r = addClient(d, { name, contact, notes }); id = r.client.id; return r.data; });
      closeLayer();
      toast(existing ? 'Dados salvos.' : 'Cliente cadastrado.');
      if (onSaved) setTimeout(() => onSaved(id), 50);
    } catch (e) { toastError(e); }
  };

  return html`<${Sheet} title=${existing ? 'Editar cliente' : 'Novo cliente'} footer=${html`<${Button} kind="primary" block icon="check" onClick=${save}>Salvar</${Button}>`}>
    <${Field} label="Nome" id="cf-name" error=${err}>
      <input id="cf-name" class="input" value=${name} onInput=${(e) => { setName(e.target.value); setErr(''); }} autocomplete="off" enterkeyhint="next" />
    </${Field}>
    <${Field} label="Contato" id="cf-contact" hint="WhatsApp com DDD (abre a conversa direto) ou @instagram.">
      <input id="cf-contact" class="input" value=${contact} onInput=${(e) => setContact(e.target.value)} autocomplete="off" inputmode="text" />
    </${Field}>
    <${Field} label="Observações" id="cf-notes">
      <textarea id="cf-notes" class="textarea" rows="3" value=${notes} onInput=${(e) => setNotes(e.target.value)}></textarea>
    </${Field}>
  </${Sheet}>`;
}

/* ------------------------------------------------------------------ chave registrada */

export function LicenseSheet({ licenseId }) {
  const data = useStore((s) => s.data);
  const lic = data.licenses.find((l) => l.id === licenseId);
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(lic ? moneyInput(lic.price) : '');
  const [note, setNote] = useState(lic ? lic.note : '');
  if (!lic) return html`<${Sheet} title="Chave"><${Empty} icon="key" title="Chave não encontrada" /></${Sheet}>`;
  const client = lic.clientId ? data.clients.find((c) => c.id === lic.clientId) : null;
  const st = statusOf(lic);

  const save = () => {
    updateData((d) => updateLicense(d, lic.id, { price: parseMoney(price), note }));
    setEditing(false);
    toast('Salvo.');
  };
  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Apagar este registro?',
      text: 'A chave CONTINUA funcionando no PC do cliente (chaves não podem ser canceladas). Ela só some dos seus registros e das contas.',
      confirmLabel: 'Apagar registro', danger: true,
    });
    if (!ok) return;
    updateData((d) => deleteLicense(d, lic.id));
    closeLayer();
    toast('Registro apagado.');
  };

  return html`<${Sheet} title=${`Chave ${planLabel(lic.plan)}`}>
    <div class="row"><${Pill} status=${st} /><span class="faint small grow">${client ? client.name : 'Sem cliente'}</span></div>
    <div class="keybox">${lic.key}</div>
    <div class="btn-row">
      <${Button} icon="copy" onClick=${() => copyKey(lic.key)}>Copiar</${Button}>
      <${Button} kind="primary" icon="send" onClick=${() => sendMessage(client, templateText('send', client, lic), { preferShare: !client })}>Enviar</${Button}>
    </div>
    <section class="card">
      <${Kv} rows=${[
        ['Plano', `${planLabel(lic.plan)}${lic.plan === 'personalizado' ? ` (${lic.durationDays} dias)` : ''}`],
        ['Válida até', lic.expiresAt ? validUntilText(lic.expiresAt) : 'sem vencimento'],
        ['Código do PC', lic.machine || 'qualquer PC'],
        ['Gerada em', dateText(lic.createdAt)],
        ['Valor', lic.price !== null ? brl(lic.price) : '—'],
        ['Série', html`<span class="num">${lic.serial}</span>`],
        ['Origem', lic.source === 'pc' ? 'Painel ADM do PC' : lic.source === 'manual' ? 'adicionada à mão' : 'este celular'],
      ]} />
      ${lic.note && !editing ? html`<p class="muted small" style="margin:12px 0 0">${lic.note}</p>` : null}
    </section>
    ${editing ? html`<section class="card stack">
      <${Field} label="Valor recebido (R$)" id="ls-price"><input id="ls-price" class="input" inputmode="decimal" value=${price} onInput=${(e) => setPrice(e.target.value)} placeholder="0,00" /></${Field}>
      <${Field} label="Observação" id="ls-note"><input id="ls-note" class="input" value=${note} onInput=${(e) => setNote(e.target.value)} /></${Field}>
      <div class="btn-row"><${Button} onClick=${() => setEditing(false)}>Cancelar</${Button}><${Button} kind="primary" onClick=${save}>Salvar</${Button}></div>
    </section>` : html`<div class="btn-row">
      <${Button} icon="cash" onClick=${() => setEditing(true)}>Valor e observação</${Button}>
      ${client ? html`<${Button} icon="user" onClick=${() => openLayer({ component: AssignSheet, props: { licenseId: lic.id } })}>Trocar cliente</${Button}>`
        : html`<${Button} kind="primary" icon="user" onClick=${() => openLayer({ component: AssignSheet, props: { licenseId: lic.id } })}>Definir cliente</${Button}>`}
    </div>`}
    <${Button} kind="danger" block icon="trash" onClick=${remove}>Apagar registro</${Button}>
  </${Sheet}>`;
}

/* ------------------------------------------------------------------ de quem é a chave */

export function AssignSheet({ licenseId }) {
  const data = useStore((s) => s.data);
  const lic = data.licenses.find((l) => l.id === licenseId);
  const [q, setQ] = useState('');
  if (!lic) return html`<${Sheet} title="Chave"><${Empty} icon="key" title="Chave não encontrada" /></${Sheet}>`;
  const nq = norm(q.trim());
  const clients = [...data.clients].filter((c) => !nq || norm(`${c.name} ${c.contact}`).includes(nq)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const assign = (clientId) => {
    updateData((d) => updateLicense(d, lic.id, { clientId }));
    closeLayer();
    toast('Chave ligada ao cliente.');
  };
  const createNew = () => openLayer({ component: ClientForm, props: { initialName: q.trim() || lic.note || '', onSaved: (id) => { updateData((d) => updateLicense(d, lic.id, { clientId: id })); closeLayer(); toast('Cliente criado e chave ligada a ele.'); } } });

  return html`<${Sheet} title="De quem é esta chave?">
    <section class="card">
      <${Kv} rows=${[
        ['Plano', planLabel(lic.plan)],
        ['Válida até', lic.expiresAt ? validUntilText(lic.expiresAt) : 'sem vencimento'],
        ['Código do PC', lic.machine || 'qualquer PC'],
        lic.note ? ['Observação', lic.note] : null,
      ]} />
    </section>
    <${Button} kind="primary" block icon="plus" onClick=${createNew}>Novo cliente${q.trim() || lic.note ? `: ${q.trim() || lic.note}` : ''}</${Button}>
    <input class="input" type="search" placeholder="Ou procure um cliente" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Procurar cliente" />
    ${clients.length ? html`<section class="card flush"><div class="list">
      ${clients.slice(0, 50).map((c) => html`<button type="button" class="item" key=${c.id} onClick=${() => assign(c.id)}>
        <${Avatar} name=${c.name} /><div class="grow"><div class="t ellipsis">${c.name}</div>${c.contact ? html`<div class="d ellipsis">${c.contact}</div>` : null}</div>
        ${lic.clientId === c.id ? html`<${Icon} name="check" class="gold-text" />` : null}
      </button>`)}
    </div></section>` : html`<p class="faint small" style="margin:0">${data.clients.length ? 'Ninguém com esse nome.' : 'Você ainda não tem clientes cadastrados.'}</p>`}
  </${Sheet}>`;
}
