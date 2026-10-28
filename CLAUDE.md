# Importação - Controller Pedido — CLAUDE.md

Aplicativo de gestão de compras internacionais / importação do **Grupo Top Internacional Ltda** (Manaus · AM).

---

## Stack

- **Single-page HTML** — sem framework, vanilla JS + CSS puro
- **Chart.js 4.4.1** (CDN; guarda com `if (typeof Chart !== 'undefined')` para uso offline)
- **Google Fonts** — Outfit (display), Inter (body), JetBrains Mono (mono/números)
- **Arquivo principal:** `index.html` (toda a app está neste único arquivo)
- Abre localmente via `file://` ou qualquer servidor HTTP estático

---

## Arquitetura

### Navegação SPA
```js
const views = { dashboard, lancamentos, faturamento, embarque, pagamento, relatorios, fornecedores, colaboradores, cidades };
function showView(id) { /* troca .active no .view e .nav-item */ }
```
- Cada tela é `<div class="view" id="view-<id>">`
- `data-view="<id>"` nos itens do sidebar aciona `showView()`

### Tema / tokens
```css
:root {
  --bg-base: #07101E; --bg-panel: #0D1B2E; --bg-card: #122035;
  --border: rgba(255,255,255,0.07); --border-md: rgba(255,255,255,0.12);
  --cyan: #00CFFF; --violet: #9B7AFF; --green: #00D68F;
  --amber: #F5A623; --rose: #FF4D6D;
  --ff-body: 'Inter', sans-serif;
  --ff-display: 'Outfit', sans-serif;
  --ff-mono: 'JetBrains Mono', monospace;
}
```

### Modais
- `#modal-backdrop` — modal principal de lançamento (novo pedido)
- `#cambio-backdrop` — modal Taxas de Câmbio (acessível do Dashboard e de Pagamento)

---

## Setores (códigos oficiais)

| Código  | Nome completo        |
|---------|----------------------|
| A       | ACESSÓRIOS           |
| B       | BIJOUX               |
| BEB     | BEBIDAS              |
| BEB NAC | BEBIDAS NACIONAL     |
| BOL     | BOLSAS, MALAS        |
| C       | COSMETIC             |
| C&D     | CASA & DECORAÇÃO     |
| O       | ÓCULOS               |
| P       | PERFUMARIA           |
| PUB     | PUBLICIDADE          |
| R       | RELÓGIOS             |

---

## Localização
- **ZF** — Zona Franca de Manaus  
- **SP** — São Paulo  
- Responsáveis: **BM** (Buyer Manager) e **COORD BM** (Coordenador)

---

## Moedas suportadas
USD · EUR · GBP · CHF  
(Taxas de câmbio gerenciadas via modal "Taxas de Câmbio")

---

## Telas implementadas (v12)

| Tela          | Status | Descrição                                              |
|---------------|--------|--------------------------------------------------------|
| Dashboard     | ✅     | KPIs, sparklines SVG, gráficos Chart.js, Taxas câmbio |
| Pedidos       | ✅     | Tabela com filtros de setor/local, Resumo Total        |
| Faturamento   | ✅     | Gestão de NFs e faturas                                |
| Embarque      | ✅     | Tracking de embarques (marítimo/aéreo)                 |
| Pagamento     | ✅     | Controle de pagamentos + Taxas câmbio                  |
| Relatórios    | ✅     | Charts para Diretoria (mensal/anual)                   |
| Fornecedores  | ✅     | Cadastro de fornecedores                               |
| Colaboradores | ✅     | Cadastro de equipe (BM / COORD BM)                     |

---

## Backend (Fase 1 — concluída)

**Banco:** Neon (PostgreSQL serverless, plano free, região `aws-sa-east-1`)
- Projeto: `topimport-pro` (id: `plain-math-38332499`) · branch `main` · database `topimport`
- 8 tabelas: `fornecedores`, `colaboradores`, `cidades`, `pedidos`, `faturas`, `embarques`, `pagamentos`, `taxas_cambio`
- Row Level Security (RLS) habilitado em todas — acesso liberado apenas à role `authenticated`

**Auth:** Neon Auth (Stack Auth) — login por e-mail/senha, token JWT validado via RLS
**Data API:** `https://ep-floral-shape-b6ctsiwl.apirest.c-2.sa-east-1.aws.neon.tech/topimport/rest/v1` (PostgREST — chamado direto do frontend, sem backend próprio)

**Arquivos de integração:**
- `js/config.js` — URLs e chaves públicas (publishable key, Data API URL)
- `js/auth.js` — signIn / signUp / signOut via Stack Auth
- `js/api.js` — cliente REST genérico (`DB.list/create/update/remove`)
- `js/cadastros.js` — overlay de login + CRUD real para Fornecedores, Colaboradores, Cidades
- `js/lancamento.js` — modal de Novo Lançamento (4 abas) ligado ao banco + listagem real de Pedidos
- `js/dashboard.js` — Dashboard (KPIs, sparklines, gráficos, últimos lançamentos) e Relatórios
  (comparativo anual, top fornecedores) calculados sobre `pedidos` real
- `js/views.js` — Faturamento, Embarque e Pagamento (KPIs + tabelas) lendo `faturas`,
  `embarques` e `pagamentos` reais, com join em `pedidos`/`fornecedores`
- `js/cambio.js` — Modal de Taxas de Câmbio ligado ao banco: exposição em aberto e
  histórico de cotações direto de `pedidos`/`taxas_cambio`

## Fase 3 — Modal de Lançamento (concluída)

O modal de 4 abas (Pedido → Fatura → Embarque → Pagamento) grava direto no Neon ao clicar
em "Confirmar Lançamento":
- Aba **Pedido** cria 1 linha em `pedidos` (fornecedor, colaborador e setor via selects
  carregados do banco; destino mapeado para `localizacao` ZF/SP)
- Aba **Fatura** cria 1 linha em `faturas` (vencimento calculado automaticamente a partir
  da data de emissão + prazo em dias)
- Aba **Embarque** cria 1 linha em `embarques` (só se algum campo for preenchido)
- Aba **Pagamento** cria 1 linha em `pagamentos` (valor em BRL calculado automaticamente
  a partir do valor da fatura × taxa de câmbio)
- A tela **Pedidos** (`view-lancamentos`) lista os pedidos reais via
  `select=*,fornecedores(razao_social),colaboradores(nome,cargo)` (join nativo do PostgREST)
- Campos sem coluna própria no banco (Marca, SKU, Incoterm, Navio/AWB, Peso Bruto, Qtde)
  são concatenados em `pedidos.descricao` — path de melhoria futura é criar colunas
  dedicadas se a Diretoria precisar filtrar/relatar por esses campos individualmente

## Fase 4 — Dashboard e Relatórios com dados reais (concluída)

- **KPI cards (USD/EUR/GBP/CHF)**: soma de `valor_total` por moeda no mês atual, com
  variação % vs. mês anterior (quando houver histórico)
- **Sparklines**: série real dos últimos 6 meses por moeda
- **Compras por Mês**: gráfico de barras com `valor_total` por moeda, mês a mês, no ano atual
- **Distribuição por Moeda**: donut com participação de cada moeda sobre o total em `valor_brl`
- **Últimos Lançamentos**: 6 pedidos mais recentes, com fornecedor/colaborador via join
- **Relatórios — Diretoria**: Volume Total, Nº de Pedidos e Câmbio Médio USD do ano atual
  (com variação vs. ano anterior), Comparativo Anual por trimestre e Top 5 Fornecedores —
  todos calculados a partir de `pedidos` e `fornecedores`
- Tudo recalcula automaticamente após cada novo lançamento salvo

## Fase 6 — Taxas de Câmbio ligadas ao banco (concluída)

O modal "Taxas de Câmbio" (`#cambio-backdrop`, acessível do Dashboard e de Pagamento)
agora lê e grava direto no Neon, em vez de usar dados fixos no HTML:

- **Exposição em aberto**: ao abrir o modal, para cada moeda (USD/EUR/GBP/CHF) o app
  consulta `pedidos` filtrando `taxa_cambio IS NULL` e soma `valor_total` — isso alimenta
  o campo "Total em aberto" (`data-total`/`data-count` dos inputs `nova-taxa-*`) e o
  badge de contagem (`inv-usd`, `inv-eur`, etc.), sempre refletindo a exposição real de
  pedidos ainda sem câmbio contratado.
- **Taxa Atual**: mostra a cotação mais recente de cada moeda, lida de `taxas_cambio`
  (`order=data_cotacao.desc`), ou "—" se nunca houve lançamento para aquela moeda.
- **Aplicar Taxas**: ao confirmar, para cada moeda com valor digitado o app
  1) grava uma nova linha em `taxas_cambio` (histórico) e
  2) localiza todos os `pedidos` daquela moeda com `taxa_cambio` pendente e atualiza
     `taxa_cambio` + recalcula `valor_brl = valor_total × taxa` — cumprindo a promessa
     do modal de recalcular automaticamente as invoices em aberto.
- Depois de aplicar, Dashboard, Pedidos, Faturamento/Embarque/Pagamento e a própria
  exposição do modal são recarregados para refletir os novos valores em BRL.
- Arquivo: `js/cambio.js`. Novo método genérico `DB.updateWhere(table, query, payload)`
  em `js/api.js` para atualizações por filtro (sem precisar de um `id` único).

## Fase 7 — Edição e exclusão de registros (concluída)

- **Fornecedores / Colaboradores / Cidades**: cada linha/card agora tem ✏️ (editar) e
  🗑️ (excluir). Editar reabre o modal de cadastro já preenchido (`DB.update`); excluir
  pede confirmação e remove via `DB.remove`. Exclusão de um fornecedor/colaborador com
  pedidos vinculados é bloqueada pela FK do banco e mostra um aviso amigável.
- **Pedidos**: cada linha tem 🗑️ para excluir o pedido inteiro — como `faturas`,
  `embarques` e `pagamentos` têm `ON DELETE CASCADE` em `pedido_id`, os registros
  filhos são removidos automaticamente pelo banco.
- **Faturamento / Embarque / Pagamento**: cada linha tem 🗑️ para excluir apenas
  aquele registro (a invoice, o embarque ou o pagamento), sem afetar o pedido-pai.
- Edição ainda não existe para Pedidos/Faturas/Embarques/Pagamentos (apenas exclusão) —
  alterar esses dados hoje exige excluir e lançar novamente pelo modal de 4 abas;
  um editor dedicado para esses registros fica para uma sprint futura.

## Fase 8 — Exportação para Excel e PDF (concluída)

- **Pedidos / Faturamento / Embarque / Pagamento**: o botão "📤 Exportar" de cada tela
  gera um `.xlsx` com exatamente as linhas visíveis em tela (respeita os filtros já
  aplicados, como os chips de setor/local em Pedidos).
- **Relatórios — Diretoria**: dois botões novos —
  "📄 Exportar PDF" gera um PDF formatado (indicadores do ano, comparativo trimestral
  vs. ano anterior, top 5 fornecedores); "📊 Exportar Excel" gera o mesmo conteúdo em
  3 abas de uma planilha `.xlsx`.
- Bibliotecas via CDN: **SheetJS (xlsx 0.18.5)** para Excel e **jsPDF 2.5.1 +
  jspdf-autotable 3.8.2** para PDF. Arquivo: `js/export.js`.
- Corrigido de passagem: `buildReportCharts()` (Relatórios) tinha um flag que travava
  o recálculo depois da primeira vez que a tela era aberta — agora recalcula sempre,
  garantindo que os dados exportados estejam atualizados.

## Fase 9 — Notificações de vencimento (concluída)

- O sininho 🔔 na topbar (antes um botão decorativo, sem função) agora abre um
  dropdown com todas as **invoices e pagamentos pendentes vencendo em até 7 dias**
  (ou já vencidos), ordenados do mais urgente para o menos urgente.
- Um badge numérico aparece no sininho (vermelho se houver algo vencido/vencendo em
  ≤3 dias, âmbar se for só aviso) e também no item "Dashboard" do menu lateral
  (substitui o número fixo "3" que existia apenas como mock visual).
- Clicar em uma notificação leva direto para a tela de Faturamento ou Pagamento.
- A verificação roda ao entrar no app, depois de qualquer gravação (novo lançamento,
  exclusão, aplicação de taxas de câmbio) e a cada 5 minutos enquanto o app estiver
  aberto. Arquivo: `js/notificacoes.js`.
- Não há notificação push/e-mail — é um alerta dentro do próprio app, visível
  enquanto a pessoa estiver com a tela aberta.

## Fase 10 — Edição completa de Pedidos (concluída)

- A tabela de **Pedidos** agora tem ✏️ (editar) além do 🗑️ já existente. Clicar em
  editar reabre o modal de 4 abas (Pedido/Fatura/Embarque/Pagamento) já preenchido
  com os dados reais do pedido, fatura, embarque e pagamento vinculados — incluindo
  os campos que hoje vivem concatenados em `pedidos.descricao` (Marca, SKU, Qtde,
  Navio/AWB, Peso, Incoterm), que são decompostos de volta para os campos do form.
- Ao clicar em "💾 Salvar Alterações", cada aba faz `UPDATE` no registro existente
  em vez de `INSERT` — e se uma aba for esvaziada (ex.: apagar o nº da invoice), o
  registro correspondente é excluído (com o cuidado de desvincular `pagamentos.fatura_id`
  antes de excluir a fatura, já que essa FK não tem cascade).
- Editar não afeta Fornecedores/Colaboradores/Cidades — isso já foi resolvido na Fase 7.
- Arquivo: `js/lancamento.js` (`openEditPedido`, `parseDescricao`, branch isEdit no
  handler de `#modal-confirm`).

## Fase 11 — Upload de arquivos (concluída)

- **Backend de storage**: como o Neon não tem Storage nativo, os arquivos vivem num
  bucket **Supabase Storage** dedicado (`importacao-anexos`), criado dentro do projeto
  Supabase que o usuário já tinha (`gestao-alugueis`, id `xgzhvsovzxtcdhfkesgd`) —
  um projeto novo foi tentado primeiro mas bateu no limite de 2 projetos gratuitos da
  conta. O bucket é público para leitura (URLs diretas) e aceita upload/update/delete
  sem autenticação própria (o app já é protegido pelo login do Neon Auth antes de
  qualquer tela aparecer). Limite de 20MB por arquivo. Isso é só para os arquivos —
  todos os dados e a autenticação continuam 100% no Neon.
- **Novas colunas no Neon**: `pedidos.arquivo_pi_url`, `embarques.arquivo_bl_url`,
  `pagamentos.arquivo_cambio_url` (faturas já tinha `arquivo_url` desde a Fase 1).
- **Modal de Lançamento**: cada aba (Pedido, Fatura, Embarque, Pagamento) ganhou um
  campo "📎 Escolher arquivo" — PI, Invoice/NF, BL e comprovante de câmbio,
  respectivamente. O upload acontece assim que o arquivo é selecionado (antes de
  salvar o lançamento); o link fica guardado em memória e só é gravado no banco
  junto com o resto do formulário, ao confirmar.
- **Edição**: abrir um pedido para editar mostra o anexo já salvo (com link para abrir)
  e permite substituí-lo ou removê-lo (✕).
- **Visualização**: as tabelas de Pedidos, Faturamento, Embarque e Pagamento mostram
  um ícone 📎 clicável ao lado do número do pedido/invoice quando há arquivo anexado.
- Arquivos: `js/storage.js` (upload/remove via REST do Supabase Storage),
  `js/lancamento.js` (wiring dos 4 campos de upload + inclusão nos payloads).
- **Limpeza de órfãos (concluída)**: excluir um pedido (e seus registros em cascade),
  uma invoice, um embarque ou um pagamento agora também remove o arquivo
  correspondente do bucket — o app busca a URL do anexo antes de apagar a linha no
  Neon e chama `Storage.remove()` (best-effort: se a remoção no bucket falhar, a
  exclusão do registro no banco não é bloqueada). Substituir um anexo no modal
  (enviar um novo arquivo no lugar de um já salvo, ou clicar em ✕ para remover) também
  limpa o arquivo antigo do bucket.

## Funcionalidades pendentes (próximas sprints)

- [x] Persistência de dados — Neon + Data API
- [x] Autenticação de usuários — Neon Auth
- [x] CRUD de Fornecedores / Colaboradores / Cidades
- [x] Modal de lançamento (Pedido/Fatura/Embarque/Pagamento) ligado ao banco — Fase 3
- [x] Dashboard (KPIs, gráficos) e Relatórios com dados reais — Fase 4
- [x] Faturamento, Embarque e Pagamento exibindo dados reais (leitura) — Fase 5
- [x] Tela de Taxas de Câmbio ligada ao banco (exposição real + histórico) — Fase 6
- [x] Exclusão de registros em todas as telas; edição completa em Fornecedores/Colaboradores/Cidades — Fase 7
- [x] Exportação para Excel / PDF (relatório Diretoria) — Fase 8
- [x] Notificações de vencimento / alerta de prazo (dentro do app) — Fase 9
- [x] Edição completa de Pedidos/Faturas/Embarques/Pagamentos — Fase 10
- [x] Upload de arquivos (PI, BL, NF, Câmbio) — Fase 11
- [x] Limpeza automática de anexos órfãos no Storage quando um registro é excluído

~~Integração com planilha Google Sheets original~~ — descartada a pedido do usuário;
o app substitui a planilha, não precisa ler/escrever nela.

**Todos os itens do escopo original do projeto estão concluídos.**

---

## Convenções de código

- IIFEs para módulos JS isolados: `(function () { ... })();`
- Classes CSS com prefixo semântico: `.grp-`, `.loc-`, `.resumo-`, `.kpi-`, `.nav-`
- SVG sparklines inline (sem CDN) — arrays de pontos calculados dinamicamente
- Guarda Chart.js: `if (typeof Chart !== 'undefined') { ... }`
- Números no formato BR: `1.234.567,89`

---

## Referência visual

Artifact publicado (preview): `https://claude.ai/artifact/VDuP6L7TfnvE5GSGpavo6Z`

---

## Segurança (auditoria — Fase 12)

Pedido do usuário: *"veja a questão da segurança de dados, o app tem que ser privado."*

### Problema encontrado
O Neon Auth (Stack Auth) estava com **auto-cadastro aberto e sem verificação de
e-mail** (`allow_sign_up: true`, `require_email_verification: false`). Combinado com
a RLS original (`authenticated_full_access ... USING (true)`), isso significava que
**qualquer pessoa que chegasse na tela de login do app e clicasse em "Criar conta"
ganhava acesso total de leitura/escrita a todos os dados** (fornecedores, pedidos,
faturas, embarques, pagamentos, taxas de câmbio, colaboradores, cidades) — sem
precisar ser convidada por ninguém.

As ferramentas de MCP do Neon disponíveis nesta sessão **não expõem um jeito de
desligar o auto-cadastro / exigir verificação de e-mail diretamente** (isso só é
ajustável pelo painel do Stack Auth / Neon Auth). Em vez de depender só disso, a
correção foi feita na camada do banco, que é mais forte e não depende de nenhuma
configuração externa:

### Correção aplicada (banco de dados)
1. Criada a tabela `public.usuarios_permitidos` (e-mail, nome, ativo) — uma lista de
   permissão. Hoje contém `marquesfb7@gmail.com` (Marques) e
   `adm.financeiro@topinternacional.com.br` (administrador oficial do app).
2. Criada a função `public.app_is_authorized()`, que verifica se o usuário autenticado
   (via `auth.user_id()`, o id do Stack Auth) corresponde a um e-mail **ativo** em
   `usuarios_permitidos` (cruzando com `neon_auth.users_sync`).
3. Todas as 8 tabelas de negócio tiveram a política RLS trocada: a antiga
   `authenticated_full_access USING (true)` foi substituída por
   `authorized_users_only USING ((select app_is_authorized()))`.

**Resultado:** mesmo que alguém crie uma conta nova pelo auto-cadastro aberto, essa
conta fica com acesso **zero** — nenhuma linha de nenhuma tabela — até que o e-mail
dela seja adicionado manualmente em `usuarios_permitidos`. O app continua "privado"
mesmo sem depender do toggle de cadastro do Stack Auth.

**Para liberar um novo colaborador:** a pessoa cria a conta normalmente no app, e
em seguida é preciso rodar (via Neon):
```sql
insert into public.usuarios_permitidos (email, nome) values ('email@dominio.com', 'Nome');
```
(ou marcar `ativo = false` para revogar acesso sem apagar o cadastro).

**Recomendação adicional (fora do alcance das ferramentas disponíveis aqui):** no
painel do Stack Auth / Neon Auth, considerar desligar `allow_sign_up` ou ativar
`require_email_verification`, como camada extra. Hoje isso é opcional, porque a
lista de permissão no banco já bloqueia o acesso aos dados de qualquer jeito.

### Login com a Microsoft (Fase 13)
Adicionado login via Microsoft/Azure AD (Entra ID), além do e-mail/senha já existente.
- App registrado no Azure: "Importação Controller Pedido" (locatário único — TOP
  INTERNACIONAL), client id `5959256f-3cd1-4f8e-bd98-897fd64abf35`.
- Provedor `microsoft` registrado no Neon Auth via `add_auth_oauth_provider`
  (client_id/secret/tenant_id do Azure acima).
- `https://claude.ai` liberado em `trusted_origins` (`add_auth_trusted_domain`), para o
  redirecionamento de volta ao artifact publicado funcionar.
- Implementado à mão em `js/auth.js` (sem SDK pesado): fluxo OAuth2 + PKCE puro —
  `signInWithMicrosoft()` gera `code_verifier`/`state`, pede a URL de autorização em
  `${STACK_API_URL}/auth/oauth/authorize/microsoft` e redireciona; no retorno,
  `handleOAuthCallback()` troca o `code` por token em `${STACK_API_URL}/auth/oauth/token`.
  Contrato da API confirmado lendo o código-fonte real do pacote `@stackframe/js`
  (não documentado publicamente em detalhe) — não usa o SDK em si, só replica a
  chamada REST que ele faz, pra não pesar o app com as dependências dele.
- Botão "Entrar com a Microsoft" no `login-overlay` (`index.html`), eventos
  `topimport:auth-changed` / `topimport:auth-error` ligam o retorno assíncrono do
  OAuth ao `overlay`/`loadAll()` em `cadastros.js`.

**Importante:** login pela Microsoft segue as mesmas regras da seção de Segurança
acima — o e-mail da conta Microsoft usada também precisa estar em
`usuarios_permitidos` (ativo) para o usuário enxergar algum dado, senão a RLS
bloqueia tudo mesmo com login OK.

### Risco residual conhecido — Storage (anexos PI/NF/BL/câmbio)
O bucket `importacao-anexos` (Supabase Storage, projeto `gestao-alugueis`) usa a
`anon key` pública diretamente do navegador — é assim que o Storage do Supabase
funciona sem um backend próprio. As policies hoje liberam select/insert/update/delete
para quem tiver essa chave, que **necessariamente fica visível no JS do app publicado**
(não há como escondê-la em uma arquitetura 100% client-side). Ou seja: embora os
*dados* do app (Neon) estejam agora travados pela lista de permissão acima, os
*arquivos anexados* (PDFs de PI/NF/BL, comprovantes de câmbio) continuam acessíveis a
quem descobrir essa chave — ela não está amarrada ao login do app.

Isso não foi corrigido nesta fase porque fechar esse gap de verdade exige um
componente de backend (ex.: uma Edge Function que valide o JWT do Stack Auth antes de
autorizar upload/leitura) — uma mudança de arquitetura maior, fora do que pode ser
feito só com Postgres/RLS. Ficou documentado aqui como risco aceito por ora; se o
usuário quiser fechar esse gap também, é um próximo passo possível (Edge Function
"porteira" no Supabase, validando o JWT do Neon Auth antes de liberar o
upload/download do arquivo).

---

## Fase 14 — Deploy corporativo na Vercel (concluída)

Pedido do usuário: *"o app tem que ser corporativo e terá função multi usuário, será
usado no ambiente corporativo"* — sair do artifact do claude.ai (URL privada, de uso
individual) para uma hospedagem própria, multi-usuário, com domínio da empresa.

### Decisão
Vercel, com domínio próprio da empresa (opção escolhida pelo usuário entre as
alternativas apresentadas).

### Como foi feito
- Código-fonte movido para um repositório Git próprio:
  **`github.com/FMDB7/importacao-controller-pedido`** (privado seria recomendado,
  ficou público por padrão de criação do GitHub — pode ser trocado para privado nas
  configurações do repo a qualquer momento, sem afetar o deploy).
- Esse repositório foi conectado ao projeto já existente na Vercel
  (`vercel.com/topinternacional/importacao-controller-pedido`) via
  **Settings → Git → Connect Git Repository**. A partir daí, todo `git push` na
  branch `main` gera automaticamente um novo deployment de produção.
- **URL de produção atual:** `https://importacao-controller-pedido.vercel.app`
- Site 100% estático (os mesmos `index.html` + `css/` + `js/` de sempre) — não há
  build step, `Framework Preset` fica como "Other" e a Vercel serve os arquivos tal
  como estão no repositório.

### Observação importante sobre deploys futuros
Qualquer alteração nos arquivos do app agora deve ser enviada por `git commit` +
`git push origin main` neste repositório para ir ao ar — o artifact do claude.ai
deixou de ser a versão "oficial" do app (continua existindo só como referência
visual/histórica, ver link na seção acima).

### Próximos passos (fora do alcance das ferramentas disponíveis nesta sessão)
- **Domínio próprio da empresa** (ex. `controller.topinternacional.com.br`): precisa
  ser configurado em **Vercel → Settings → Domains**, adicionando o domínio e criando
  o registro DNS (CNAME/A) indicado pela Vercel no provedor de domínio da empresa.
  Ainda não configurado — pendente de decisão do nome exato do subdomínio.
- Depois de ter o domínio definitivo, adicionar essa URL como *trusted origin* no
  Neon Auth (Stack Auth), do mesmo jeito que foi feito para `claude.ai` na Fase 13,
  para o login com a Microsoft continuar funcionando no novo domínio.
- Recomendado tornar o repositório GitHub **privado** (hoje está público), já que o
  código contém a chave pública do Supabase Storage (ver risco residual documentado
  na Fase 12) — tornar o repo privado não afeta o deploy na Vercel.

---

## Fase 15 — Usuários, Permissões por Perfil, Log de Acessos e Sessões Ativas (concluída)

Pedido do usuário: *"adicione uma aba Usuários, com uma tabela lista de usuário, com
nome, e-mail, perfil, status(Ativo), login, ações. Permissões por perfil adicione o
botão Ver log adicione recurso de segurança Ativos botão de sair do sistema"*.

Escopo confirmado com o usuário: 2 perfis (Administrador/Usuário), bloqueio real
(UI + banco), log = apenas histórico de login, "Ativos" = sessões/dispositivos
logados com opção de encerrar.

### Banco de dados (Neon)
- `usuarios_permitidos` ganhou a coluna `perfil` (`'Administrador'` ou `'Usuario'`,
  CHECK constraint). Os dois usuários existentes (`marquesfb7@gmail.com`,
  `adm.financeiro@topinternacional.com.br`) foram marcados como `Administrador`.
- Novas funções SECURITY DEFINER: `app_current_email()` (e-mail do usuário logado,
  via `auth.user_id()` + `neon_auth.users_sync`), `app_is_admin()` (true se o e-mail
  logado está em `usuarios_permitidos` com `perfil='Administrador'` e `ativo=true`)
  e `app_me()` (RPC — `select email,nome,perfil,ativo` do próprio usuário; é assim
  que o front obtém o próprio perfil sem precisar de SELECT direto na tabela).
- `usuarios_permitidos`: SELECT/INSERT/UPDATE/DELETE agora são **admin-only**
  (`admin_select`/`admin_insert`/`admin_update`/`admin_delete`) — um usuário comum
  não lista nem altera a tabela de usuários; ele só vê o próprio perfil via `app_me()`.
- Novas tabelas, ambas com RLS "vê/edita o próprio registro, ou tudo se for admin":
  - `login_log` (id, email default `app_current_email()`, nome, metodo
    `'senha'|'microsoft'`, dispositivo, data_hora) — um INSERT por login bem-sucedido.
  - `sessoes_ativas` (id, session_token único, email default `app_current_email()`,
    nome, dispositivo, iniciado_em, ultimo_ping, revogado) — uma linha por aba/sessão
    de navegador logada; heartbeat atualiza `ultimo_ping`; admin apaga a linha de
    outro usuário para "forçar logout" dele.

### Frontend
- **`js/api.js`**: novos helpers genéricos `DB.rpc(fn, params)` (chama
  `POST /rpc/<fn>` da Data API) e `DB.removeWhere(table, query)` (DELETE em massa
  por filtro PostgREST, usado para apagar `usuarios_permitidos` por e-mail).
- **`js/usuarios.js`** (novo arquivo) concentra toda a lógica:
  - `getMe()`/`applyPerfilUI()` — busca o perfil via `app_me()` e mostra/esconde
    todo elemento com `[data-requires-admin]` (o item de menu "Usuários" e seu
    conteúdo); também preenche o cartão de usuário da sidebar (nome/perfil/iniciais),
    que deixou de ser texto fixo ("Marques F." / "Financeiro").
  - `registrarLogin(metodo)` — grava uma linha em `login_log` e garante uma sessão
    ativa, chamado nos dois pontos de sucesso de login (e-mail/senha e Microsoft).
  - `garantirSessao()`/`iniciarHeartbeat()` — cria (ou reaproveita, via
    `sessionStorage`) um `session_token` por aba, grava a linha em `sessoes_ativas`
    e, a cada 60s, atualiza `ultimo_ping`; se a linha desaparecer (sessão encerrada
    por um admin) ou vier `revogado=true`, a aba é deslogada automaticamente com um
    aviso.
  - `encerrarSessaoPropria()`/`sair()` — usado pelo novo botão "🚪 Sair do sistema"
    na sidebar: apaga a própria linha de sessão e chama `Auth.signOut()`.
  - `renderUsuarios()` — preenche a tabela da aba Usuários (Nome/E-mail/Perfil via
    `<select>`/Status/Último login/Ações), com ações para alternar Ativo/Inativo e
    remover o acesso (deleta de `usuarios_permitidos`).
  - `renderSessoesAtivas()` — tabela de sessões ativas (e-mail, dispositivo resumido,
    início, Online/Inativa conforme o `ultimo_ping`) com botão "Encerrar sessão".
  - Modal **"👤 Novo Usuário"** — pré-autoriza um e-mail (insere em
    `usuarios_permitidos` com nome/perfil); a pessoa só ganha acesso de fato depois
    de criar a própria conta (senha ou Microsoft) com esse e-mail.
  - Modal **"📜 Ver Log"** — lista as últimas 300 entradas de `login_log`.
- **`index.html`**: novo item de menu "Usuários" (dentro de uma seção
  `data-requires-admin`, escondida por padrão), a view `#view-usuarios` (tabela de
  usuários + matriz "Permissões por Perfil" + tabela de Sessões Ativas), os modais
  `#log-modal-backdrop` e `#novo-usuario-backdrop`, e o botão "🚪 Sair do sistema" no
  rodapé da sidebar (`[data-logout]`).
- **`js/app.js`**: `views` ganhou `usuarios:'Usuários'`; `showView('usuarios')`
  dispara `renderUsuarios()` + `renderSessoesAtivas()`.
- **`js/cadastros.js`**: `doAuth()` (login por senha) e o listener de
  `topimport:auth-changed` (login Microsoft) agora chamam
  `Usuarios.registrarLogin(metodo)`; o caminho de "já estava logado ao recarregar a
  página" chama `Usuarios.garantirSessao()` (retoma o heartbeat sem logar um novo
  acesso); `loadAll()` chama `Usuarios.refreshMeAndPermissions()` para manter a UI
  de admin/usuário sempre atualizada.

### Observações
- O bloqueio é "de verdade" nos dois níveis pedidos: a UI escondida (`display:none`)
  é só conveniência — a proteção real é a RLS acima, então mesmo chamando a Data API
  direto, um usuário comum nunca lê a lista de usuários, o log de acessos ou as
  sessões de outra pessoa.
- Não existe deleção de conta de autenticação do Stack Auth por aqui — "remover
  usuário" remove apenas da lista de permissão (`usuarios_permitidos`); a pessoa
  pode até ter uma conta no Stack Auth, mas sem entrada ativa na lista ela não
  acessa nenhum dado (mesma lógica da Fase 12).
- Perfis são só dois por decisão do usuário (Administrador/Usuário); criar um
  terceiro perfil no futuro exigiria estender a CHECK constraint de `perfil` e as
  funções `app_is_admin()`/matriz de permissões.

---

## Fase 16 — Login somente Microsoft, restrito a domínios corporativos (concluída)

Pedido do usuário: *"implemente o login ao entrar seja somente pela microsoft...
para entrar o usuário terá que estar cadastrado no app, usando o e-mail cadastrado
na conta corporativa e usando a senha do próprio e-mail"* — e-mail do administrador
oficial `adm.financeiro@topinternacional.com.br`; usuários devem entrar com conta
`@topinternacional.com.br` ou `@tfs.com.br`.

### O que mudou
- **Login por e-mail/senha removido da tela** (`index.html` — `#login-overlay` não
  tem mais os campos de e-mail/senha nem o link "Criar conta"; sobrou só o botão
  "Entrar com a Microsoft" e um texto indicando os domínios aceitos).
- **`js/cadastros.js`**: toda a lógica de `doAuth()`/modo signin-signup foi removida.
  Após qualquer login Microsoft bem-sucedido, `aposLoginOk()` chama a nova RPC
  `app_whoami()` para descobrir o e-mail autenticado e confere se o domínio é
  `topinternacional.com.br` ou `tfs.com.br`; se não for, a sessão é encerrada
  (`Auth.signOut(false)`, sem recarregar a página) e aparece uma mensagem de erro
  clara em vez da pessoa cair numa tela vazia por falta de permissão.
- **`js/auth.js`**: `signOut(reload = true)` ganhou um parâmetro opcional para poder
  limpar a sessão sem recarregar a página (usado no caso acima, pra pessoa conseguir
  ler a mensagem de erro antes do reload).
- **Banco (Neon)**: nova função `public.app_whoami()` (RPC, `SELECT email FROM
  neon_auth.users_sync WHERE id = auth.user_id()`) — diferente de `app_me()`, não
  depende de o e-mail já estar em `usuarios_permitidos`; serve só para o front
  descobrir "qual e-mail a Microsoft acabou de autenticar", mesmo que a pessoa
  ainda não tenha sido liberada no app.
- `adm.financeiro@topinternacional.com.br` já estava marcado como `Administrador`
  em `usuarios_permitidos` desde a Fase 15 — nenhuma mudança necessária aqui.
- As funções `Auth.signIn`/`Auth.signUp` (e-mail/senha) continuam existindo em
  `js/auth.js` por segurança/compatibilidade, mas não são mais chamadas por
  nenhuma tela do app — o único caminho de entrada é o botão da Microsoft.

### Importante — o que isso NÃO cobre (fora do alcance das ferramentas desta sessão)
- A restrição de domínio acima é feita **no app** (depois que a Microsoft já
  autenticou a pessoa). Ela não impede, por si só, que alguém com qualquer conta
  Microsoft pessoal complete o login OAuth — só impede que, depois de logada, essa
  conta use o sistema (é deslogada na hora com a mensagem de domínio não autorizado).
  Pra bloquear isso já na tela de login da própria Microsoft (antes mesmo de voltar
  pro app), é preciso configurar no **Azure AD / Entra ID** (painel do Azure, fora
  do alcance das ferramentas Neon disponíveis aqui): em **App registrations → Importação
  Controller Pedido → Authentication**, confirmar que o tipo de conta suportado é
  "Accounts in this organizational directory only" (single-tenant) — isso por si só
  já restringe ao tenant da TOP INTERNACIONAL.
- **Ponto a confirmar com o usuário**: para que contas `@tfs.com.br` também
  funcionem, esse domínio precisa estar registrado como um **domínio verificado no
  mesmo tenant do Azure AD** usado pelo app (`client_id
  5959256f-3cd1-4f8e-bd98-897fd64abf35`) — ou seja, `tfs.com.br` e
  `topinternacional.com.br` precisam ser domínios da mesma organização/tenant no
  Microsoft 365 / Entra ID. Se `tfs.com.br` for um tenant diferente (empresa
  separada), o app precisaria ser registrado como **multi-tenant** no Azure, o que
  não foi configurado nesta fase — a checagem de domínio implementada aqui só cobre
  o lado do app; a capacidade de login de fato (se a Microsoft deixa um usuário
  `@tfs.com.br` autenticar nesse app registration) depende dessa configuração no
  Azure, que precisa ser verificada/ajustada por quem tem acesso ao painel do Azure
  AD da empresa.
- Continua valendo a regra da Fase 12/15: mesmo com e-mail de domínio certo e login
  Microsoft bem-sucedido, a pessoa só vê dados se o e-mail dela estiver cadastrado
  (e ativo) em `usuarios_permitidos` — isso é feito manualmente por um Administrador
  na aba **Usuários** do app (Fase 15).

---

## Fase 17 — Planejamento de capacidade do Neon (fase de teste → produção)

Pedido do usuário: ainda em fase de teste, mas o volume mensal real será grande —
checar se o **plano Free da Neon** aguenta antes de ir pra produção. Dados
informados: **~80 pedidos/mês, 2 usuários, 12h/dia, só dias úteis**.

### Limites do plano Free da Neon (checados em 25/10/2026, neon.com/pricing)
- **Armazenamento**: 1 GB por projeto (20 GB no total da conta) — acima disso
  **bloqueia novas escritas** (não apaga dado nenhum).
- **Compute**: 100 CU-horas/mês — ao esgotar, **o banco fica suspenso até o início
  do próximo período de cobrança** (indisponibilidade temporária, sem perda de dado).
- Projeto hoje: `topimport-pro` (`plain-math-38332499`), plano `free_v3`, compute
  fixo em 0,25 CU (sem autoscaling configurado).

### Projeção com os números informados
- **Armazenamento**: hoje as 4 tabelas principais de negócio (`pedidos`, `faturas`,
  `embarques`, `pagamentos`) somam só 488 KB com 2 registros de teste — base
  pequena demais pra extrapolar com precisão, mas por serem só texto/data/UUID
  (os anexos/PDFs ficam no Supabase Storage, não no Neon) o crescimento projetado
  fica na casa de poucas dezenas de MB por ano, mesmo em cenário conservador. **Não
  é um fator limitante no horizonte de alguns anos.**
- **Compute — fator que realmente limita aqui**: o heartbeat de sessão (Fase 15,
  `js/usuarios.js`) grava em `sessoes_ativas` a cada 60s enquanto alguém está
  logado, o que impede o banco de suspender sozinho (timeout de 5 min de
  ociosidade) durante o expediente. Com 12h/dia × ~21,7 dias úteis/mês ≈ 261h de
  banco "acordado"/mês × 0,25 CU fixo ≈ **~65 CU-horas/mês consumidas, de 100
  disponíveis (~35% de margem livre)**.

### Conclusão / recomendação
Com os números atuais, **o plano Free aguenta**, mas sem muita folga no compute —
um 3º usuário, jornada maior que 12h, alguém deixando aba aberta fora do
expediente, ou uso mais pesado de relatórios/exportações pode empurrar acima do
limite mensal de CU-horas (consequência: banco suspenso até o mês seguinte, não
perda de dado). Quando isso apertar, o caminho é migrar pro plano **Launch**
(pay-as-you-go, sem teto fixo de storage/compute) — custo estimado pra esse mesmo
volume de uso: **~US\$ 6,90/mês** só de compute (US\$ 0,106/CU-hora), storage
irrelevante no preço. Upgrade é só trocar o plano no painel da Neon, não exige
mudança de código.

**Acompanhar**: se o uso real (nº de pedidos/mês, horas de operação, nº de
usuários) crescer além do informado aqui, vale refazer essa conta antes que o
compute estoure no meio de um mês.

### Anexos (PI/NF/BL/câmbio) NÃO contam no limite de espaço do Neon acima

Pergunta do usuário: anexar PDF/imagem de invoice consome espaço no banco?

**Não no Neon.** Os anexos (Fase 11) não ficam no Postgres — só o **link** (URL)
é gravado nas colunas `*_url`, poucos bytes de texto. O arquivo em si vive no
**Supabase Storage** (bucket `importacao-anexos`, projeto `gestao-alugueis`,
`xgzhvsovzxtcdhfkesgd`), que é a conta/limite que realmente importa aqui:

- Uso real checado em 25/10/2026: **1 arquivo, 41 KB**.
- Limite do plano Free do Supabase Storage: **1 GB** (fonte:
  [jetadmin.io](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/),
  [makerkit.dev](https://makerkit.dev/blog/md/saas/supabase-pricing)). Limite por
  arquivo configurado no app: 20 MB.
- **Projeção pro volume da Fase 17** (80 pedidos/mês × até 4 anexos/pedido — PI,
  Invoice/NF, BL, comprovante de câmbio): com PDFs escaneados leves (~0,3–0,5 MB
  cada) o 1 GB dura uns 6–10 meses; com fotos de celular/PDFs pesados (2–5 MB
  cada) pode estourar já no 1º mês. **O que decide é o tamanho médio dos
  arquivos anexados, não o nº de pedidos.**
- Se/quando estourar: plano Pro do Supabase, US\$ 25/mês (já inclui 8 GB de
  Storage, depois US\$ 0,125/GB extra) — nota: esse projeto Supabase é
  compartilhado com outro app do usuário (`gestao-alugueis`), então o upgrade
  valeria pros dois.

**Acompanhar**: reavaliar esse número depois de algumas semanas de uso real com
anexos de verdade (hoje é só 1 arquivo de teste).

### Decisão: upload de anexo removido do modal (manter plano Free)

Depois da projeção acima, o usuário decidiu **manter o plano gratuito** do
Supabase Storage por ora e **removeu a opção de anexar PDF/imagem** (PI, NF,
BL, comprovante de câmbio) do modal de Novo Lançamento/Edição — assim nenhum
upload novo acontece, e o uso do bucket fica parado no que já existe (1
arquivo de teste, 41 KB).

- Removido de `index.html`: os 4 campos "📎 Escolher arquivo" nas abas
  Pedido/Fatura/Embarque/Pagamento do modal.
- Removido de `js/lancamento.js`: o wiring de upload (click/change nos
  inputs de arquivo, chamadas a `Storage.upload()`).
- Removido de `css/styles.css`: as classes exclusivas desses campos
  (`.file-upload-field` e afins).
- **Mantido sem alteração** (não grava arquivo novo, só lê/remove o que já
  existe): o link de um anexo já salvo antes dessa mudança é preservado ao
  editar um pedido antigo e salvar de novo; o ícone 📎 nas tabelas continua
  abrindo anexos já existentes; a limpeza automática de anexos órfãos no
  bucket ao excluir um registro continua funcionando.
- As colunas `arquivo_pi_url`/`arquivo_url`/`arquivo_bl_url`/
  `arquivo_cambio_url` continuam existindo no Neon (não removidas) — se o
  usuário quiser reativar o upload no futuro, é só reverter esse commit
  (`js/storage.js` e a Edge Function `anexos-gateway` da Fase 12 continuam no
  lugar, intactos).

---

## Fase 18 — Remoção da tela Cidades (concluída)

A tela "Cidades" (cadastro de cidade/estado/país de origem + código de porto
ou aeroporto) era um catálogo isolado: ao ser perguntado sobre o que ela
fazia, ficou claro que ela nunca esteve conectada a nenhum outro ponto do
app — o campo "Cidade Destino" do modal de Embarque é um select fixo com as
4 localizações brasileiras (Manaus/Macapá/Extrema/Guajará), e "Porto de
Embarque" é texto livre; nenhum dos dois lê o cadastro de Cidades. A pedido
do usuário, a tela foi removida:

- `index.html`: item de menu "Cidades", a view `#view-cidades` e a menção a
  "Cidades" na matriz de Permissões por Perfil (Fase 15).
- `js/app.js`: `cidades` removido do mapa `views`.
- `js/cadastros.js`: `renderCidades()`, a entrada `cidades` do catálogo de
  cadastro rápido (usada pelo botão "+ Nova Cidade") e `CACHE.cidades`.
- `css/styles.css`: classes exclusivas da tela (`.city-table`, `.city-row`
  e afins).
- A tabela `cidades` no Neon **não foi apagada** (ficou vazia, 0 registros,
  desde antes dessa fase) — só a tela que lia/escrevia nela foi removida.
  Se o usuário quiser reativar esse cadastro no futuro (por exemplo,
  conectando-o de verdade ao campo "Porto de Embarque"), é só reverter este
  commit; nada no banco precisa mudar.

---

## Fase 19 — Alertas de vencimento nas colunas Faturamento/Pagamento (concluída)

Pedido do usuário: ícone de alerta ao lado da data de vencimento, nas abas
Faturamento e Pagamento, no padrão de um exemplo de imagem (🚨 vermelho para
vencido, ⚠️ âmbar para vencendo em breve).

- **Faturamento** (`js/views.js`, `renderFaturamento`): a célula de
  Vencimento agora prefixa a data com 🚨 (vencida) ou ⚠️ (vence em até 7
  dias), reaproveitando o `dias`/`vencCor` já calculados ali. O alerta só
  aparece para invoices com status `Pendente`/`Vencida` — uma invoice `Paga`
  ou `Cancelada` não exibe ícone mesmo que a data já tenha passado.
- **Pagamento** (`js/views.js`, `renderPagamento`): mesmo padrão — a célula
  de Vencimento ganhou cor (antes só tinha cor no badge de status) e o
  prefixo 🚨/⚠️, condicionado a `status !== 'Liquidado'`.
- Os emojis são removidos automaticamente dos relatórios em PDF/Excel pela
  rotina de limpeza de emoji já existente em `js/export.js`
  (`EMOJI_RE`/`tabelaParaAOA`), então os exports continuam só com a data,
  sem mojibake — nada precisou mudar em `export.js` para isso.

---

## Fase 20 — Exceção de domínio para teste (marquesfb7@gmail.com)

Pedido do usuário: *"permita que o e-mail marquesfb7@gmail.com acesse o app para
testes"*.

- No banco, `marquesfb7@gmail.com` **já estava** em `usuarios_permitidos`, ativo,
  perfil `Usuario` (adicionado desde a Fase 12) — então o bloqueio real era só a
  checagem de domínio feita no app (Fase 16), que rejeita qualquer e-mail fora de
  `@topinternacional.com.br`/`@tfs.com.br` antes mesmo de chegar na regra do banco.
- `js/cadastros.js`: `dominioPermitido()` ganhou uma lista extra
  `EMAILS_TESTE_PERMITIDOS = ['marquesfb7@gmail.com']` — um e-mail nessa lista passa
  na checagem de domínio independentemente do domínio real, mas **continua**
  precisando estar ativo em `usuarios_permitidos` (a RLS do banco não foi alterada).
- **Importante — ressalva sobre o login com a Microsoft**: o app registrado no Azure
  (Fase 13) é **single-tenant** (só contas `@topinternacional.com.br`/Azure AD da
  empresa) — ver nota já existente na Fase 16. Isso significa que, mesmo com essa
  exceção liberada no app, clicar em "Entrar com a Microsoft" usando uma conta
  pessoal da Microsoft associada a `marquesfb7@gmail.com` pode falhar **já na tela
  de login da própria Microsoft** (erro AADSTS de tenant), antes de o app sequer
  entrar em ação — isso depende de configuração do Azure AD / Entra ID (painel do
  Azure, fora do alcance das ferramentas Neon desta sessão) e não foi verificado
  aqui. Se o login falhar nesse ponto, o próximo passo (fora do alcance desta
  sessão) é tornar o app registration **multi-tenant + contas pessoais da
  Microsoft** no Azure, para que uma conta Microsoft pessoal vinculada a um e-mail
  Gmail consiga autenticar.

---

## Fase 21 — Vencimento editável e Status automático em Faturamento (concluída)

Pedido do usuário: *"na aba faturamento, vencimento, permita que o vencimento seja
ajustado manualmente, e na coluna status, identifique de forma automática se a
invoice está vencida, a vencer ou liquidada"*.

### Vencimento editável
- A célula de Vencimento (`js/views.js`, `renderFaturamento`) agora é
  `cell-editable`: clicar nela abre um `<input type="date">` (mesmo padrão visual
  dos `<select>` de status já usados em Embarque/Pagamento) e grava direto em
  `faturas.data_vencimento` ao confirmar.
- Nova função genérica `wireInlineDate(table, field, onSaved)` em `js/views.js`,
  espelhando a `wireInlineStatus` já existente, mas para campos de data — escrita
  genérica por tabela/campo para poder ser reaproveitada em outras telas no
  futuro, se precisar.
- Como o alerta 🚨/⚠️ (Fase 19) e o Prazo já eram derivados de
  `data_vencimento`, eles recalculam sozinhos assim que o vencimento é ajustado e
  a tela recarrega — nada precisou mudar nessa parte.

### Status 100% automático (saiu de manual)
- Antes, o Status de uma invoice (Pendente/Paga/Vencida/Cancelada) era escolhido
  manualmente clicando na célula (mesmo mecanismo de Embarque/Pagamento). Isso foi
  **removido** para Faturamento — a célula deixou de ser clicável e passou a
  mostrar um dos 3 estados pedidos, calculados a cada render por
  `statusAutoFat(f, dias, liquidada)`:
  - **Liquidada** — existe um registro em `pagamentos` vinculado a essa fatura
    (`pagamentos.fatura_id`) com `status = 'Liquidado'`. A query de `faturas`
    ganhou o embed `pagamentos(status)` (PostgREST, via a FK
    `pagamentos.fatura_id → faturas.id`) para isso.
  - **Vencida** — `data_vencimento` já passou e não está liquidada.
  - **A Vencer** — ainda não venceu e não está liquidada.
  - **Cancelada** — preservada apenas como estado legado: se a fatura já tiver
    `status = 'Cancelada'` gravado no banco (de antes dessa fase), continua
    aparecendo assim em vez de Vencida/A Vencer; não é mais algo que se defina
    por esta tela (não há mais UI para cancelar uma invoice aqui).
- `wireInlineStatus('faturas', ...)` foi removido do wiring final (só
  `embarques`/`pagamentos` continuam com status editável manualmente).
- Filtro de Status (`#fat-flt-status`, `index.html`) e KPIs ("Invoices Abertas" =
  A Vencer + Vencida, "Invoices Liquidadas" — renomeado de "Invoices Pagas",
  "Valor Pendente" = soma de A Vencer + Vencida) atualizados para a nova
  terminologia.
- Export em PDF/Excel não muda: a coluna Status já era excluída dos relatórios de
  Faturamento desde a Fase 8/19 (`comResumo`/exclusão por nome de coluna em
  `js/export.js`), então o novo texto do badge nunca aparecia ali mesmo.

---

## Fase 22 — Vencimento sincronizado entre Faturamento e Pagamento (concluída)

Pedido do usuário: alterar o vencimento em Pagamento não atualizava Faturamento, e
vice-versa.

- **Causa**: o vencimento vive em duas colunas independentes (`faturas.data_vencimento`
  e `pagamentos.data_vencimento`, ligadas por `pagamentos.fatura_id`) e nenhuma
  edição propagava para a outra.
- **Edição inline** (`js/views.js`): a célula de Vencimento de **Pagamento** agora
  também é clicável/editável. `wireInlineDate` ganhou um callback `sincronizar`:
  editar a invoice atualiza os pagamentos com `fatura_id` dela; editar o pagamento
  atualiza a fatura vinculada. As duas telas recarregam (`renderOperacionais`).
- **Status do pagamento** (`wireInlineStatus('pagamentos')`) também recarrega as duas
  telas — marcar Liquidado agora reflete na hora como "Liquidada" em Faturamento.
- **Modal de edição** (`js/lancamento.js`, `resolverVencimentos`): ao salvar, se
  invoice e pagamento estão vinculados, o campo que a pessoa alterou vence e é
  gravado nos dois (se alterou os dois, vale o do pagamento). Campo não tocado
  mantém o valor gravado, então um ajuste feito na tabela não é sobrescrito pelo
  vencimento recalculado do modal.
- **Não muda**: em um *novo* lançamento invoice (emissão + prazo) e pagamento
  (embarque + condição) continuam calculados separadamente; registros antigos que já
  estão divergentes só convergem na próxima edição do vencimento.

---

## Fase 23 — Limite de 8h de sessão + ordem cronológica dos cards de Pagamento

Pedido do usuário: *"garanta que uma sessão esteja ativa por 8hs, caso passe deste
período, o sistema encerra de forma automática"* e *"na aba pagamento, nos cards
dos meses, organize desta forma jan/26, Fev/26, março/26"*.

### Limite de 8h de sessão (`js/usuarios.js`)
- Nova constante `SESSAO_MAX_MS = 8 * 60 * 60 * 1000`. O heartbeat de sessão
  (Fase 15, roda a cada 60s enquanto a aba está logada) agora também compara
  `Date.now() - sessoes_ativas.iniciado_em` contra esse limite, além de checar
  `revogado` como já fazia.
- Passadas as 8h desde o login (`iniciado_em`, default `now()` no banco),
  independente de a pessoa estar ativa ou não: a linha em `sessoes_ativas` é
  marcada `revogado = true` (pra refletir corretamente em "Sessões Ativas" pra
  um Administrador) e a sessão é encerrada no navegador (`Auth.signOut()`) com
  um aviso claro — mesmo padrão já usado quando um admin força logout de outra
  pessoa.
- A checagem roda **imediatamente** ao entrar/recarregar a página (não só no
  primeiro tick de 60s) — cobre o caso de alguém voltar numa aba que ficou
  aberta de um dia pro outro, já passada a janela de 8h.
- **Escopo**: é um limite do lado do cliente (JS + a linha em `sessoes_ativas`),
  não uma expiração do JWT em si — o token do Stack Auth continua tendo sua
  própria validade/renovação silenciosa (ver comentário de
  `pareceJwtExpirado`/`refreshAccessToken` em `js/api.js`/`js/auth.js`), que é
  mais curta e não governada por aqui. As 8h valem por aba/sessão de navegador
  (`sessionStorage`), não por conta — a mesma pessoa logada em duas abas tem
  duas contagens de 8h independentes.

### Cards de mês em Pagamento — ordem cronológica crescente (`js/views.js`)
- `criarFerramentasTabela(prefixo, opcoes)` ganhou um 2º parâmetro opcional
  `{ ordemAscendente }`. Antes, os cards de período (Faturamento/Embarque/
  Pagamento, todos compartilham essa função) sempre mostravam o mês mais
  recente primeiro. Pagamento agora passa `{ ordemAscendente: true }` e passou
  a mostrar **Jan/26 → Fev/26 → Mar/26 → ...** (mais antigo primeiro);
  Faturamento e Embarque continuam como estavam (mais recente primeiro) — não
  foi pedido mudar essas duas.
- O formato do rótulo em si (`Mmm/AA`, ex. "Jan/26") já era esse antes da
  mudança — o pedido do usuário batia com o formato existente, só a ordem
  mudou.

---

*Projeto: Grupo Top Internacional Ltda — Marques Ferreira — Manaus, AM*
