---
target: src/app/[storeSlug]
total_score: 24
p0_count: 0
p1_count: 2
timestamp: 2026-07-18T10-42-52Z
slug: src-app-storeslug
---
# Crítica de design — vitrine pública PedidoLocal

## Design Health Score

| # | Heurística | Nota | Questão principal |
|---|---|---:|---|
| 1 | Visibilidade do estado | 3 | Status da loja e total são claros; adicionar um item não produz confirmação explícita. |
| 2 | Correspondência com o mundo real | 3 | Linguagem natural, mas “30–50 min” é ambíguo e “Checkout” destoa do balcão local. |
| 3 | Controle e liberdade | 2 | Modal tem boa saída, porém limpar a sacola não oferece confirmação nem desfazer. |
| 4 | Consistência e padrões | 3 | Sistema coeso; alguns trechos do fluxo ainda parecem genéricos diante da promessa white-label. |
| 5 | Prevenção de erros | 2 | Obrigatoriedade de complementos é prevenida, mas perda da sacola e loja fechada têm lacunas. |
| 6 | Reconhecimento em vez de memória | 3 | Produtos e categorias são claros; condições comerciais precisam ser lembradas ou descobertas depois. |
| 7 | Flexibilidade e eficiência | 2 | Busca, navegação sticky e FAB ajudam; faltam recuperação e edição rápida em pontos críticos. |
| 8 | Estética e minimalismo | 3 | Limpa e escaneável, embora previsível para a categoria e repetitiva entre destaques e catálogo. |
| 9 | Recuperação de erros | 2 | Busca vazia e ação destrutiva oferecem pouca orientação de recuperação. |
| 10 | Ajuda e documentação | 1 | Falta ajuda contextual sobre entrega, retirada, taxas, mínimo e horários. |
| **Total** |  | **24/40** | **Aceitável — base sólida, mas ainda há quebras de confiança importantes.** |

## Anti-Patterns Verdict

**Avaliação humana:** não há AI slop evidente. A superfície evita glassmorphism, gradiente em texto, raios excessivos, ilustrações artificiais e ornamentação sem função. Existe product slop moderado: Papel, pills horizontais, cards claros e FAB inferior formam uma composição muito previsível de delivery. A personalidade de “O Balcão Digital do Bairro” depende quase inteiramente do conteúdo da loja.

**Detector determinístico:** zero achados no alvo `src/app/[storeSlug]` (`[]`, exit code 0). O resultado é limpo, mas o escopo não inclui automaticamente componentes importados de `src/components/storefront`; portanto, não invalida os problemas de jornada identificados visualmente.

**Evidência visual:** a Avaliação A inspecionou a loja real em 390×844, com seis produtos e modal aberto. A Avaliação B não conseguiu confirmar injeção do overlay por isolamento de rede; nenhum overlay confiável é alegado.

## Overall Impression

A vitrine é legível, rápida de entender e tecnicamente mais acessível que a média. O maior ganho agora não virá de ornamentação: virá de mostrar condições comerciais cedo, confirmar ações e proteger o trabalho já feito. Isso tornará a experiência realmente próxima e confiável.

## What's Working

1. **Arquitetura white-label disciplinada:** tokens ficam no wrapper da loja e preservam contraste e identidade sem contaminar a plataforma.
2. **Ergonomia móvel convincente:** cards inteiros acionáveis, alvos de 44 px, CTA/FAB na zona do polegar, safe areas e modal inferior.
3. **Fundação acessível acima da média:** Radix Dialog, restauração de foco, labels, `aria-current`, estados obrigatórios descritos e movimento reduzido.

## Carga Cognitiva

**1 falha em 8 — baixa no cenário observado**, com risco de subir em catálogos maiores.

- Passam: foco único, chunking, agrupamento, hierarquia, uma decisão por vez, escolhas mínimas no catálogo observado e divulgação progressiva.
- Falha: memória de trabalho. O consumidor escolhe produtos sem ver no mesmo contexto modalidade, taxa, mínimo e significado do prazo.
- Catálogos e grupos de adicionais com mais de quatro opções ainda não têm estratégia explícita de redução ou agrupamento.

## Jornada Emocional

- **Entrada forte:** nome, estado aberto, localização e prazo inspiram confiança.
- **Exploração fluida:** busca, categorias sticky e preços monoespaçados facilitam comparação.
- **Pico de decisão:** modal com total atualizado e CTA inferior transmite controle.
- **Vale pós-adição:** o modal fecha e o FAB aparece, mas falta confirmação textual e acessível; a dúvida pode causar adição duplicada.
- **Vale de confiança:** taxa, mínimo e modalidades aparecem tarde, podendo transformar o checkout em surpresa.
- **Encerramento:** total e direção são claros, mas “Checkout” é impessoal e limpar a sacola não tem retorno.

## Priority Issues

### P1 — Loja fechada promete consulta, mas bloqueia detalhes dos produtos

**Por que importa:** o banner diz que o cardápio pode ser visto, porém os cards ficam desabilitados. Complementos e descrições completas se tornam inacessíveis.

**Correção:** permitir abrir o produto em modo somente leitura; desabilitar apenas “Adicionar” e informar próxima abertura ou possibilidade de agendamento.

**Comando sugerido:** `$impeccable harden`

### P1 — “Limpar sacola” destrói todo o trabalho sem confirmação ou desfazer

**Por que importa:** um toque elimina itens, quantidades, complementos e observações. É uma falha direta de controle e prevenção de erro.

**Correção:** implementar undo acessível com snapshot temporário; se não houver undo, pedir confirmação informando quantos itens serão removidos.

**Comando sugerido:** `$impeccable harden`

### P2 — Condições essenciais aparecem tarde e o prazo é ambíguo

**Por que importa:** “30–50 min” não explica preparo, entrega ou retirada. Taxa, mínimo e modalidades só aparecem depois que o consumidor investiu tempo.

**Correção:** mostrar no cabeçalho “Entrega em 30–50 min”, retirada disponível, taxa inicial/mínimo e próxima abertura. Trocar “Ir para o Checkout” por “Continuar” ou “Finalizar pedido”.

**Comando sugerido:** `$impeccable clarify`

### P2 — Busca sem resultado não oferece recuperação

**Por que importa:** “Nenhum produto encontrado” é um beco sem saída e não informa o termo usado.

**Correção:** exibir o termo, oferecer “Limpar busca” e apontar para as categorias.

**Comando sugerido:** `$impeccable onboard`

### P2 — Carregamento e adição têm feedback insuficiente

**Por que importa:** o spinner não preserva a estrutura da página; após adicionar, o fechamento silencioso do modal pode gerar dúvida ou duplicação.

**Correção:** usar skeleton estrutural; após adicionar, anunciar produto e quantidade, mostrar confirmação/undo e manter o FAB como estado persistente.

**Comando sugerido:** `$impeccable harden`

## Persona Red Flags

### Casey — usuário móvel distraído

- FAB e CTA estão na zona correta do polegar.
- Spinner vazio comunica pouco em rede lenta.
- Fechamento silencioso do modal pode causar adições repetidas.
- Condições de entrega tardias aumentam abandono após interrupção.

### Riley — testador de estresse

- Busca vazia não recupera.
- Limpar sacola não tem undo.
- Nomes longos podem ocultar distinções importantes.
- Loja fechada contradiz a promessa de permitir consulta.
- Volumes extremos de categorias/adicionais não têm estratégia explícita.

### Jordan — primeira compra

- “30–50 min” exige interpretação.
- “Checkout” é linguagem da plataforma, não do balcão local.
- Não existe ajuda visível sobre entrega, retirada, taxa e mínimo.
- A estrela de destaque tem pouco significado sem rótulo textual visível.

### Consumidor do bairro — baixa tolerância a surpresa

- Abertura, localização e preços inspiram confiança.
- Falta horário completo ou próxima abertura.
- Bairro pode ser interpretado como endereço da loja, não área atendida.
- Taxa, mínimo e modalidades tardias quebram a sensação de previsibilidade.
- A composição ainda diferencia pouco o estabelecimento além de nome e conteúdo.

## Minor Observations

- O título da aba duplica a marca: `Burger do Zé | PedidoLocal | PedidoLocal`.
- O spinner contraria o register do próprio produto, que recomenda skeletons.
- Produtos destacados reaparecem no catálogo e podem parecer duplicados.
- Loja fechada não informa quando volta.
- Alt de imagem igual ao nome dentro do card acionável pode repetir conteúdo no leitor de tela.
- A mistura Bricolage/Inter/Space Mono está bem aplicada.

## Questions to Consider

- Se este é “O Balcão Digital do Bairro”, o que nesta tela só poderia pertencer ao estabelecimento visitado — além do nome?
- Por que o cliente precisa escolher comida antes de saber claramente como e por quanto ela chegará?
- Uma loja fechada deveria bloquear descoberta ou transformar a visita em intenção futura?
- O momento memorável deve ser adicionar à sacola ou confirmar o pedido?
