---
target: Fidelidade V2 — fluxo de benefícios do lojista ao cliente
total_score: 24
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 2
timestamp: 2026-09-01T19-36-59Z
slug: atures-loyalty-components-loyalty-program-form-tsx
---
Method: dual-agent (A: /root/impeccable_assessment_a · B: /root/impeccable_assessment_b)

# Crítica de design — Fidelidade V2

Alvo principal: `src/features/loyalty/components/loyalty-program-form.tsx`, considerando as superfícies conectadas de dashboard, checkout, página de fidelidade do cliente e menu “Mais”.

## Design Health Score

| # | Heurística | Nota | Problema principal |
|---|---|---:|---|
| 1 | Visibilidade do estado | 3 | Preview e save são claros, mas estado publicado e alterações pendentes se confundem. |
| 2 | Correspondência com o mundo real | 3 | A linguagem do cliente é concreta; versionamento e métricas ainda soam operacionais. |
| 3 | Controle e liberdade | 2 | Não há desfazer/restaurar nem saída explícita antes de publicar uma nova versão. |
| 4 | Consistência e padrões | 3 | Controles e tokens são consistentes; a hierarquia do cliente pode produzir dois títulos principais. |
| 5 | Prevenção de erros | 2 | Limites existem no schema, mas não são traduzidos preventivamente na UI. |
| 6 | Reconhecimento em vez de lembrança | 2 | Preview e recomendação ajudam; templates opacos exigem comparação mental. |
| 7 | Flexibilidade e eficiência | 2 | Templates aceleram, mas não deixam claro o que substituem; a lista de benefícios não escala. |
| 8 | Estética e minimalismo | 3 | Superfícies limpas; cinco métricas e um formulário longo atrasam a tarefa principal. |
| 9 | Recuperação de erros | 2 | O erro aparece agregado no rodapé, sem vínculo, foco ou instrução junto ao campo. |
| 10 | Ajuda e documentação | 2 | Há hints e “Como funciona”; falta explicar templates e o impacto do versionamento junto ao save. |
| **Total** |  | **24/40** | **Aceitável — base sólida, mas decisões críticas ainda exigem cuidado excessivo.** |

## Veredito de especificidade

**Parcialmente específica.** O storefront parece Pedeza: respeita os tokens white-label, usa o nome da loja, transforma progresso em cartela e cria um pico emocional em “Você ganhou!”. O dashboard, porém, ainda é intercambiável com um SaaS genérico de fidelidade: cinco cards métricos, formulário em card e presets nomeados sem explicar a promessa.

**Avaliação independente:** a oportunidade central é fazer a sofisticação interna — versionamento, recomendação e múltiplos benefícios — aparecer externamente como decisões simples e seguras, não como mais controles.

**Detector determinístico:** 0 violações no alvo principal (`detect.mjs --json` retornou `[]`, sem falsos positivos). Isso confirma que não há anti-patterns sintáticos cobertos pelo detector, mas não invalida problemas de estado, validação, linguagem ou coerência entre superfícies.

**Evidência visual:** não há overlay confiável visível. A superfície não renderizou por erro `PrismaClientKnownRequestError`/`EACCES` de acesso ao banco; o fallback foi leitura do código, DOM/login, screenshot e logs. Contraste, densidade, responsividade e foco visual não foram pontuados como fatos observados.

## Impressão geral

A feature comunica valor melhor no lado do cliente do que no lado do lojista. Recompensa, validade, economia e recomendação são concretas; configurar ou alterar a promessa ainda parece simples demais no momento errado e complexo demais ao longo do formulário. A maior melhoria é tornar “o que está publicado, o que mudou e o que acontecerá ao salvar” impossível de interpretar errado.

## O que funciona

1. **Continuidade da promessa.** Preview, página do cliente, resumo em “Mais” e checkout usam a mesma linguagem de benefício, mínimo e expiração.
2. **Storefront realmente white-label.** Cores e superfícies usam tokens da loja sem apagar a personalidade do Pedeza.
3. **Estados de recompensa acionáveis.** “Você ganhou!”, economia estimada e “Melhor para este pedido” traduzem regras sofisticadas em decisões compreensíveis.

## Problemas prioritários

### [P1] Estado publicado e edição parecem a mesma coisa

**Por que importa:** o checkbox muda imediatamente de “Ativa” para “Inativa”, embora a alteração só persista ao salvar. Sem “alterações não salvas”, restauração ou resumo do impacto, o lojista pode sair acreditando que alterou a promessa ou publicar uma nova versão sem perceber.

**Correção:** separar visualmente “programa publicado” de “edição”; marcar alterações pendentes; aproximar a explicação de versionamento do CTA; oferecer restaurar e uma confirmação contextual ao desativar/trocar um programa ativo.

**Comando sugerido:** `$impeccable clarify` seguido de `$impeccable harden`.

### [P1] A validação chega tarde e não aponta o campo

**Por que importa:** o schema e o serviço preservam detalhes específicos, mas o formulário mostra apenas `result.error.message` no rodapé. Os inputs não recebem `aria-invalid`, mensagem associada ou foco; entradas inválidas podem virar zero no preview. O preset “Mimo da casa” ainda pode escolher um produto marcado como esgotado.

**Correção:** mapear erros do servidor por campo, validar inline, focar o primeiro erro, preservar a entrada digitada, mostrar limites e fazer o preset selecionar apenas produto elegível ou pedir escolha explícita.

**Comando sugerido:** `$impeccable harden`.

### [P2] Templates aumentam comparação mental

**Por que importa:** “Simples”, “Mimo da casa” e “Cliente frequente” não mostram seus parâmetros nem estado aplicado. Cada botão altera apenas parte do formulário e preserva valores anteriores, produzindo combinações híbridas silenciosas.

**Correção:** mostrar o resumo completo de cada estratégia (“5 pedidos · R$ 10 · 30 dias”), destacar a recomendada, indicar o preset ativo e declarar se “Aplicar” substitui toda a configuração ou somente alguns campos.

**Comando sugerido:** `$impeccable distill`.

### [P2] A seleção de benefício chega cedo, cresce sem limite e explica o cupom tarde

**Por que importa:** todos os benefícios aparecem na etapa “Identificação”, antes da revisão do pedido. Com muitas recompensas, a lista cresce; com cupom, os radios ficam indisponíveis antes que leitores de tela recebam o motivo, pois a explicação não está associada via `aria-describedby`.

**Correção:** mover a decisão para revisão/resumo; exibir primeiro a recomendação e recolher alternativas; associar o motivo de indisponibilidade aos controles e oferecer uma ação direta para trocar cupom por fidelidade.

**Comando sugerido:** `$impeccable layout` seguido de `$impeccable audit`.

### [P2] O dashboard prioriza métricas e uma delas é ambígua

**Por que importa:** cinco cards aparecem antes da configuração no mobile. “Usados por tipo: R$ 4 · % 2” usa símbolos de dinheiro e percentual para contagens, podendo ser lido como valor concedido.

**Correção:** colocar status/configuração antes da análise, agrupar métricas secundárias e renomear para “Resgates por tipo: desconto em reais 4 · percentual 2 · produto grátis 1”.

**Comando sugerido:** `$impeccable distill`.

## Alertas por persona

- **Jordan, lojista estreante:** não sabe o que cada template aplicará, pode confundir o checkbox local com estado publicado e recebe uma mensagem agregada quando erra.
- **Sam, usuário de tecnologia assistiva:** o preview inteiro em `aria-live="polite"` pode ser anunciado a cada tecla; erros não são ligados aos inputs; radios desabilitados por cupom não recebem a explicação programaticamente; a página pode renderizar dois `h1` quando há prêmio e progresso.
- **Casey, cliente mobile distraído:** a etapa “Identificação” cresce com todos os benefícios e o conflito com cupom força mudança de contexto; em compensação, CTAs largos, economia visível e o resumo em “Mais” sustentam a continuidade.

## Observações menores

- O resumo em “Mais” é uma boa peça de continuidade: contagem, promessa e validade cabem numa linha.
- A cartela limita a grade a 10 colunas, mas pode renderizar 20 círculos; duas linhas podem parecer dois ciclos sem rótulo.
- Com programa inativo e benefícios existentes, falta dizer claramente que novos pedidos deixaram de acumular.
- “Confirmar meu acesso” aponta para `/orders`; o texto pode parecer navegação para histórico, não autenticação.
- O caso “produto esgotado” precisa de decisão de negócio: impedir a seleção é seguro, mas estoque temporário pode justificar apenas um aviso explícito.

## Perguntas para reflexão

- Templates são estratégias completas ou atalhos parciais? A interface precisa assumir uma dessas possibilidades sem ambiguidade.
- Ativar uma promessa recorrente deveria parecer tão leve quanto marcar um checkbox?
- Se uma recompensa é a melhor para o pedido, por que todas precisam competir imediatamente com ela?
- Como a fidelidade pode soar mais como reconhecimento de um vizinho frequente e menos como mecanismo genérico de retenção?
