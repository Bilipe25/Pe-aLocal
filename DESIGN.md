---
name: PedidoLocal
description: Comprar com facilidade para o cliente. Vender com autonomia para o estabelecimento.
colors:
  primary: '#d9480f'
  primary-hover: '#c2410c'
  primary-active: '#9a3412'
  background: '#fffdf9'
  ink: '#241c15'
  surface-secondary: '#f5f0e8'
  surface-highlight: '#efe0c3'
  text-secondary: '#5c4f42'
  text-muted: '#8a7e72'
  border: '#d6cec4'
  border-hover: '#b8ad9f'
  success: '#3f7d58'
  success-soft: '#e6f3ec'
  info: '#3b6e8f'
  info-soft: '#e3eef5'
  warning: '#e89b0c'
  warning-soft: '#fef3c7'
  error: '#d63b3b'
  error-soft: '#fde8e8'
  white: '#ffffff'
typography:
  display:
    fontFamily: 'Bricolage Grotesque, Georgia, serif'
    fontSize: '3rem'
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: '-0.02em'
  headline:
    fontFamily: 'Bricolage Grotesque, Georgia, serif'
    fontSize: '2rem'
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: 'Bricolage Grotesque, Georgia, serif'
    fontSize: '1.25rem'
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 500
    lineHeight: 1.4
  mono:
    fontFamily: 'Space Mono, Cascadia Code, monospace'
    fontSize: '1rem'
    fontWeight: 700
    lineHeight: 1.4
rounded:
  sm: '0.375rem'
  md: '0.5rem'
  lg: '0.75rem'
  xl: '1rem'
  full: '9999px'
spacing:
  xs: '0.25rem'
  sm: '0.5rem'
  md: '0.75rem'
  lg: '1rem'
  xl: '1.5rem'
  2xl: '2rem'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.white}'
    typography: '{typography.label}'
    rounded: '{rounded.lg}'
    padding: '0.5rem 1rem'
    height: '2.5rem'
  button-primary-hover:
    backgroundColor: '{colors.primary-hover}'
    textColor: '{colors.white}'
  button-outline:
    backgroundColor: '{colors.background}'
    textColor: '{colors.ink}'
    typography: '{typography.label}'
    rounded: '{rounded.lg}'
    padding: '0.5rem 1rem'
    height: '2.5rem'
  input:
    backgroundColor: '{colors.background}'
    textColor: '{colors.ink}'
    typography: '{typography.label}'
    rounded: '{rounded.lg}'
    padding: '0.5rem 0.75rem'
    height: '2.5rem'
  card:
    backgroundColor: '{colors.background}'
    textColor: '{colors.ink}'
    rounded: '{rounded.xl}'
    padding: '1.5rem'
  badge-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.white}'
    typography: '{typography.label}'
    rounded: '{rounded.full}'
    padding: '0.125rem 0.625rem'
---

# Design System: PedidoLocal

## Overview

**Creative North Star: "O Balcão Digital do Bairro"**

O PedidoLocal combina a proximidade humana de um negócio conhecido com a precisão de uma operação bem organizada. A interface deve ser acolhedora sem ficar informal demais, autêntica sem sacrificar familiaridade e ágil sem comprimir informações importantes. O sistema serve com igual cuidado quem compra e quem vende.

A plataforma é web responsiva. As jornadas do consumidor são mobile-first: decisões, preços, estados da loja, carrinho e checkout precisam ser legíveis e acionáveis com uma mão. Painéis de estabelecimento e administração devem se adaptar do celular ao desktop, preservando densidade, hierarquia e previsibilidade. As vitrines são white-label e podem expressar cada marca dentro de limites seguros de contraste e usabilidade.

O sistema rejeita aparência corporativa fria, SaaS genérico e interfaces carregadas para pessoas pouco técnicas. Familiaridade é uma virtude: componentes devem desaparecer dentro da tarefa e usar movimento somente para comunicar estado ou resposta.

**Key Characteristics:**

- Próximo e autêntico, com vocabulário visual ligado ao comércio local.
- Acolhedor e preciso, sem decoração que dispute atenção com a tarefa.
- Mobile-first para consumidores e estruturalmente responsivo nos painéis.
- Familiar, tátil e direto nas ações.
- Acessível por padrão, em conformidade com WCAG 2.2 AA.

## Colors

A paleta traduz ingredientes e materiais cotidianos em papéis semânticos estáveis. Pimenta conduz ações; Papel e Tinta sustentam leitura; Erva, Azulejo e os tons de estado comunicam significado, nunca decoração.

### Primary

- **Pimenta:** ação primária, seleção atual, links de ação e foco. É o sinal de decisão do sistema.
- **Pimenta tostada:** hover e feedback imediato em controles primários.
- **Pimenta profunda:** estado pressionado ou ênfase excepcional; não deve dominar superfícies.

### Secondary

- **Erva:** sucesso, disponibilidade e confirmação.
- **Azulejo:** informação, ajuda contextual e estados neutros que exigem atenção.

### Tertiary

- **Kraft:** superfície de destaque para informações especiais, comandas e agrupamentos que precisam de calor sem competir com a ação primária.
- **Âmbar:** aviso e atenção recuperável.
- **Vermelho de erro:** falha, bloqueio e ação destrutiva.

### Neutral

- **Papel:** fundo principal e superfície base.
- **Tinta:** texto e títulos de maior contraste.
- **Papel sombreado:** segunda camada de painéis, barras e estados de hover.
- **Tinta suave:** texto secundário; deve continuar legível em tamanhos pequenos.
- **Tinta atenuada:** metadados e estados desabilitados, nunca corpo essencial.
- **Barro claro:** bordas e divisores estruturais.

### Named Rules

**The Pimenta Means Action Rule.** Pimenta identifica ação primária, foco ou seleção. É proibido usá-la como preenchimento decorativo sem significado.

**The Semantic Color Rule.** Erva, Azulejo, Âmbar e Vermelho mantêm o mesmo significado em todas as superfícies. Nunca reutilize uma cor de estado para ornamentação.

**The White-label Boundary Rule.** Tokens da vitrine pertencem ao wrapper da loja e nunca alteram login, dashboard ou administração da plataforma. Toda combinação publicada deve preservar contraste WCAG 2.2 AA.

## Typography

**Display Font:** Bricolage Grotesque (com Georgia como fallback)
**Body Font:** Inter (com system-ui como fallback)
**Label/Mono Font:** Space Mono (com Cascadia Code como fallback)

**Character:** Bricolage adiciona personalidade local aos títulos; Inter mantém formulários e operações silenciosamente legíveis; Space Mono torna preços, códigos e números de pedido imediatamente reconhecíveis. A personalidade aparece na hierarquia, não em excesso tipográfico.

### Hierarchy

- **Display** (700, 3rem, 1.1): comunicação de marca, hero e nome de loja; não usar em controles.
- **Headline** (700, 2rem, 1.2): título principal de página e cabeçalhos de alto nível.
- **Title** (700, 1.25rem, 1.25): títulos de seção, modal e agrupamentos.
- **Body** (400, 1rem, 1.5): leitura principal, limitada a 65–75 caracteres por linha quando for prosa.
- **Label** (500, 0.875rem, 1.4, caixa natural): campos, botões, navegação e metadados funcionais.
- **Mono** (700, 1rem, 1.4): preços, números de pedido, senhas e códigos.

### Named Rules

**The Task Typography Rule.** Inter governa rótulos, formulários, tabelas e botões. Bricolage nunca aparece em controles operacionais.

**The Numbers Have a Voice Rule.** Valores monetários e identificadores operacionais usam Space Mono para leitura rápida e alinhamento visual.

**The Mobile Reading Rule.** Texto essencial nunca fica abaixo de 0.875rem; títulos precisam quebrar sem transbordar e conteúdo acionável deve permanecer legível sem zoom.

## Elevation

A elevação é estrutural e discreta. O sistema usa camadas tonais e bordas para organizar a maior parte da interface; sombras indicam superfícies elevadas, popovers, modais ou resposta de hover. Elas são derivadas da Tinta para permanecerem coerentes com a paleta e nunca devem criar cartões flutuantes decorativos.

### Shadow Vocabulary

- **Contato** (`0 1px 2px 0 rgb(36 28 21 / 0.06)`): cards e controles que precisam se separar minimamente do fundo.
- **Elevação média** (`0 4px 6px -1px rgb(36 28 21 / 0.08), 0 2px 4px -2px rgb(36 28 21 / 0.06)`): dropdowns, hover estrutural e superfícies temporárias.
- **Sobreposição** (`0 10px 15px -3px rgb(36 28 21 / 0.08), 0 4px 6px -4px rgb(36 28 21 / 0.06)`): diálogos e camadas acima do fluxo principal.

### Named Rules

**The Structural Elevation Rule.** Sombra comunica nível ou interação; nunca serve como decoração. Não combine borda de 1px com sombra difusa de blur maior ou igual a 16px.

**The Flat-at-Rest Rule.** Se cor de superfície e borda já explicam o agrupamento, nenhuma sombra adicional é permitida.

## Components

Os componentes são familiares, táteis e diretos. Estados devem responder em 150–250ms, sem animações coreografadas, e todo controle interativo precisa de default, hover, focus-visible, active, disabled e loading quando aplicável.

### Buttons

- **Shape:** cantos suavemente curvos (0.75rem); pills somente quando o significado é filtro, status ou ação compacta.
- **Primary:** Pimenta com texto branco, altura mínima de 2.5rem e padding horizontal de 1rem.
- **Hover / Focus:** Pimenta tostada no hover; anel Pimenta de 2px com offset de 2px no teclado; active pode reduzir discretamente a escala sem alterar layout.
- **Secondary / Ghost:** Kraft ou superfície transparente, sempre com contraste e hierarquia inferiores à ação primária.
- **Disabled / Loading:** preservam rótulo e largura, removem interação e comunicam estado sem depender apenas de opacidade.

### Chips

- **Style:** pill compacta, texto de 0.75rem e cor semântica sobre fundo suave.
- **State:** selecionado usa cor de ação e contraste alto; não selecionado permanece neutro. Status e filtros não compartilham significado visual por acidente.

### Cards / Containers

- **Corner Style:** cantos de 1rem; nunca ultrapassar 1rem em cards e seções.
- **Background:** Papel ou Kraft quando houver destaque semântico.
- **Shadow Strategy:** Contato somente quando necessário; painéis densos preferem borda e camada tonal.
- **Border:** Barro claro de 1px, completa ao redor do componente.
- **Internal Padding:** 1rem em mobile e 1.5rem em superfícies amplas.

### Inputs / Fields

- **Style:** Papel, borda Barro claro de 1px, altura mínima de 2.5rem e cantos de 0.75rem.
- **Focus:** anel Pimenta de 2px com offset de 2px; o rótulo permanece visível.
- **Error / Disabled:** erro usa mensagem textual e tratamento semântico; disabled mantém contraste suficiente e não depende apenas da cor.

### Navigation

- Navegação usa Inter em 0.875rem, Tinta suave no repouso e Tinta com superfície sombreada no hover ou estado atual.
- No desktop, barras superiores e navegação contextual preservam a largura do conteúdo. No mobile, itens essenciais permanecem visíveis, roláveis ou agrupados sem reduzir os alvos de toque.
- A vitrine usa categorias sticky, pills ou dropdown conforme configuração; o item ativo sempre expõe `aria-current` ou estado equivalente.

### Storefront Product Card

- O produto é uma ação inteira, com nome, descrição curta, preço em Space Mono e imagem opcional.
- Lista prioriza leitura rápida; grid prioriza descoberta visual. O estado esgotado desabilita a ação e permanece compreensível por texto e ícone.
- A vitrine respeita os tokens do estabelecimento sem perder hierarquia, contraste, foco e alvos de toque.

## Do's and Don'ts

### Do:

- **Do** usar Pimenta para a ação principal e reservar sua raridade para decisões reais.
- **Do** projetar primeiro a jornada do consumidor em larguras móveis e validar painéis do celular ao desktop.
- **Do** manter alvos de toque com pelo menos 44 × 44px nas jornadas do consumidor.
- **Do** usar Inter para trabalho, Bricolage para identidade e Space Mono para preços e códigos.
- **Do** explicar estados com texto, ícone ou estrutura além da cor e cumprir WCAG 2.2 AA.
- **Do** preservar a fronteira white-label: personalização da loja nunca invade as superfícies da plataforma.

### Don't:

- **Don't** criar uma aparência corporativa fria; a precisão deve continuar humana e próxima.
- **Don't** produzir um SaaS genérico sem identidade; use o vocabulário Papel, Tinta, Pimenta, Erva, Azulejo e Kraft com intenção.
- **Don't** construir interfaces carregadas que dificultem o uso por pessoas pouco técnicas; remova decisões e agrupamentos sem função.
- **Don't** usar Pimenta, Erva, Azulejo, Âmbar ou Vermelho como decoração sem significado.
- **Don't** combinar borda de 1px e sombra ampla de blur maior ou igual a 16px no mesmo card.
- **Don't** usar gradiente em texto, glassmorphism decorativo, listras diagonais, fundos de grade ou bordas laterais coloridas como acento.
- **Don't** usar cards com raio superior a 1rem nem repetir grades de cards idênticos quando uma lista ou hierarquia simples resolve melhor.
- **Don't** animar layout ou esconder conteúdo atrás de animação; respeite `prefers-reduced-motion`.
