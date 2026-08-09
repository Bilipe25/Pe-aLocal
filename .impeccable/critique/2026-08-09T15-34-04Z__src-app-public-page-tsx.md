---
target: pagina inicial do projeto
total_score: 22
p0_count: 1
p1_count: 2
timestamp: 2026-08-09T15-34-04Z
slug: src-app-public-page-tsx
---
## Design Health Score

| # | Heurística | Score | Observação |
|---|---|---:|---|
| 1 | Visibilidade do estado | 3/4 | A página orienta bem os próximos links, mas não explica o que acontece após solicitar acesso. |
| 2 | Correspondência com o mundo real | 2/4 | “Lanchonete”, “marketplace” e “Mobile-first” estreitam ou tecnificam a proposta. |
| 3 | Controle e liberdade | 3/4 | Há navegação simples e retorno à home, mas não há rota clara para consumidores. |
| 4 | Consistência e padrões | 3/4 | Tokens, espaçamento e alvos de toque são coerentes; o CTA de login é duplicado. |
| 5 | Prevenção de erros | 2/4 | Solicitar acesso não informa elegibilidade, prazo ou próximos passos. |
| 6 | Reconhecimento em vez de memória | 2/4 | Ícones e claims exigem inferência; faltam demonstração e prova concreta. |
| 7 | Flexibilidade e eficiência | 2/4 | Não há caminhos explícitos por público nem atalho de compra. |
| 8 | Estética minimalista | 3/4 | Composição limpa e legível, porém esparsa e baseada em um template conhecido. |
| 9 | Diagnóstico e recuperação | 1/4 | Não há suporte, FAQ ou recuperação visível na home. |
| 10 | Ajuda e documentação | 1/4 | O footer não oferece documentação, termos, privacidade ou contexto comercial. |
| **Total** |  | **22/40** | **Aceitável; a fundação visual é boa, mas a arquitetura de entrada precisa evoluir.** |

## Anti-patterns

**Avaliação visual:** médio-alto. A combinação de hero centralizada, três cards iguais com ícone e claims genéricos parece uma landing SaaS intercambiável. A paleta Papel/Pimenta, a tipografia e a elevação contida evitam uma aparência artificial mais forte, mas falta o “Balcão Digital do Bairro”: nenhuma cena local, fluxo real, screenshot do produto ou prova operacional.

**Detector:** CLI limpo, com zero achados determinísticos. No navegador, o detector visual encontrou sete marcações em quatro famílias: `icon-tile-stack`, `nested-cards`, `cream-palette` e `layout-transition`. `cream-palette` é falso positivo porque Papel é token aprovado; os tiles de ícone são affordances intencionais. `nested-cards` captura uma repetição real da grade de benefícios; `layout-transition` corresponde a `transition-all` e pode ser restringido a `transition-shadow`.

## Impressão geral

A página é rápida, calma e fácil de ler, especialmente no celular. O problema central não é acabamento: é orientação. Ela fala quase exclusivamente com o dono do estabelecimento, embora o produto tenha consumidores e estabelecimentos como públicos centrais. Um visitante consumidor não encontra uma ação óbvia para pedir; um dono novo não encontra evidência suficiente para confiar no convite ou entender o próximo passo.

## O que está funcionando

- Hierarquia curta, boa leitura e composição sem overflow em 320, 390, 768 e 1280px.
- Semântica, foco e alvos de toque sólidos; Axe encontrou zero violações nas larguras testadas.
- Tokens de cor, Bricolage/Inter, bordas e sombras seguem o sistema visual sem gradientes ou glassmorphism.

## Prioridades

### [P0] A home não divide claramente consumidor e estabelecimento

**Por que importa:** o único caminho de consumidor é “Ver loja de exemplo”, visualmente secundário e apresentado como demonstração. Uma pessoa que chegou para comprar não sabe que pode entrar diretamente em uma vitrine.

**Correção:** apresentar duas intenções logo no primeiro bloco — “Quero pedir” e “Tenho um estabelecimento” — mantendo a loja demo como exemplo real ou apontando para uma descoberta de lojas. O CTA do comerciante deve continuar “Entrar no painel”.

**Comando sugerido:** `$impeccable shape` ou `$impeccable clarify`.

### [P1] Falta prova e clareza no acesso por convite

**Por que importa:** “Solicitar acesso” é coerente com o modelo por convite, mas não diz quem pode solicitar, quem aprova, em quanto tempo ou o que o visitante receberá. “Sem comissões” e “em minutos” são claims sem escopo ou evidência.

**Correção:** explicar o fluxo de convite em uma frase, indicar que o responsável da loja cadastra o acesso e adicionar uma prova concreta do produto: captura da central, vitrine ou sequência “configurar → publicar → receber”.

**Comando sugerido:** `$impeccable clarify`.

### [P1] “Sua lanchonete online” exclui negócios locais fora dessa categoria

**Por que importa:** o posicionamento do produto é mais amplo que alimentação. O título pode afastar cafés, mercados, salões e outros pequenos negócios que o sistema pretende atender.

**Correção:** usar “Seu negócio local online” ou uma formulação inclusiva, mantendo exemplos de alimentação apenas no apoio visual/copy.

**Comando sugerido:** `$impeccable typeset`.

### [P2] Benefícios sem título visível e pouco concretos

**Por que importa:** o `h2` existe para acessibilidade, mas está `sr-only`; visualmente o usuário sai da hero direto para três cards iguais. “Mobile-first”, “Sem comissões” e “Rápido e simples” pedem que o visitante acredite, não mostram como o produto funciona.

**Correção:** mostrar um título curto da seção e trocar ao menos um card por prova de fluxo, screenshot ou resultado observável. Restrinja `transition-all` à propriedade realmente animada.

**Comando sugerido:** `$impeccable distill`.

### [P2] Footer não sustenta confiança

**Por que importa:** o único conteúdo é copyright. Antes de solicitar acesso, o visitante não encontra suporte, privacidade, termos, condições da promessa “sem comissões” ou uma rota de ajuda.

**Correção:** adicionar apenas links reais existentes para suporte, privacidade, termos e acesso; não inventar destinos.

**Comando sugerido:** `$impeccable harden`.

### [P2] CTA primário usa `brand-600` em repouso

**Por que importa:** o DESIGN.md define Pimenta como ação primária; o uso de `brand-600` escurece e cria uma divergência de token entre a home e o restante do sistema.

**Correção:** usar o token primário no repouso e reservar o tom mais escuro para hover/pressed.

**Comando sugerido:** `$impeccable colorize`.

## Personas

**Jordan, primeiro acesso/consumidor:** entende a headline como uma plataforma para lojistas e não encontra “Quero pedir”. O link da loja demo parece secundário e não comunica que é uma vitrine real.

**Riley, usuário que testa limites:** as larguras são estáveis e não há overflow, mas a página não oferece suporte, termos ou comportamento claro para acesso negado. Claims absolutos também ficam frágeis quando o fluxo por convite é exercitado.

**Casey, dono no celular:** os alvos de 44–50px funcionam bem, mas “Entrar no painel” e “Solicitar acesso” exigem interpretar a diferença. Falta uma explicação curta do que fazer depois do clique e como retomar após uma interrupção.

## Observações menores

- A home está sem screenshot, logo própria ou sinal de operação local; os ícones Lucide são adequados, porém genéricos.
- O texto “Mobile-first” pode ser substituído por português mais direto.
- A grade de cards é visualmente equilibrada em desktop, mas ocupa muito espaço vertical no mobile para pouca informação nova.

## Perguntas para orientar a próxima etapa

- A home deve ser uma porta de entrada dividida para consumidores e estabelecimentos, ou a raiz será oficialmente merchant-only?
- Qual prova real pode aparecer acima da dobra: vitrine publicada, central de pedidos, fluxo em três passos ou depoimento de lojista?
- A promessa “sem comissões” significa ausência total de comissão da plataforma ou há condições que precisam ser explicitadas?
