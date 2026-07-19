---
target: "painel administrativo completo do tenant: shell do /dashboard, navegação e todas as subpáginas operacionais"
total_score: 26
p0_count: 0
p1_count: 3
timestamp: 2026-07-19T02-07-54Z
slug: src-app-dashboard
---
Method: dual-agent (A: critique_dashboard_design_fast · B: critique_dashboard_evidence)

## Design Health Score

| # | Heurística | Nota | Principal problema |
|---|---|---:|---|
| 1 | Visibilidade do estado do sistema | 3 | O painel comunica loading, conexão e resultados, mas as métricas mudam junto com o filtro sem explicar o novo universo. |
| 2 | Correspondência com o mundo real | 3 | A maior parte da linguagem é natural, porém `slug`, ordem numérica e min/max expõem o modelo interno. |
| 3 | Controle e liberdade | 3 | Há retorno, fechamento e confirmações destrutivas, mas transições operacionais importantes não oferecem desfazer. |
| 4 | Consistência e padrões | 2 | Componentes são coerentes, mas cores de status/ação, capitalização e títulos divergem em pontos importantes. |
| 5 | Prevenção de erros | 3 | Exclusões e cancelamentos são protegidos; concluir pedido e regras contraditórias de adicionais ainda dependem de correção posterior. |
| 6 | Reconhecimento em vez de memorização | 2 | A navegação é explícita, mas ordenação numérica e regras de adicionais exigem conhecimento prévio. |
| 7 | Flexibilidade e eficiência | 3 | A operação básica é direta, porém faltam busca, agrupamento por etapa e caminhos rápidos para filas grandes. |
| 8 | Estética e design minimalista | 2 | A interface é contida, mas repete cards, wrappers e cabeçalhos, tornando áreas operacionais mais genéricas e longas. |
| 9 | Recuperação de erros | 3 | Existem mensagens e confirmações, mas faltam erros por campo, foco na correção, histórico e undo. |
| 10 | Ajuda e documentação | 2 | Empty states ajudam, mas adicionais, Pix, slug e ordenação não têm orientação contextual suficiente. |
| **Total** |  | **26/40** | **Aceitável — base sólida, melhorias operacionais significativas ainda necessárias** |

## Veredito de anti-patterns

**Avaliação humana:** o risco de aparência produzida por IA é baixo a moderado. O painel evita gradientes, glassmorphism, raios excessivos e decoração gratuita. Entretanto, ainda se aproxima de um admin CRUD genérico pela repetição de `Card > CardHeader > CardTitle > CardContent`, grades de atalhos muito semelhantes e pouca manifestação concreta do conceito “Balcão Digital do Bairro”. O problema não é excesso visual; é uma arquitetura visual competente, porém pouco específica para a rotina de um estabelecimento.

**Detector determinístico:** a varredura de `src/app/(dashboard)` concluiu com exit code 0 e retornou `[]`: zero regras, arquivos ou linhas sinalizadas. Não houve falsos positivos. Esse resultado confirma a ausência dos anti-patterns sintáticos conhecidos, mas não comprova usabilidade, contraste computado, foco, comportamento responsivo ou adequação da operação.

**Overlays visuais:** nenhum overlay confiável foi produzido. A automação nativa do navegador encontrou um helper já ocupado e continuou indisponível após a tentativa de recuperação. Não houve nova aba controlável, screenshots, inspeção em 320 px, injeção de `detect.js` ou logs `impeccable`. O fallback foi HTTP 200 em `/login` e inspeção estrutural do código.

## Impressão geral

O shell é previsível, responsivo e mais maduro que a média de painéis pequenos. Ele transmite segurança na configuração, mas perde força exatamente no pico operacional: a fila de pedidos é plana, as métricas não deixam claro quando refletem um filtro e ações de avanço têm baixa recuperabilidade. A maior oportunidade é transformar o painel de um conjunto organizado de CRUDs em uma ferramenta orientada ao turno — com verdade operacional, prioridade e recuperação rápida de erros.

## O que funciona

- O shell estabelece cinco destinos estáveis, destaca a rota atual com `aria-current`, preserva sidebar no desktop e usa drawer no mobile. A loja, seu status e o acesso à vitrine permanecem contextualizados.
- O vocabulário de estados é robusto: skeletons, estados de loading, mensagens de falha, empty states acionáveis, conexão em tempo real e suporte a movimento reduzido.
- A paleta é restrita e semântica, os controles têm alvos táteis adequados e preços/números de pedido ganham leitura rápida com tipografia monoespaçada.

## Problemas prioritários

### [P1] As métricas deixam de representar “hoje” quando a fila é filtrada

**Por que importa:** `OrdersPanel` passa a mesma coleção retornada pelo filtro para `DailyMetrics`. Ao selecionar “Concluídos” ou “Cancelados”, “Pedidos hoje”, “Faturamento hoje” e “Em andamento” tornam-se um recorte, mas os rótulos continuam afirmando que resumem o dia. Isso pode induzir uma decisão operacional ou financeira errada.

**Correção:** consultar/calcular o resumo diário independentemente da lista filtrada ou renomear explicitamente o bloco para “Neste filtro”, mostrando também o filtro ativo. O resumo principal deve permanecer estável enquanto o operador explora a fila.

**Comando sugerido:** `$impeccable harden painel de pedidos`

### [P1] Transições de pedido importantes não são recuperáveis

**Por que importa:** aceitar, iniciar preparo, despachar e concluir alteram imediatamente o estado. Em um celular durante o pico, um toque acidental pode remover o pedido do filtro/modal e não há undo nem trilha curta para recuperar contexto.

**Correção:** usar confirmação somente nas etapas finais ou de maior consequência; depois da transição, manter feedback persistente com “Desfazer” por alguns segundos e mostrar histórico curto no detalhe do pedido. Não transformar toda ação em modal.

**Comando sugerido:** `$impeccable harden fluxo de status dos pedidos`

### [P1] A fila não escala para a operação real

**Por que importa:** cards equivalentes em uma grade exigem caça visual conforme o volume cresce. Faltam agrupamento por etapa/urgência, filtro “Em andamento” e busca. O modal cobre o contexto no desktop, reduzindo comparação e ritmo.

**Correção:** organizar a fila por estado operacional e tempo de espera; acrescentar busca e “Em andamento”; manter um painel lateral de detalhes no desktop e dialog no mobile. Destacar atraso e próxima ação, não somente o status atual.

**Comando sugerido:** `$impeccable shape central de pedidos`

### [P2] Configurações expõem conceitos técnicos ao lojista

**Por que importa:** `slug`, `sortOrder`, ordem 0/1/2 e combinações de obrigatório/múltiplo/min/max transferem a complexidade do banco para uma pessoa que pensa em cardápio e atendimento. O risco é abandono ou configuração contraditória.

**Correção:** chamar slug de “Endereço da loja” com preview; trocar números de ordenação por reordenação direta; revelar min/max somente quando múltiplas escolhas estiver habilitado; validar combinações no momento da mudança e explicar o efeito no cardápio.

**Comando sugerido:** `$impeccable clarify configurações de loja e catálogo`

### [P2] Criar um produto não conclui a tarefa de vender um produto

**Por que importa:** após salvar um produto, o usuário volta ao catálogo e precisa reencontrá-lo para configurar adicionais. A quebra interrompe o modelo mental “produto completo” e aumenta cliques e esquecimentos.

**Correção:** levar diretamente à edição após a criação, com um progresso curto “Produto → adicionais → revisar”, permitindo pular adicionais quando não forem necessários.

**Comando sugerido:** `$impeccable onboard criação de produto`

## Red flags por persona

**Jordan — primeira experiência:** consegue encontrar catálogo e loja, mas “Slug (URL)”, “Ordem” e regras min/max não dizem qual efeito aparecerá para o consumidor. Após criar um produto, o retorno ao catálogo não comunica claramente se o item está pronto para venda.

**Casey — atendente distraída no celular:** a navegação móvel é utilizável, mas a fila plana e o detalhe em modal removem visão periférica. Uma ação rápida de conclusão não oferece desfazer; se o pedido sair da lista atual, Casey pode interpretar isso como desaparecimento ou perda.

**Alex — operador experiente:** não encontra busca, agrupamento por etapa, ações em lote ou atalhos. A grade funciona com poucos pedidos, mas exige abrir itens um por um e impede um ritmo rápido durante o pico.

## Observações menores

- Há títulos redundantes em rotas como “Endereço / Endereço”, “Horários de Funcionamento / Horários” e “Entrega e Retirada / Configurações”.
- A capitalização oscila entre sentence case e Title Case.
- Formulários simples ocupam largura além da necessária no desktop; uma largura ótima por tarefa melhora leitura e revisão.
- O scrollbar global customizado contraria a familiaridade defendida pelo register de produto.
- O checklist “Configurado/Revisar” mede presença de dados, mas não prova que um checkout de teste é concluível.
- A identidade local está mais explícita no DESIGN.md do que nas decisões operacionais do painel.

## Perguntas para considerar

- A visão geral deve ajudar a configurar a loja ou iniciar cada turno? Qual dessas tarefas merece dominar a tela?
- O que custa mais ao estabelecimento: perder um pedido novo ou avançar um pedido por engano? O design atual privilegia velocidade sem recuperação.
- Por que o lojista precisa pensar em ordem numérica, mínimo e máximo, em vez de organizar exatamente o que o consumidor verá?
- “Configurado” significa campos preenchidos ou significa que um pedido de teste pode ser concluído de ponta a ponta?
