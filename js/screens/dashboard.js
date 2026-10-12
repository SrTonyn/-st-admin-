import { html, useState } from '../vendor/preact.mjs';
import { useStore, go, openLayer } from '../state.js';
import { metrics, brl, planLabel } from '../data.js';
import { PLAN_ORDER } from '../license.js';
import { Avatar, Banner, Button, Empty } from '../ui.js';
import { RevenueChart, sendMessage, templateText } from './common.js';
import { ClientSheet } from './clients.js';
import { saveBackup } from './settings.js';

function DueRow({ row, kind }) {
  const { client, current, status } = row;
  const day = status.until ? status.until.slice(0, 5) : '';
  const when = kind === 'soon'
    ? (status.daysLeft <= 1 ? `último dia (${day})` : `vence em ${status.daysLeft} dias (${day})`)
    : `venceu em ${status.until}`;
  return html`<div class="due">
    <button type="button" class="due-main" onClick=${() => openLayer({ component: ClientSheet, props: { clientId: client.id } })}>
      <${Avatar} name=${client.name} />
      <div class="grow"><div class="t ellipsis" style="font-weight:600">${client.name}</div><div class="d ellipsis muted small">${planLabel(current.plan)} · ${when}</div></div>
    </button>
    <div class="due-actions">
      <${Button} size="sm" icon="send" onClick=${() => sendMessage(client, templateText(kind === 'soon' ? 'remind' : 'winback', client, current))}>${kind === 'soon' ? 'Cobrar' : 'Chamar'}</${Button}>
      <${Button} size="sm" icon="rotate" onClick=${() => go('gerar', { clientId: client.id, renew: true })}>Renovar</${Button}>
    </div>
  </div>`;
}

export function Dashboard() {
  const data = useStore((s) => s.data);
  const [sel, setSel] = useState(null);
  const m = metrics(data);
  const backupDue = data.licenses.length > 0 && (!data.settings.lastBackupAt || Date.now() - data.settings.lastBackupAt > 7 * 86400000);

  if (!data.clients.length && !data.licenses.length) {
    return html`<div class="page">
      <section class="card">
        <${Empty} icon="key" title="Nenhum cliente ainda" action=${html`<div class="stack tight" style="width:100%;max-width:320px">
          <${Button} kind="primary" block icon="plus" onClick=${() => go('gerar')}>Gerar a primeira chave</${Button}>
          <${Button} block icon="download" onClick=${() => go('ajustes')}>Importar chaves do PC</${Button}>
        </div>`}>Cada chave que você gerar fica registrada aqui, com o cliente, o plano, o vencimento e o valor recebido.</${Empty}>
      </section>
    </div>`;
  }

  const plans = PLAN_ORDER.filter((p) => m.byPlan[p]);
  return html`<div class="page">
    ${m.unassigned ? html`<${Banner} kind="gold" icon="inbox" title=${`${m.unassigned} ${m.unassigned === 1 ? 'chave sem cliente' : 'chaves sem cliente'}`}
      actions=${html`<${Button} size="sm" onClick=${() => go('clientes', { filter: 'sem' })}>Organizar</${Button}>`}>Chaves importadas do PC ou de clientes excluídos. Diga de quem é cada uma para entrar na contagem.</${Banner}>` : null}
    ${backupDue ? html`<${Banner} kind="warn" icon="alert" title="Faça um backup"
      actions=${html`<${Button} size="sm" icon="upload" onClick=${saveBackup}>Salvar backup</${Button}>`}>${data.settings.lastBackupAt ? 'O último backup tem mais de uma semana.' : 'Seus clientes ficam só neste celular.'} Guarde o arquivo no Google Drive ou mande para você mesmo.</${Banner}>` : null}

    <section class="card">
      <div class="hero"><span class="value">${m.activeClients}</span><span class="label">${m.activeClients === 1 ? 'cliente ativo' : 'clientes ativos'}<br /><span class="faint">de ${m.totalClients} no total</span></span></div>
      ${plans.length ? html`<div class="plans">${plans.map((p) => html`<span class="plan-chip">${planLabel(p)} <b>${m.byPlan[p]}</b></span>`)}</div>` : null}
    </section>

    <section class="card">
      <div class="card-head"><h2>Em ${m.month.label}</h2></div>
      <div class="stats">
        <div class="stat wide"><div class="k">Receita</div><div class="v">${brl(m.month.revenue, { cents: m.month.revenue % 1 !== 0 })}</div></div>
        <div class="stat"><div class="k">Vendas</div><div class="v">${m.month.sales}</div></div>
        <div class="stat"><div class="k">Clientes novos</div><div class="v">${m.month.newClients}</div></div>
      </div>
      <div class="hr" style="margin:16px 0 12px"></div>
      ${m.months.some((x) => x.revenue > 0)
        ? html`<${RevenueChart} months=${m.months} selected=${sel} onSelect=${setSel} />`
        : html`<p class="faint small" style="margin:0">Sem vendas com valor registrado nos últimos 6 meses. Ao gerar uma chave, informe o valor recebido.</p>`}
    </section>

    <section class="card flush">
      <div class="card-head" style="padding:16px 16px 0"><h2>Vencem nos próximos 7 dias</h2><span class="sub">${m.expiring.length || ''}</span></div>
      ${m.expiring.length
        ? html`<div class="list">${m.expiring.map((r) => html`<${DueRow} key=${r.client.id} row=${r} kind="soon" />`)}</div>`
        : html`<p class="faint small" style="margin:0;padding:4px 16px 16px">Ninguém vence nesta semana.</p>`}
    </section>

    ${m.expired.length ? html`<section class="card flush">
      <div class="card-head" style="padding:16px 16px 0"><h2>Venceram nos últimos 30 dias</h2><span class="sub">${m.expired.length}</span></div>
      <div class="list">${m.expired.map((r) => html`<${DueRow} key=${r.client.id} row=${r} kind="late" />`)}</div>
    </section>` : null}

    <p class="faint tiny center" style="margin:0">Total recebido desde o início: ${brl(m.totalRevenue)}</p>
  </div>`;
}
