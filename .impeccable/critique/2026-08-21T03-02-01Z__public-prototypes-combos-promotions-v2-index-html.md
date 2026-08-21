---
target: Combos e Promoções V2
total_score: 30
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 2
timestamp: 2026-08-21T03-02-01Z
slug: public-prototypes-combos-promotions-v2-index-html
---

⚠️ DEGRADED: single-context (sub-agents não foram autorizados nesta tarefa)

# Design Health Score

| #         | Heurística                  |     Score | Questão principal                                                                                                             |
| --------- | --------------------------- | --------: | ----------------------------------------------------------------------------------------------------------------------------- |
| 1         | Visibilidade do estado      |       3/4 | Agenda, status, economia e escolhas aparecem; loading, conflito e limite esgotado ainda não estão prototipados.               |
| 2         | Sistema e mundo real        |       4/4 | “Monte seu combo”, “3 por R$ 15” e “frete grátis” falam como o lojista e o cliente.                                           |
| 3         | Controle e liberdade        |       3/4 | Voltar, cancelar e editar estão visíveis; falta desfazer uma publicação ou alteração.                                         |
| 4         | Consistência e padrões      |       4/4 | Dashboard, vitrine, configurador e carrinho compartilham hierarquia, vocabulário e semântica visual.                          |
| 5         | Prevenção de erros          |       3/4 | Prévia, defaults e grupos obrigatórios previnem erros comuns; conflitos entre mecânicas ainda não são explicados no cadastro. |
| 6         | Reconhecimento, não memória |       3/4 | Mecânica, benefício, agenda e escolhas permanecem visíveis; o seletor inicial das sete mecânicas não foi demonstrado.         |
| 7         | Flexibilidade e eficiência  |       2/4 | Busca e filtros ajudam; não há duplicação, ações em lote nem caminho rápido para lojista frequente.                           |
| 8         | Estética e minimalismo      |       4/4 | A composição é limpa, específica e contém densidade sem ruído decorativo.                                                     |
| 9         | Diagnóstico e recuperação   |       2/4 | Requote é explicado, mas os estados de erro e a recuperação não foram desenhados.                                             |
| 10        | Ajuda e documentação        |       2/4 | A microcopy é contextual; falta ajuda para stacking, limites e publicação.                                                    |
| **Total** |                             | **30/40** | **Boa; direção clara, estados críticos e seleção de mecânica precisam fechar antes da produção.**                             |

# Design Specificity Verdict

**Especificidade 9/10.** A extensão preserva o “Balcão Digital do Bairro”: Papel/Tinta/Pimenta, preços em Space Mono, lista operacional, prévia em forma de comanda e linguagem de pequeno estabelecimento. Os dados de oferta são concretos e a vantagem é demonstrada no carrinho, não tratada como marketing genérico.

O detector CLI foi executado depois da avaliação visual e retornou zero ocorrências em modo degradado porque `htmlparser2`, `css-select`, `css-tree` e `domutils` não estão disponíveis. O resultado é subcontagem, não certificado de ausência de problemas. A inspeção navegável em localhost confirmou headings, ações, dois grupos, quatro escolhas, duas escolhas selecionadas e quatro ajustes no carrinho. A injeção de overlay foi pulada porque a API de avaliação do navegador é somente leitura; cinco screenshots Playwright em dimensões reais foram o sinal visual principal.

# Overall Impression

A V2 ficou compreensível sem revelar o engine. A maior oportunidade é transformar as sete mecânicas em cinco intenções humanas na entrada e desenhar explicitamente o que acontece quando uma oferta conflita, expira ou esgota durante o checkout.

# What's Working

1. A lista unificada permite comparar benefício, agenda, uso e status sem transformar a tela em BI.
2. O combo flexível mantém uma decisão por grupo, preço atualizado e ação fixa no alcance do polegar.
3. O carrinho explica combo, BOGO, frete e cupom separadamente, com equação ilustrativa consistente.

# Priority Issues

## [P1] O seletor inicial das mecânicas ainda não foi provado

“Nova oferta” abre o combo flexível diretamente. A implementação precisa de uma etapa curta com cinco intenções: criar combo; desconto em produto; vender quantidade por preço/leve X pague Y; desconto acima de valor; frete grátis. Subtipos aparecem somente depois da intenção escolhida.

Comandos: `$impeccable shape`, `$impeccable clarify`.

## [P1] Estados de conflito e esgotamento não têm recuperação desenhada

O happy path não mostra oferta incompatível, último uso disputado, produto indisponível, agenda expirada ou requote. Cada estado precisa dizer o que mudou, preservar o carrinho e oferecer revisar/remover — sem “algo deu errado”.

Comandos: `$impeccable harden`, `$impeccable onboard`.

## [P2] A base do limite precisa aparecer onde decide o benefício

“Acima de R$ 35 após as ofertas” é correto, porém o cadastro e a vitrine ainda não explicam que delivery e cupom ficam fora da base. Uma frase curta e o progresso “R$ 38,90 de R$ 35,00” removem suporte futuro.

Comandos: `$impeccable clarify`.

## [P2] Métricas precisam nomear a definição financeira

“Vendas de R$ 3.904” é ambíguo. Usar “valor dos pedidos concluídos” ou “subtotal de mercadorias” conforme a query, com período e timezone visíveis.

Comandos: `$impeccable clarify`, `$impeccable distill`.

## [P2] Limite de usos não aparece na prévia operacional

O formulário captura 100 usos, mas a prévia não informa restante, reserva ou comportamento no último uso. O merchant precisa ver “100 usos totais · 31 consumidos · 2 reservados” no detalhe, sem expor concorrência técnica.

Comandos: `$impeccable harden`.

# Persona Red Flags

- **Alex, lojista experiente:** busca e filtros funcionam, mas faltam duplicação e ações em lote; o seletor inicial não deve obrigá-lo a reaprender detalhes a cada oferta.
- **Sam, teclado/leitor de tela:** a semântica base é boa e o foco é visível, porém filtros precisam anunciar estado, toast precisa preservar `role=status` e erros devem ligar mensagem/campo.
- **Jordan, primeira oferta:** entende os rótulos concretos, mas não viu ainda a decisão entre “quantidade por preço” e “leve X, pague Y”.
- **Casey, cliente mobile distraído:** escolhas únicas e ação inferior funcionam; interrupção, requote e produto esgotado precisam preservar progresso.
- **Riley, edge cases:** vai encontrar limites, conflitos, escolhas sem opção válida e alteração de preço sem uma matriz de recuperação.

# Minor Observations

- O dashboard usa quatro cores apenas com significado semântico, sem decoração gratuita.
- O hero da vitrine privilegia o combo e deixa outras ofertas abaixo da dobra; aceitável se ordenação merchant for explícita.
- A barra fixa do carrinho deve permanecer opaca para não misturar o total persistente com conteúdo rolado.
- Valores e dados do protótipo estão identificados como ilustrativos no desktop; repetir a indicação em eventual demo pública.

# Questions to Consider

- A entrada por cinco intenções continua simples quando “quantidade por preço” revela dois subtipos?
- O merchant deve poder duplicar uma oferta antes de ações em lote?
- O progresso do frete deve usar valor pós-ofertas para manter a promessa idêntica ao servidor?
