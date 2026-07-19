---
target: "área do SUPER_ADMIN: shell, dashboard, tenants e personalização, desktop e mobile"
total_score: 20
p0_count: 0
p1_count: 3
timestamp: 2026-07-19T11-21-13Z
slug: src-app-admin-admin
---
Method: dual-agent (A: superadmin_design_review · B: superadmin_detector_evidence)

## Design Health Score

| # | Heurística | Nota | Principal questão |
|---|---|---:|---|
| 1 | Visibilidade do estado do sistema | 3/4 | Rascunho, publicação e auditoria são claros; operações secundárias variam no feedback. |
| 2 | Correspondência com o mundo real | 2/4 | “Tenants” e “memberships” expõem a taxonomia técnica da plataforma. |
| 3 | Controle e liberdade | 2/4 | Há restauração e descarte, mas o editor longo não oferece navegação local ou saída compacta. |
| 4 | Consistência e padrões | 2/4 | Status e hierarquia cromática variam entre dashboard, listagem e publicação. |
| 5 | Prevenção de erros | 3/4 | Contraste bloqueia publicação e ações destrutivas pedem confirmação. |
| 6 | Reconhecimento em vez de memorização | 2/4 | A navegação principal é clara; a personalização exige lembrar onde cada ajuste está. |
| 7 | Flexibilidade e eficiência | 1/4 | Não há busca, filtros, ordenação, paginação ou aceleradores para tenants e auditoria. |
| 8 | Estética e design minimalista | 2/4 | A paleta é contida, mas cards repetidos e dez seções simultâneas criam monotonia. |
| 9 | Reconhecimento e recuperação de erros | 2/4 | Há feedback global, porém pouco diagnóstico local nos gerenciadores complexos. |
| 10 | Ajuda e documentação | 1/4 | A ajuda contextual é insuficiente para recursos técnicos e controles desabilitados. |
| **Total** |  | **20/40** | **Aceitável — a base é confiável, mas a experiência ainda exige melhorias significativas.** |

## Veredito de anti-padrões

**Avaliação visual:** risco moderado de aparência gerada por template. A interface evita gradientes, glassmorphism, raios exagerados e movimento decorativo. Entretanto, repete a gramática de dashboard genérico: quatro cards métricos idênticos, quase todas as áreas em `rounded-xl + border + shadow-sm`, ícones Pimenta decorativos e dez cards numerados na personalização. A numeração sugere um processo linear que não existe.

**Detector determinístico:** zero achados nos arquivos de `src/app/(admin)/admin` e `src/components/admin`. O detector não encontrou violações sintáticas dos anti-padrões catalogados. Isso não contradiz a crítica visual: a fragilidade está na composição sistêmica e na arquitetura da informação, não em um efeito proibido isolado.

**Evidência no navegador:** Axe encontrou zero violações A/AA, contraste ou nomes acessíveis nas quatro rotas, em 1440 px e 320 px. Não houve overflow horizontal. A navegação ativa usa `aria-current` corretamente. O overlay visual do Impeccable não foi disponibilizado porque o servidor de injeção recusou conexão; nenhuma sobreposição visível é reivindicada.

**Falso positivo descartado:** a inspeção bruta encontrou o H1 e landmarks internos da prévia, mas o wrapper da vitrine usa `aria-hidden` e `inert`. Esses nós continuam no DOM visual, porém não entram na navegação assistiva. Axe também não apontou landmark ou heading conflitante.

## Impressão geral

O SUPER_ADMIN transmite segurança operacional e já parece um produto utilizável. O shell, os estados de publicação e a auditoria são mais maduros que a arquitetura de trabalho. A maior oportunidade é deixar de apresentar o modelo de dados inteiro e passar a organizar a interface pelas tarefas reais de suporte: encontrar um estabelecimento, entender sua situação e resolver uma necessidade específica com segurança.

## O que está funcionando

1. **Base de segurança forte.** Estado dirty/draft/publicado, bloqueio por contraste, histórico, auditoria e restauração como rascunho reduzem o risco de mudanças irreversíveis.
2. **Responsividade estrutural correta.** Tabelas viram listas, nomes quebram adequadamente, não há overflow do documento e o shell mantém a localização atual em desktop e mobile.
3. **Semântica e acessibilidade sólidas.** Navegações rotuladas, `aria-current`, região de logs nomeada, controles nativos, estados textuais e confirmações explícitas formam uma boa base WCAG.

## Questões prioritárias

### [P1] Encontrar tenants não escala

**Por que importa:** `/admin` e `/admin/tenants` mostram até os 100 registros mais recentes sem busca, filtros, ordenação ou paginação. Um operador que recebe o nome de uma loja não consegue garantir que o estabelecimento aparecerá, e pode gastar tempo escaneando registros manualmente.

**Correção indicada:** transformar busca por estabelecimento em ação dominante; adicionar filtros de status, ordenação, paginação/contagem total e preservar o contexto ao voltar do detalhe. Tenants recentes ou favoritos podem acelerar suporte recorrente.

**Comando sugerido:** `$impeccable shape`

### [P1] A personalização espelha o modelo de dados, não as tarefas

**Por que importa:** identidade, cores, tipografia, layout, imagens, categorias, banners, SEO, domínios, recursos e histórico aparecem como dez seções igualmente presentes. A numeração implica uma sequência obrigatória, enquanto o administrador normalmente chega com uma única tarefa.

**Correção indicada:** reorganizar por intenção: “Identidade e aparência”, “Conteúdo visual”, “Endereço e descoberta” e “Plano e recursos”. Manter o espaço de trabalho comum aberto, revelar configurações avançadas progressivamente e mover histórico para um painel contextual.

**Comando sugerido:** `$impeccable distill`

### [P1] No mobile, edição, prévia e publicação ficam desconectadas

**Por que importa:** abaixo de `xl`, a prévia, o motivo e as ações de salvar/publicar aparecem depois de todo o formulário. Em 320 px, o usuário edita sem ver o resultado, atravessa muitas telas e precisa lembrar o que alterou antes de publicar.

**Correção indicada:** barra móvel sticky com estado e ação primária; prévia acessível por toggle/drawer; navegação local por seções; recuperação destrutiva em menu secundário ou zona de perigo separada.

**Comando sugerido:** `$impeccable adapt`

### [P2] Alvos e estados de controles não formam um sistema único

**Por que importa:** o navegador mediu pelo menos 30 de 103 controles da personalização abaixo de 44 px em uma dimensão, principalmente inputs, selects, link de visualizar e botão Aplicar, com alturas de 37–40 px. Isso não é uma falha WCAG AA automática, e checkboxes rotulados têm área efetiva maior, mas reduz conforto no mobile e diverge dos botões compartilhados de 44 px.

**Correção indicada:** padronizar campos e ações móveis em 44 px quando acionados diretamente; confirmar a área clicável real de checkboxes; garantir estados `focus-visible`, disabled e loading consistentes nos gerenciadores.

**Comando sugerido:** `$impeccable harden`

### [P2] Vocabulário técnico e cor semântica enfraquecem a identidade

**Por que importa:** “Tenants”, “memberships” e explicações de servidor aproximam a interface de um console técnico. Ao mesmo tempo, os mesmos status recebem badges semânticos no dashboard e neutros na listagem; Pimenta aparece em ícones métricos decorativos; salvar é Pimenta e publicar é Erva, deixando ambígua a ação principal.

**Correção indicada:** usar “Estabelecimentos”, “Acessos” e “Recursos do plano” onde não houver necessidade técnica; centralizar um componente de status; reservar Pimenta para foco, seleção e a ação principal escolhida; usar Erva como confirmação após sucesso.

**Comandos sugeridos:** `$impeccable clarify` e `$impeccable colorize`

## Carga cognitiva e jornada emocional

Falham principalmente **single focus**, **chunking**, **minimal choices** e **progressive disclosure**. “Tipografia, tema e layout” combina vários selects com sete toggles. O editor inteiro apresenta mais de dez grupos e quatro decisões de publicação/recuperação. A numeração descreve a carga, mas não a reduz.

A jornada começa com controle e confiança no dashboard. Cai quando o operador precisa encontrar um tenant entre até 100 registros. Volta a subir com prévia, estado de rascunho e histórico. No mobile, termina em uma longa travessia até publicar, criando a sensação de “alterei várias configurações e espero ter publicado a versão certa”, em vez de “ajudei esta loja com segurança”.

## Alertas por persona

**Alex — usuário avançado:** não consegue buscar, filtrar, ordenar, paginar, favoritar ou operar tenants em lote. Para alterar um ajuste conhecido, precisa percorrer uma rota longa sem navegação local. Logs não oferecem filtro por ator, estabelecimento, ação ou período.

**Sam — teclado e tecnologia assistiva:** a base semântica e o Axe são bons. Os riscos restantes são ordem linear excessiva no editor, controles disabled explicados apenas no texto distante e inconsistência visual de status. A prévia está corretamente isolada com `aria-hidden`/`inert`.

**Casey — mobile distraído:** salvar/publicar ficam longe dos campos; a prévia perde proximidade causal; dezenas de escolhas dificultam retomar após interrupção; campos de 37–40 px são menos confortáveis; a navegação superior em duas linhas consome altura antes da tarefa.

## Observações menores

- “Até 100 cadastros mais recentes” explica a limitação, mas não oferece solução quando o registro está ausente.
- “Abra um tenant em Visualizar” repete uma ação óbvia em vez de oferecer suporte contextual.
- Ações de suspender aparecem ao lado da navegação rotineira, aumentando densidade de risco; a confirmação reduz, mas não elimina, essa tensão.
- Metadados em `text-xs` merecem validação contínua contra superfícies quentes, embora o Axe atual esteja limpo.
- “Restaurar padrão” deve deixar explícito se cria rascunho, substitui mudanças locais ou publica imediatamente.

## Perguntas para orientar a evolução

- Se o suporte recebe apenas o nome da loja, consegue chegar ao registro correto em menos de dez segundos?
- Por que a personalização parece uma sequência de dez passos se o operador normalmente precisa alterar apenas uma coisa?
- Qual ação é realmente primária: preservar o trabalho ou colocá-lo no ar?
- O que faria esta área parecer apoio a um comerciante local, e não administração de registros de banco?
- Se a administração mobile é suportada, quais controles precisam permanecer continuamente alcançáveis durante edição e prévia?
