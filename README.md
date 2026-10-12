# ST Admin: o app do celular

App só seu, para o Android, que:

- **gera as chaves** `ST6-…` do ST Optimizer Pro (as mesmas do Painel ADM do PC);
- guarda **clientes, planos, vencimentos e quanto você recebeu**;
- mostra **quantos clientes estão ativos**, quantos por plano, **quem vence nos próximos 7 dias** e a **receita do mês**;
- manda a chave ou a cobrança direto no **WhatsApp** do cliente.

Funciona **sem internet** depois da primeira abertura e **não depende do Claude** nem de servidor: é um site estático que você hospeda de graça no GitHub Pages e instala no celular como app.

> **Seus dados ficam só no celular.** O site guarda apenas o código do app. A chave privada e a lista de clientes ficam no aparelho; a chave fica trancada pelo PIN.

---

## 1. Publicar no GitHub Pages (uma vez, uns 10 minutos)

1. Crie uma conta grátis em https://github.com.
2. Clique em **New repository** (botão verde). Nome: `st-admin`. Deixe **Public** (o GitHub Pages grátis exige; é seguro, veja abaixo). Clique em **Create repository**.
3. Na página do repositório, clique em **uploading an existing file**.
4. Abra a pasta `app-celular` no PC, selecione **tudo o que está dentro dela** (as pastas `css`, `fonts`, `icons`, `js` e os arquivos `index.html`, `manifest.webmanifest`, `sw.js`, `.nojekyll`…) e arraste para a página. Não arraste a pasta `app-celular` em si.
5. Clique em **Commit changes** e espere terminar o envio.
6. Vá em **Settings → Pages**. Em *Build and deployment*, escolha **Deploy from a branch**, branch **main**, pasta **/ (root)** e clique em **Save**.
7. Espere 1 ou 2 minutos e recarregue a página: aparece o endereço do app, algo como `https://SEU-USUARIO.github.io/st-admin/`.

**É seguro deixar público?** Sim. O código do app não tem nenhum segredo: sem o seu arquivo `.pem` e o seu PIN ninguém gera chaves, e os seus clientes nunca saem do seu celular.

**Nunca envie para o GitHub** o arquivo `.pem`, a pasta `.keys` ou os arquivos de backup (`st-admin-backup-….txt`).

---

## 2. Instalar no Android

1. No celular, abra o endereço no **Chrome**.
2. Toque no menu **⋮** → **Instalar app** (ou **Adicionar à tela inicial**).
3. O ícone do ST aparece na tela inicial. Abra por ele.

---

## 3. Primeira vez

1. **Passe o arquivo `st-license-private.pem` para o celular** (está na pasta `.keys` do projeto no PC). Use **cabo USB** ou **Quick Share**. Não mande por WhatsApp nem por e-mail: a chave ficaria guardada nas conversas.
2. No app, toque em **Escolher o arquivo .pem** e selecione o arquivo.
3. Confira a **impressão digital** (ex.: `5QDE-E1CG`): ela tem que ser igual à que aparece no **Painel ADM do app do PC**. Se for diferente, o `.pem` não é o mesmo usado no instalador e as chaves não vão funcionar.
4. Crie um **PIN** de 4 a 8 números (ele abre o app e protege a chave).
5. Apague a cópia do `.pem` da pasta Downloads do celular.

---

## 4. No dia a dia

- **Vender:** toque no botão **+** (Gerar). Escolha ou cadastre o cliente, o plano, cole o **código do PC** que ele te mandou (aparece na tela Licença do app dele), confira o valor e toque em **Gerar chave**. Depois toque em **Enviar para…**: se o contato do cliente for um número, o WhatsApp abre na conversa com a mensagem pronta.
- **Renovar:** no Painel (quem vence nos próximos 7 dias) ou na ficha do cliente, toque em **Renovar**. Com **Somar ao tempo que falta** ligado, a chave nova começa quando a atual termina, e o cliente não perde nenhum dia.
- **Cobrar:** toque em **Cobrar** em quem está para vencer, ou em **Chamar** em quem já venceu. A mensagem já vai escrita; dá para mudar o texto em Ajustes → Mensagens.
- **Cliente diz que a chave não funciona:** use **Verificar**. O app mostra se a chave é verdadeira, se venceu e para qual PC foi gerada. Se o cliente formatou ou trocou de PC, o código do PC muda: gere uma chave nova para o código novo.

Uma chave gerada **não pode ser cancelada**: apagar o registro no app só tira ela das suas contas. Por isso, use o código do PC sempre que puder.

---

## 5. Backup (importante)

Os clientes ficam **só neste celular**. Em **Ajustes → Salvar backup**, escolha **Google Drive** (ou mande para você mesmo). O arquivo se chama `st-admin-backup-ANO-MÊS-DIA.txt`. Se a lista de apps não abrir, ele vai para a pasta **Downloads**: mande de lá para o Drive. Faça isso toda semana; o app avisa quando o último backup estiver velho.

**Celular novo:** instale o app, importe o `.pem` de novo, crie o PIN e use **Restaurar backup**. O backup não leva a chave privada (por segurança).

**Chaves que você já gerou no PC:** no PC, abra a pasta `%APPDATA%\ST Optimizer Pro\data` (cole esse caminho no Explorador de Arquivos), passe o arquivo `adm-history.json` para o celular e use **Ajustes → Importar chaves do PC**. Elas entram em **Sem cliente**: toque em cada uma para dizer de quem é.

---

## 6. Segurança

- O app **bloqueia sozinho** quando fica alguns minutos fora da tela (configurável em Ajustes) e pede o PIN de novo.
- Errou o PIN 5 vezes, espera 30 segundos.
- Esqueceu o PIN: toque em **Esqueci** na tela do PIN e importe o `.pem` de novo. Seus clientes continuam.
- **Perdeu o celular desbloqueado?** Quem pegar pode gerar chaves. Nesse caso, crie um par de chaves novo no PC (`npm run keygen -- init --force`), gere um instalador novo e reimporte o `.pem` novo aqui. Atenção: as chaves vendidas antes param de funcionar nos instaladores novos (as cópias já instaladas continuam aceitando as chaves antigas).

---

## 7. Atualizar o app

Quando houver uma versão nova do app do celular:

1. No projeto do PC, rode `node tools/app-celular-sw.js 1.0.1` (troque pelo número da versão). Isso avisa os celulares que há atualização.
2. No GitHub, abra o repositório `st-admin` → **Add file → Upload files** e arraste de novo o conteúdo da pasta `app-celular` (substitui os arquivos antigos). **Commit changes** e espere 1 ou 2 minutos.
3. No celular, abra o app com internet e espere uns segundos: a versão nova é baixada sozinha. Feche o app (tire ele dos apps recentes) e abra de novo. Em **Ajustes → Sobre** aparece o número da versão nova.

---

Feito com Preact (MIT), noble-ed25519 (MIT) e a fonte Barlow (SIL OFL). As licenças estão em `js/vendor/LICENSES.txt` e `fonts/OFL-Barlow.txt`.
