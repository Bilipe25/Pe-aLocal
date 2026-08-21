---
target: proposta PDV V2
total_score: 34
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 1
timestamp: 2026-08-21T17-41-11Z
slug: public-prototypes-pos-v2-index-html
---

⚠️ DEGRADED: single-context (sub-agents not authorized in this session)

## Design Health Score

| #         | Heuristic                       |     Score | Key issue                                                                                                   |
| --------- | ------------------------------- | --------: | ----------------------------------------------------------------------------------------------------------- |
| 1         | Visibility of System Status     |         4 | Save/version, quote atual, conflito, terminal e sucesso ficam explícitos.                                   |
| 2         | Match System / Real World       |         4 | A linguagem de balcão, comanda, espera e terminal corresponde à operação.                                   |
| 3         | User Control and Freedom        |         3 | Saídas e cancelamentos existem; desfazer remoção ainda está apenas no plano.                                |
| 4         | Consistency and Standards       |         3 | O mundo PedidoLocal é coerente, mas o protótipo ainda usa alguns passos de raio/tipo fora da escala.        |
| 5         | Error Prevention                |         3 | CAS, revalidação e permissão estão bem representados; ações destrutivas ainda precisam da prova interativa. |
| 6         | Recognition Rather Than Recall  |         4 | Favoritos, recentes e atalhos rotulados reduzem memória operacional.                                        |
| 7         | Flexibility and Efficiency      |         4 | Busca, favoritos, top-used, repeat, focus e teclado atendem operadores frequentes.                          |
| 8         | Aesthetic and Minimalist Design |         3 | A composição é calma; microtexto e densidade do rail ainda pedem disciplina de produção.                    |
| 9         | Error Recovery                  |         3 | Conflito e falta de permissão explicam recuperação; validação por item/campo ainda não foi prototipada.     |
| 10        | Help and Documentation          |         3 | Atalhos são encontráveis, mas ajuda contextual de primeiro uso é mínima.                                    |
| **Total** |                                 | **34/40** | **Good**                                                                                                    |

## Design Specificity Verdict

**LLM assessment:** a superfície é reconhecivelmente PedidoLocal, não um POS genérico. Papel/Kraft organiza a bancada, Pimenta fica reservada a decisões, preços têm voz própria e drawers evitam transformar a tela em ERP. A melhor decisão estrutural é manter catálogo/comanda estáveis enquanto espera, repeat, cliente, desconto e terminal chegam como tarefas temporárias.

**Deterministic scan:** o detector executou em fallback regex porque os módulos de parser HTML/CSS não estavam disponíveis. Ele confirmou uma quantidade alta de passos tipográficos e raios fora da escala em `public/prototypes/pos-v2/styles.css`. Os avisos de Inter como fonte “overused” são conscientemente ignorados porque Inter é a fonte de trabalho oficial do `DESIGN.md`; os avisos de Bricolage/Space Mono eram parcialmente causados por nomes abreviados e foram corrigidos. Cores das miniaturas de produto são material ilustrativo, não novos tokens semânticos. O output foi truncado, então não se atribui contagem exata ou alegação de clean bill of health.

**Visual overlays:** nenhuma overlay confiável foi exposta. O navegador integrado permite inspeção e screenshot, mas sua avaliação de página é read-only e não comprovou injeção mutável; a evidência usada foi DOM nomeado, screenshots e teste Playwright.

## Overall Impression

O protótipo resolve a maior tensão da V2: acrescenta retomada, velocidade e governança sem deixar o pedido atual desaparecer. O maior risco restante é transportar esta densidade para produção com microtexto excessivo; a implementação precisa preservar a hierarquia e elevar o piso tipográfico.

## What's Working

- **Continuidade operacional:** “Salvo agora · versão · terminal”, drafts e conflito CAS tornam interrupções recuperáveis sem fingir que o draft já é pedido.
- **Exceções honestas:** desconto sem permissão explica a conta autenticada e rejeita PIN compartilhado; repeat expõe item alterado/indisponível e preço atual.
- **Responsive com prioridade correta:** tablet mantém ação final no viewport, mobile vira fallback de catálogo com “Ver pedido” fixo e focus remove somente o shell global.

## Priority Issues

### [P1] Microtipografia abaixo do piso de produção

**Why it matters:** metadados do rail, cards e drawers ainda chegam a 9–12 px. Em tablet de balcão, distância, reflexo e pressa transformam isso em erro operacional.

**Fix:** na implementação React, usar 14 px como piso para informação essencial, 12 px somente para metadado verdadeiramente secundário, e validar contraste/zoom 200% com conteúdo real.

**Suggested command:** `$impeccable typeset`.

### [P2] Desfazer e confirmação destrutiva ainda não são demonstrados

**Why it matters:** remover o último item, limpar a comanda ou descartar um draft durante pico pode apagar trabalho sem recuperação visível.

**Fix:** toast “Item removido · Desfazer” para remoção simples; confirmação com consequência e identificação do draft para limpar/descartar.

**Suggested command:** `$impeccable harden`.

### [P2] Validação detalhada não aparece perto do item/campo

**Why it matters:** a V1 já recebe `error.details`, mas um erro genérico no rail obriga o operador a procurar o campo incorreto.

**Fix:** mapear path de schema para linha, modalidade, cliente, endereço, pagamento e desconto; focar o primeiro erro sem perder o draft.

**Suggested command:** `$impeccable clarify`.

### [P2] Escala de tokens precisa ser normalizada no código real

**Why it matters:** raios de 10/11/13/14 px e cores ilustrativas misturadas a tokens tornam a passagem do protótipo ao design system inconsistente.

**Fix:** usar somente `sm/md/lg/xl/full` nos componentes produtivos e manter cores de miniatura confinadas ao asset/placeholder, sem papéis semânticos.

**Suggested command:** `$impeccable polish`.

## Persona Red Flags

**Alex (Power User):** os aceleradores principais existem e são ignorados durante digitação, mas o grid ainda não demonstra navegação por setas/roving focus. Alex dependerá de Tab em muitos produtos se a implementação repetir o HTML estático literalmente.

**Sam (Accessibility-Dependent):** headings, dialogs, radios, labels e foco visível estão presentes. Ainda faltam prova de anúncio de save/conflito/toast em live region, contraste computado e validação a 200%.

**Jordan (First-Timer):** a destilação devolveu rótulos a “Em espera”, “Recentes” e “Atalhos”. Terminal pode continuar parecendo uma escolha de autoridade; a frase “não altera permissões” deve permanecer junto da seleção.

## Minor Observations

- Favorito indisponível corretamente permanece no slot, reduzindo surpresa espacial.
- A ausência de “Imprimir” no sucesso é coerente com `orderPrinting = COMING_SOON`.
- O rail tem área silenciosa suficiente no desktop; não deve ser preenchido com métricas ou atalhos adicionais.
- Imagem única do X-Bacon dá reconhecimento sem transformar todo card em catálogo fotográfico obrigatório.

## Questions to Consider

- O piso tipográfico continuará legível a um braço de distância num tablet de balcão?
- A loja deve permitir que qualquer operador retome drafts da loja ou isso precisa ser configurável por política?
- No primeiro conflito CAS real, “carregar versão mais recente” preservará uma cópia local para comparação?

Questions skipped: replaced by the user-mandated approval gate.
