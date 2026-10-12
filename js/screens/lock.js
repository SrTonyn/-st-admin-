import { html, useEffect, useLayoutEffect, useRef, useState } from '../vendor/preact.mjs';
import { Button, Keypad, PinDots, Banner, pickTextFile, Icon } from '../ui.js';
import { getState, unlockSession, writeVault, toast, toastError, confirmDialog } from '../state.js';
import { parsePrivatePem, publicKeyFromSeed, fingerprint, bytesToHex, hexToBytes } from '../license.js';
import { seal, open } from '../vault.js';

const MIN_PIN = 4;
const MAX_PIN = 8;

/** Teclado físico (ou do computador) também digita o PIN. */
function useKeyboard(onDigit, onBack, onEnter) {
  const h = useRef();
  h.current = { onDigit, onBack, onEnter };
  // useLayoutEffect: o teclado já responde no mesmo instante em que a tela aparece
  useLayoutEffect(() => {
    const fn = (e) => {
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (/^\d$/.test(e.key)) h.current.onDigit(e.key);
      else if (e.key === 'Backspace') h.current.onBack();
      else if (e.key === 'Enter' && h.current.onEnter) h.current.onEnter();
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);
}

/** Estado do PIN guardado também numa ref: toques rápidos não se perdem. */
function usePin() {
  const [pin, setPinState] = useState('');
  const ref = useRef('');
  const set = (v) => { ref.current = v; setPinState(v); };
  return [pin, set, ref];
}

/* ------------------------------------------------------------- desbloquear */

export function LockScreen() {
  const vault = getState().vault;
  const len = vault.pinLength || 0;
  const [pin, setPin, pinRef] = usePin();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [msg, setMsg] = useState('');
  const [shake, setShake] = useState(false);
  const failsRef = useRef(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!waitUntil) return undefined;
    const t = setInterval(() => { if (Date.now() >= waitUntil) { setWaitUntil(0); setMsg(''); } tick((x) => x + 1); }, 500);
    return () => clearInterval(t);
  }, [waitUntil]);

  async function tryPin(p) {
    if (busyRef.current || waitUntil) return;
    busyRef.current = true;
    setBusy(true);
    setMsg('');
    try {
      const seed = await open(vault, p);
      const pub = hexToBytes(vault.pub);
      unlockSession({ seed, pub, fingerprint: vault.fingerprint });
    } catch {
      failsRef.current += 1;
      setPin('');
      setShake(true);
      setTimeout(() => setShake(false), 400);
      if (failsRef.current >= 5) { failsRef.current = 0; setWaitUntil(Date.now() + 30000); setMsg('Muitas tentativas. Espere 30 segundos.'); } else setMsg('PIN incorreto.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const digit = (d) => {
    if (busyRef.current || waitUntil || pinRef.current.length >= MAX_PIN) return;
    const p = pinRef.current + d;
    setPin(p);
    if (len && p.length === len) tryPin(p);
  };
  const back = () => setPin(pinRef.current.slice(0, -1));
  useKeyboard(digit, back, () => pinRef.current.length >= MIN_PIN && tryPin(pinRef.current));

  const forgot = async () => {
    const ok = await confirmDialog({
      title: 'Esqueceu o PIN?',
      text: 'A chave privada é removida deste celular e você importa o arquivo .pem de novo, com um PIN novo. Seus clientes e chaves registradas continuam aqui.',
      confirmLabel: 'Importar de novo',
      danger: true,
    });
    if (ok) writeVault(null);
  };

  const wait = waitUntil ? Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000)) : 0;
  return html`<main class="lock">
    <div class="lock-top">
      <img src="icons/icon-192.png" alt="" />
      <h1>ST Admin</h1>
      <p>${busy ? 'Abrindo…' : 'Digite seu PIN'}</p>
      <${PinDots} length=${len || Math.max(MIN_PIN, pin.length)} filled=${pin.length} shake=${shake} />
      <div class="pin-msg" role="alert">${wait ? `Muitas tentativas. Espere ${wait} s.` : msg}</div>
    </div>
    <div>
      <${Keypad} onDigit=${digit} onBack=${back} left=${html`<button type="button" class="fn" onClick=${forgot}>Esqueci</button>`} />
      ${!len ? html`<div style="margin-top:12px"><${Button} kind="primary" block disabled=${pin.length < MIN_PIN} loading=${busy} onClick=${() => tryPin(pin)}>Entrar</${Button}></div>` : null}
    </div>
  </main>`;
}

/* ------------------------------------------------------------- primeira vez */

export function SetupScreen() {
  const [step, setStep] = useState(1);
  const [key, setKey] = useState(null); // { seed, pub, fp }
  const [pasting, setPasting] = useState(false);
  const [pemText, setPemText] = useState('');
  const [err, setErr] = useState('');
  const [pin, setPin, pinRef] = usePin();
  const [pin2, setPin2, pin2Ref] = usePin();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [shake, setShake] = useState(false);

  async function useText(text) {
    setErr('');
    try {
      const seed = parsePrivatePem(text);
      const pub = await publicKeyFromSeed(seed);
      setKey({ seed, pub, fp: await fingerprint(pub) });
      setPasting(false);
      setPemText('');
    } catch (e) {
      setErr(e.message);
    }
  }

  async function pickFile() {
    try {
      const f = await pickTextFile();
      if (f) await useText(f.text);
    } catch (e) { setErr(e.message); }
  }

  async function finish(finalPin) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const v = await seal(key.seed, finalPin, bytesToHex(key.pub), key.fp);
      v.pinLength = finalPin.length;
      writeVault(v);
      try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch { /* ignorado */ }
      unlockSession({ seed: key.seed, pub: key.pub, fingerprint: key.fp });
      toast('Tudo pronto. Sua chave está protegida pelo PIN.');
    } catch (e) {
      toastError(e);
      busyRef.current = false;
      setBusy(false);
    }
  }

  const digit = (d) => {
    if (busyRef.current) return;
    if (step === 2) { if (pinRef.current.length < MAX_PIN) setPin(pinRef.current + d); return; }
    if (step === 3) {
      const first = pinRef.current;
      const p2 = pin2Ref.current + d;
      if (p2.length > first.length) return;
      setPin2(p2);
      if (p2.length === first.length) {
        if (p2 === first) finish(p2);
        else {
          setShake(true);
          setTimeout(() => { setShake(false); setPin2(''); setPin(''); setStep(2); setErr('Os PINs não batem. Crie de novo.'); }, 450);
        }
      }
    }
  };
  const back = () => { if (step === 2) setPin(pinRef.current.slice(0, -1)); if (step === 3) setPin2(pin2Ref.current.slice(0, -1)); };
  const toConfirm = () => { if (pinRef.current.length >= MIN_PIN) { setErr(''); setStep(3); } };
  useKeyboard(step > 1 ? digit : () => {}, step > 1 ? back : () => {}, step === 2 ? toConfirm : null);

  const steps = html`<div class="steps" aria-label=${`Passo ${step} de 3`}>${[1, 2, 3].map((n) => html`<i class=${n <= step ? 'on' : ''}></i>`)}</div>`;

  if (step === 1) {
    return html`<main class="page" style="padding-top:calc(28px + var(--safe-t));min-height:100vh;align-content:start">
      <div class="lock-top" style="margin-bottom:6px">
        <img src="icons/icon-192.png" alt="" />
        <h1>ST Admin</h1>
        <p>Chaves e clientes do ST Optimizer Pro, no seu celular.</p>
      </div>
      ${steps}
      <section class="card stack">
        <div class="card-head" style="margin:0"><h2>Importe sua chave privada</h2></div>
        <p class="muted" style="margin:0">É o arquivo <b>st-license-private.pem</b>, na pasta <b>.keys</b> do projeto no PC. É com ele que as chaves são geradas.</p>
        ${key ? html`<${Banner} kind="ok" icon="checkCircle" title="Chave carregada">
            Impressão digital <b class="num">${key.fp}</b>. Ela aparece igual no Painel ADM do app do PC.
          </${Banner}>` : null}
        ${err ? html`<${Banner} kind="bad" icon="alertCircle" title="Não deu certo">${err}</${Banner}>` : null}
        ${pasting ? html`<div class="stack tight">
            <textarea class="textarea mono" rows="6" placeholder="-----BEGIN PRIVATE KEY-----" value=${pemText} onInput=${(e) => setPemText(e.target.value)} autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>
            <div class="btn-row"><${Button} onClick=${() => { setPasting(false); setErr(''); }}>Cancelar</${Button}><${Button} kind="primary" disabled=${!pemText.trim()} onClick=${() => useText(pemText)}>Usar este texto</${Button}></div>
          </div>`
          : key ? html`<${Button} kind="primary" block icon="chevronRight" onClick=${() => { setErr(''); setStep(2); }}>Continuar</${Button}>`
            : html`<div class="stack tight">
              <${Button} kind="primary" block icon="file" onClick=${pickFile}>Escolher o arquivo .pem</${Button}>
              <${Button} block icon="paste" onClick=${() => setPasting(true)}>Colar o conteúdo</${Button}>
            </div>`}
      </section>
      <${Banner} icon="shield" title="Como passar o arquivo para o celular">
        Use cabo USB ou o Quick Share do Android. Não mande por WhatsApp, e-mail ou nuvem. Depois de importar, apague a cópia da pasta Downloads: a chave fica guardada aqui, trancada pelo PIN.
      </${Banner}>
    </main>`;
  }

  const current = step === 2 ? pin : pin2;
  return html`<main class="lock">
    <div class="lock-top">
      ${steps}
      <h1>${step === 2 ? 'Crie um PIN' : 'Digite o PIN de novo'}</h1>
      <p>${step === 2 ? 'De 4 a 8 números. Ele protege a chave e abre o app.' : 'Para confirmar.'}</p>
      <${PinDots} length=${step === 2 ? Math.max(MIN_PIN, pin.length) : pin.length} filled=${current.length} shake=${shake} />
      <div class="pin-msg" role="alert">${busy ? html`<span class="muted">Protegendo a chave…</span>` : err}</div>
    </div>
    <div>
      <${Keypad} onDigit=${digit} onBack=${back} left=${html`<button type="button" class="fn" onClick=${() => { setPin(''); setPin2(''); setErr(''); setStep(step === 3 ? 2 : 1); }}><${Icon} name="chevronLeft" /></button>`} />
      ${step === 2 ? html`<div style="margin-top:12px"><${Button} kind="primary" block disabled=${pin.length < MIN_PIN} onClick=${toConfirm}>Continuar</${Button}></div>` : null}
    </div>
  </main>`;
}
