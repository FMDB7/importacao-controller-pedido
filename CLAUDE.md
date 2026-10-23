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
| Cidades       | ✅     | Cadastro de cidades logísticas                         |

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

*Projeto: Grupo Top Internacional Ltda — Marques Ferreira — Manaus, AM*
