---
target: Combos e Promoções V1
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-21T00-58-40Z
slug: public-prototypes-combos-promotions-index-html
---
# Design Health Score

| # | Heurística | Score | Questão principal |
|---|---|---:|---|
| 1 | Visibilidade do estado | 2/4 | Estados principais aparecem, mas o fluxo não especifica loading e falha. |
| 2 | Sistema e mundo real | 3/4 | Linguagem de cardápio é natural; timezone técnica foi um ruído. |
| 3 | Controle e liberdade | 2/4 | Há voltar/cancelar/editar; remoção mobile estava escondida. |
| 4 | Consistência e padrões | 3/4 | Sistema visual forte; salvar/rascunho e ações de produto divergiam. |
| 5 | Prevenção de erros | 2/4 | Preço tinha guardrail; agenda e conflitos não. |
| 6 | Reconhecimento, não memória | 2/4 | Preview preserva contexto; sidebar tablet perde rótulos visuais. |
| 7 | Flexibilidade e eficiência | 1/4 | Sem atalhos, duplicação ou ações em lote. |
| 8 | Estética e minimalismo | 3/4 | Foco e hierarquia bons, com microtexto excessivo. |
| 9 | Diagnóstico e recuperação | 1/4 | Happy path dominante; poucos erros têm recuperação desenhada. |
| 10 | Ajuda e documentação | 2/4 | Microcopy ajuda, mas falta contexto para conflito e publicação. |
| **Total** |  | **21/40** | **Aceitável; fundação visual sólida, estados ainda incompletos.** |

# Design Specificity Verdict

**Especificidade 7/10.** Vitrine e editor são claramente PedidoLocal: Papel/Tinta/Pimenta/Kraft, fotografia quente, Bricolage, preços em Space Mono e uma prévia que lembra comanda. A economia é um fato verificável, não publicidade. A listagem desktop ainda é a superfície mais intercambiável com outros SaaS de restaurante.

O detector CLI rodou uma vez e ficou em modo degradado por ausência de `htmlparser2`, `css-select`, `css-tree` e `domutils`. Reportou 124 findings em `styles.css`: 3 warnings + 121 advisories. Os warnings `side-tab`, `border-accent-on-rounded` e `overused-font` são falsos positivos contextuais. O sinal útil foi 74 declarações entre 8–13 px, coerente com a observação visual de microtexto. Não houve overlay confiável: o navegador bloqueou `file://` por política e localhost com `ERR_BLOCKED_BY_CLIENT`; quatro screenshots Playwright reais foram usadas como fallback.

# Overall Impression

A taxonomia da V1, a matemática da economia e a conexão merchant/storefront estão resolvidas. A maior oportunidade é fazer o final operacional transmitir tanta confiança quanto o carrinho transmite ao cliente.

# What's Working

1. Economia verificável do dashboard ao carrinho, incluindo adicional fora do desconto.
2. Separação inequívoca entre Combo, Promoção de produto e Cupom.
3. Identidade calorosa de comércio local sem perder legibilidade operacional.

# Priority Issues

## [P1] Salvar, rascunhar e publicar não formavam um contrato

O lojista não sabia se a oferta já estava vendendo. Fix aplicado no distill: drafts saíram da V1 e o CTA virou **Publicar combo/promoção**, com confirmação de publicação.

Comandos: `$impeccable clarify`, `$impeccable harden`.

## [P1] Piso de acessibilidade insuficiente

Textos essenciais de 8–10 px, alvos de 30–40 px e foco incompleto prejudicavam baixa visão, teclado e toque. Fix parcial aplicado: textos críticos mobile e alvos subiram, foco visível foi generalizado e toast ganhou `role=status`. Contraste e auditoria completa ficam para a implementação.

Comandos: `$impeccable audit`, `$impeccable typeset`, `$impeccable adapt`.

## [P1] Editor mobile escondia a remoção de componente

`.remove-button` desaparecia abaixo de 540 px, retirando a recuperação de um erro comum. Fix aplicado: remover permanece visível com alvo de 44 px.

Comandos: `$impeccable adapt`, `$impeccable harden`.

## [P2] Agenda expunha complexidade sem guardrails

Datas/horas livres, timezone técnica e ausência de conflito aumentavam erro. Fix visual aplicado: date/time controls e copy “horário de Fortaleza”. Validação de intervalos, DST e sobreposição fica explicitamente no gate de implementação.

Comandos: `$impeccable distill`, `$impeccable harden`.

## [P2] Estados críticos estão fora do protótipo happy-path

Vazio, erro de salvar, produto esgotado, oferta expirada e requote precisam de matriz de estados na Fase 2. A proposta técnica define a reação de domínio; UI final deve desenhar esses estados antes do rollout.

Comandos: `$impeccable harden`, `$impeccable onboard`.

# Persona Red Flags

- **Alex, lojista experiente:** sem duplicação/ações em lote; aceitável na V1, mas deve ser observado quando lojas acumularem ofertas.
- **Sam, teclado/leitor de tela:** microtexto e foco eram os maiores problemas; o distill corrige parte, mas implementação exige WCAG, labels e anúncios de requote.
- **Jordan, primeira viagem:** entendeu Combo versus Promoção, mas salvar/rascunho confundia. A publicação direta remove essa ambiguidade.
- **Casey, cliente mobile distraído:** CTA inferior e economia funcionam; “Continuar” era vago e virou “Ir para entrega”.
- **Riley, edge cases:** conflitos, preços sem economia, indisponibilidade e transições de agenda precisam de testes server-side descritos no gate.

# Minor Observations

- O `+` ambíguo da promoção virou “Ver”.
- O skeleton decorativo foi substituído por produto normal.
- A busca prematura saiu da lista de três ofertas.
- Pimenta ainda aparece em alguns elementos editoriais; acompanhar contraste e semântica na implementação.
- Nomes longos e dez componentes precisam de teste visual.

# Questions to Consider

- Publicação direta continua sendo a escolha certa ou a operação real exige drafts em uma versão futura?
- Ofertas fora do horário devem desaparecer ou servir como antecipação sem CTA?
- Em lojas com muitas ofertas, duplicar e pausar em lote deve entrar antes de analytics?
