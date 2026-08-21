# Impeccable Audit — PDV V1

Data: 2026-08-21  
Superfície: `/dashboard/pos`, integrações de Central e KDS  
Qualidade-alvo: V1 de produção, operação rápida em tablet/desktop e fallback mobile seguro.

## Implementation Integrity Verdict

**PASS.** A implementação expressa o sistema específico do PedidoLocal: tokens Papel/Tinta/Pimenta/Kraft, workspace de operação, quote e pedido canônicos, modalidades reais, comanda persistente e estados operacionais. O detector encontrou oito avisos de escala tipográfica: sete já existentes no shell compartilhado e um no badge novo de origem PDV. Não encontrou atalhos sistêmicos na superfície nova.

## Audit Health Score — antes dos passes de polish/harden

| #         | Dimensão       | Nota            | Achado principal                                                                           |
| --------- | -------------- | --------------- | ------------------------------------------------------------------------------------------ |
| 1         | Acessibilidade | 3/4             | estados dinâmicos e grupos de recebimento precisavam de anúncio/associação mais explícitos |
| 2         | Performance    | 3/4             | quote tinha resets síncronos em effects e catálogo inteiro é renderizado de uma vez        |
| 3         | Responsividade | 4/4             | split em XL, fluxo único abaixo disso e alvos de toque de 44px ou mais                     |
| 4         | Theming        | 3/4             | tokens consistentes; um tamanho literal novo estava fora da escala                         |
| 5         | Integridade    | 3/4             | sistema coerente; faltavam alguns estados de recuperação explícitos                        |
| **Total** |                | **16/20 — Bom** | corrigir achados P2/P3 antes da entrega                                                    |

## Resumo executivo

- P0: 0
- P1: 0
- P2: 4
- P3: 2
- Evidência visual: protótipo aprovado e screenshots em 390, 1024, 1180 e 1440 px.
- Limitação intencional: a rota real não foi aberta contra banco porque a migration desta entrega não foi aplicada.

## Achados

### [P2] Falha de lookup confundida com cliente inexistente

- Local: `PosWorkspace.lookupCustomer`.
- Categoria: integridade/acessibilidade.
- Impacto: permissão, validação ou falha de servidor poderia orientar a equipe a criar cadastro duplicado.
- Recomendação: separar `not-found` de `error` e anunciar a mensagem.
- Comando: `$impeccable harden`.

### [P2] Ausência de métodos de pagamento sem explicação

- Local: rail de pagamento.
- Categoria: integridade.
- Impacto: ação final ficava desabilitada sem explicar a configuração ausente.
- Recomendação: adicionar estado vazio contextual.
- Comando: `$impeccable clarify`.

### [P2] Troco inválido dependia apenas da rejeição no servidor

- Local: valor recebido.
- Categoria: integridade/acessibilidade.
- Impacto: roundtrip evitável durante atendimento e feedback tardio.
- Recomendação: mostrar total/troco e desabilitar confirmação quando menor que o total.
- Comando: `$impeccable harden`.

### [P2] Reset síncrono de estado em effects

- Local: diálogos, seleção de pagamento e quote.
- Categoria: performance.
- Impacto: renders encadeados e alerta determinístico do lint React.
- Recomendação: remount por intenção, estado efetivo derivado e debounce cancelável.
- Comando: `$impeccable optimize`.

### [P3] Atualização de quote sem live region

- Local: totais da comanda.
- Categoria: acessibilidade, WCAG 4.1.3.
- Impacto: tecnologia assistiva não recebia confirmação do novo total.
- Recomendação: live region curta e não intrusiva.
- Comando: `$impeccable polish`.

### [P3] Badge PDV fora da escala tipográfica

- Local: `OrderCard`.
- Categoria: theming/integridade.
- Impacto: drift pequeno do sistema documentado.
- Recomendação: usar `text-xs`.
- Comando: `$impeccable polish`.

## Padrões e pontos positivos

- Nenhum hard-coded color novo; a superfície usa tokens semânticos.
- Modalidades usam semântica de radiogroup, diálogos Radix gerenciam foco e os controles principais têm alvos de toque adequados.
- Layout evita largura fixa em mobile, mantém comanda sticky em desktop e CTA fixo em telas menores.
- Busca é memoizada e quote tem debounce/cancelamento.
- Produto indisponível, carrinho vazio, loja bloqueada, loja fechada ao público, loading, erro e sucesso já estavam representados.

## Ações executadas após o snapshot

1. `$impeccable harden`: separação de erros, matriz de pagamento, troco, idempotência e estados vazios.
2. `$impeccable optimize`: remoção dos resets síncronos e proteção contra quote obsoleta.
3. `$impeccable polish`: live regions, nomes de grupos, token tipográfico e cópia contextual.

O detector não deve ser repetido no mesmo ciclo; a verificação final usa lint, typecheck, testes e inspeção do diff.
