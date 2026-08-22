---
target: PedidoLocal — PDV / Novo Pedido V1
total_score: 30
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 1
timestamp: 2026-08-21T13-58-45Z
slug: public-prototypes-pos-v1-index-html
---

⚠️ DEGRADED: single-context (sub-agents were not authorized for this execution)

# Design Health Score

| #         | Heurística                       |      Nota | Questão principal                                                                                     |
| --------- | -------------------------------- | --------: | ----------------------------------------------------------------------------------------------------- |
| 1         | Visibilidade do estado           |       3/4 | Seleções, cotação e sucesso são claros; loading, requote e offline ainda não aparecem.                |
| 2         | Correspondência com o mundo real |       4/4 | Balcão, comanda, mesa e “receber agora/depois” falam a língua da operação.                            |
| 3         | Controle e liberdade             |       3/4 | Voltar, editar e limpar estão visíveis; limpar uma comanda cheia ainda precisa confirmação/undo.      |
| 4         | Consistência e padrões           |       4/4 | PDV, entrega, mesa, pagamento e KDS compartilham vocabulário e sistema visual.                        |
| 5         | Prevenção de erros               |       3/4 | Métodos válidos, produto esgotado e endereço confirmado previnem erros; faltam estados stale/offline. |
| 6         | Reconhecimento em vez de memória |       4/4 | Destino, produtos, opções e total permanecem reconhecíveis e próximos da decisão.                     |
| 7         | Flexibilidade e eficiência       |       2/4 | Busca local, quick add e F2 aceleram; faltam favoritos/recentes e mais atalhos de teclado.            |
| 8         | Estética e minimalismo           |       4/4 | A bancada é densa sem parecer ERP; Pimenta fica reservada à ação principal.                           |
| 9         | Diagnóstico e recuperação        |       1/4 | O protótipo não prova recuperação de requote, produto esgotado durante a criação ou queda de rede.    |
| 10        | Ajuda e documentação             |       2/4 | Microcopy contextual existe, mas não há ajuda para casos de exceção.                                  |
| **Total** |                                  | **30/40** | **Boa; direção forte, recuperação operacional precisa fechar na implementação.**                      |

# Design Specificity Verdict

**Especificidade 9/10.** A interface é reconhecivelmente PedidoLocal: Papel/Tinta/Pimenta, comanda fixa, preços em Space Mono, linguagem de balcão e destino promovido antes do catálogo. A forma não é intercambiável com um ERP genérico.

O detector CLI foi executado uma única vez após o último ajuste visual. Ele entrou em modo degradado porque os módulos de parser não estão instalados e retornou zero ocorrências por regex; isso é subcontagem, não certificado de ausência. A inspeção navegável em localhost confirmou os nove enquadramentos, ausência de overflow horizontal, busca local “x ba” com um resultado e continuidade do configurador sobre o próprio PDV. A API do navegador é somente leitura para `evaluate`, portanto não houve overlay mutável confiável.

# Overall Impression

O pedido simples é rápido: destino, produto e total ficam no mesmo campo de visão; dados condicionais só aparecem quando necessários. A maior oportunidade é tratar a falha como parte da bancada, não como exceção técnica: requote, indisponibilidade e rede devem preservar a comanda e oferecer recuperação em uma frase.

# What's Working

1. A comanda fixa elimina a ponte de memória entre catálogo e revisão.
2. Entrega e mesa usam etapas curtas, com cliente/endereço e sessão apenas quando o destino exige.
3. A tela de pagamento separa método de momento do recebimento e explica a autoridade da confirmação manual.

# Priority Issues

## [P1] Recuperação operacional não está demonstrada

O happy path não mostra preço alterado, item esgotado, endereço não atendido, perda de conexão ou ausência de permissão para “Recebido agora”. Na implementação, cada caso deve manter a comanda, destacar somente o que mudou e oferecer “Revisar item”, “Alterar endereço”, “Mudar para retirada” ou “Tentar novamente”.

Comandos sugeridos: `$impeccable harden`, `$impeccable clarify`.

## [P2] O caminho do atendente experiente ainda pode ser mais curto

F2 e quick add ajudam, mas não há produtos recentes/favoritos nem atalho para finalizar. Na implementação, manter busca local, adicionar foco por teclado documentado e medir antes de incluir mais aceleradores; não poluir a V1 com uma camada de personalização.

Comandos sugeridos: `$impeccable optimize`, `$impeccable polish`.

# Cognitive Load and Emotional Journey

Carga cognitiva baixa: sete dos oito critérios passam; a única tensão é a faixa de cinco categorias, que continua agrupada e rolável. O pico de risco — pagamento — tem uma ação principal e explicação auditável. O final confirma número, origem, status e ator, criando um encerramento forte sem estatísticas ou celebração decorativa.

# Persona Red Flags

- **Alex, atendente experiente:** conclui rápido com quick add e F2, mas ainda não tem atalho para finalizar ou produtos recentes.
- **Sam, teclado/leitor de tela:** headings, grupos, labels e foco base estão presentes; a implementação precisa trap de foco/Escape no dialog, anúncio de quote/loading e mensagens ligadas aos campos.
- **Riley, edge cases:** encontrará as lacunas de requote, rede e concorrência; os estados devem preservar o carrinho e nunca mostrar sucesso antes do commit.

# Minor Observations

- “Limpar pedido” deve pedir confirmação somente quando houver itens.
- O fallback mobile é seguro, mas permanece secundário; o CTA inferior está na zona do polegar.
- “Pix manual” precisa aparecer apenas quando a configuração e o workflow permitirem, nunca como sinônimo de Mercado Pago.

# Questions to Consider

- A equipe prefere um atalho de teclado explícito para finalizar ou o ganho de velocidade virá principalmente de busca e quick add?
- Quando um preço mudar, o operador deve confirmar a nova cotação em um banner único antes de criar?

Questions skipped: only 2 Priority Issues were identified; the product approval gate is the required closing question for this phase.
