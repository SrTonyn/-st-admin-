import { html, render, useEffect } from './vendor/preact.mjs';
import { useStore, getState, go, lockSession } from './state.js';
import { Icon, IconButton, LayerHost, Toasts } from './ui.js';
import { LockScreen, SetupScreen } from './screens/lock.js';
import { Dashboard } from './screens/dashboard.js';
import { Clients } from './screens/clients.js';
import { Generate } from './screens/generate.js';
import { Verify } from './screens/verify.js';
import { Settings } from './screens/settings.js';

const TABS = [
  { id: 'painel', label: 'Painel', icon: 'home', title: null, Screen: Dashboard },
  { id: 'clientes', label: 'Clientes', icon: 'users', title: 'Clientes', Screen: Clients },
  { id: 'gerar', label: 'Gerar', icon: 'key', title: 'Gerar chave', Screen: Generate, fab: true },
  { id: 'verificar', label: 'Verificar', icon: 'shield', title: 'Verificar chave', Screen: Verify },
  { id: 'ajustes', label: 'Ajustes', icon: 'settings', title: 'Ajustes', Screen: Settings },
];

function Shell() {
  const tab = useStore((s) => s.tab);
  const t = TABS.find((x) => x.id === tab) || TABS[0];
  const Screen = t.Screen;
  return html`<div class="app">
    <header class="appbar">
      ${t.title ? html`<h1>${t.title}</h1>` : html`<div class="brand"><img src="icons/icon-192.png" alt="" /><h1>ST <b>Admin</b></h1></div>`}
      <${IconButton} icon="lock" label="Bloquear" onClick=${lockSession} />
    </header>
    <main><${Screen} key=${tab} /></main>
    <nav class="nav" aria-label="Menu">
      ${TABS.map((x) => (x.fab
        ? html`<button type="button" class=${`gen ${tab === x.id ? 'on' : ''}`} onClick=${() => go(x.id)} aria-label=${x.label}><span class="fab"><${Icon} name="plus" /></span><span>${x.label}</span></button>`
        : html`<button type="button" class=${tab === x.id ? 'on' : ''} onClick=${() => go(x.id)} aria-current=${tab === x.id ? 'page' : undefined}><${Icon} name=${x.icon} /><span>${x.label}</span></button>`))}
    </nav>
  </div>`;
}

function App() {
  const vault = useStore((s) => s.vault);
  const unlocked = useStore((s) => s.session.unlocked);

  // bloqueia sozinho depois de um tempo fora do app
  useEffect(() => {
    let hiddenAt = 0;
    const fn = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      const s = getState();
      if (hiddenAt && s.session.unlocked && Date.now() - hiddenAt > s.data.settings.lockMinutes * 60000) lockSession();
      hiddenAt = 0;
    };
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  }, []);

  if (!vault) return html`<${SetupScreen} /><${LayerHost} /><${Toasts} />`;
  if (!unlocked) return html`<${LockScreen} key="lock" /><${LayerHost} /><${Toasts} />`;
  return html`<${Shell} /><${LayerHost} /><${Toasts} />`;
}

render(html`<${App} />`, document.getElementById('root'));

// funciona sem internet depois da primeira abertura (e pode ser instalado)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  const reg = () => navigator.serviceWorker.register('sw.js').then((r) => {
    // o app instalado pode ficar dias aberto em segundo plano: ao voltar para
    // ele, procura versão nova (no máximo a cada 30 minutos)
    let checked = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine || Date.now() - checked < 30 * 60e3) return;
      checked = Date.now();
      r.update().catch(() => {});
    });
  }).catch(() => {});
  if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg);
}
