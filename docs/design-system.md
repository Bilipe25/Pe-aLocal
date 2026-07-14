# Design System — PedidoLocal

> **Documento canônico da identidade visual do PedidoLocal.**
> Toda decisão de cor, tipografia e classe utilitária deve seguir este guia.
> Última atualização: Julho 2026.

---

## 1. Paleta de Cores

O sistema usa **6 cores nomeadas em português**, registradas como design tokens no Tailwind CSS v4 via `@theme` em `src/app/globals.css`.

| Nome | Hex | Variável CSS | Classe Tailwind (exemplo) | Uso Semântico |
|---|---|---|---|---|
| **Papel** | `#FFFDF9` | `--color-papel` | `bg-papel` | Fundo principal da aplicação |
| **Tinta** | `#241C15` | `--color-tinta` | `text-tinta` | Cor principal para textos e títulos |
| **Pimenta** | `#D9480F` | `--color-pimenta` | `bg-pimenta` | Cor primária — botões, CTAs, links de ação |
| **Erva** | `#3F7D58` | `--color-erva` | `bg-erva` | Estados positivos — disponível, confirmado, sucesso |
| **Azulejo** | `#3B6E8F` | `--color-azulejo` | `bg-azulejo` | Informação secundária, links de apoio, alertas neutros |
| **Kraft** | `#EFE0C3` | `--color-kraft` | `bg-kraft` | Superfícies de destaque — cards especiais, comandas |

### 1.1 Exemplos de Uso com Tailwind

```html
<!-- Fundo principal -->
<div class="bg-papel text-tinta">...</div>

<!-- Botão primário (CTA) -->
<button class="bg-pimenta text-white hover:bg-pimenta/90 rounded-lg px-4 py-2 font-body font-medium">
  Fazer Pedido
</button>

<!-- Badge de sucesso -->
<span class="bg-erva text-white rounded-full px-2 py-0.5 text-xs font-medium">
  Disponível
</span>

<!-- Badge informativa -->
<span class="bg-azulejo text-white rounded-full px-2 py-0.5 text-xs font-medium">
  Novo
</span>

<!-- Card de destaque -->
<div class="bg-kraft text-tinta rounded-xl p-6 border border-tinta/10">
  Comanda #42
</div>

<!-- Bordas e divisores -->
<div class="border border-tinta/10">...</div>
<hr class="border-tinta/5" />

<!-- Texto com opacidade -->
<p class="text-tinta">Texto principal</p>
<p class="text-tinta/70">Texto secundário</p>
<p class="text-tinta/50">Texto desabilitado</p>

<!-- Outline button -->
<button class="border border-pimenta text-pimenta hover:bg-pimenta hover:text-white rounded-lg px-4 py-2">
  Secundário
</button>

<!-- Focus ring -->
<input class="focus-visible:ring-2 focus-visible:ring-pimenta focus-visible:ring-offset-2" />
```

### 1.2 Variações com Opacidade

Todas as cores suportam modificadores de opacidade do Tailwind:

| Classe | Resultado |
|---|---|
| `bg-pimenta` | Fundo 100% opaco |
| `bg-pimenta/90` | Fundo 90% opaco (hover) |
| `bg-pimenta/10` | Fundo 10% opaco (highlight sutil) |
| `text-tinta/70` | Texto 70% opaco (secundário) |
| `text-tinta/50` | Texto 50% opaco (muted) |
| `border-tinta/10` | Borda 10% opaca (divisor sutil) |

---

## 2. Tipografia

O sistema usa **3 famílias tipográficas**, carregadas via `next/font/google` em `src/app/layout.tsx` e registradas como variáveis CSS.

| Família | Variável CSS | Classe Tailwind | Pesos Carregados | Uso |
|---|---|---|---|---|
| **Bricolage Grotesque** | `--font-bricolage` | `font-display` | 700 (Bold) | Headlines, títulos de seção, nome da marca |
| **Inter** | `--font-inter` | `font-body` / `font-sans` | 400 (Regular), 500 (Medium) | Texto corrido, labels, botões, formulários |
| **Space Mono** | `--font-space-mono` | `font-mono` | 700 (Bold) | Número de pedido, senhas, preços |

### 2.1 Exemplos de Uso

```html
<!-- Título de página -->
<h1 class="font-display text-3xl font-bold text-tinta">
  Cardápio Digital
</h1>

<!-- Subtítulo -->
<h2 class="font-display text-xl font-bold text-tinta">
  Hambúrgueres
</h2>

<!-- Nome da marca -->
<span class="font-display text-2xl font-bold text-pimenta">
  PedidoLocal
</span>

<!-- Texto corrido (padrão do body, não precisa de classe extra) -->
<p class="text-base text-tinta">
  Monte sua loja virtual própria...
</p>

<!-- Label de formulário -->
<label class="font-body text-sm font-medium text-tinta">
  Nome do produto
</label>

<!-- Preço -->
<span class="font-mono text-lg font-bold text-pimenta">
  R$ 25,00
</span>

<!-- Número de pedido -->
<span class="font-mono text-sm font-bold text-tinta">
  #00042
</span>

<!-- Senha de retirada -->
<span class="font-mono text-4xl font-bold text-tinta">
  A-17
</span>
```

### 2.2 Hierarquia Recomendada

| Elemento | Classe | Tamanho Sugerido |
|---|---|---|
| Hero / Display | `font-display font-bold` | `text-4xl` a `text-6xl` |
| Título de página | `font-display font-bold` | `text-2xl` a `text-3xl` |
| Título de seção | `font-display font-bold` | `text-xl` |
| Título de card | `font-body font-semibold` | `text-base` a `text-lg` |
| Corpo de texto | `font-body` (implícito) | `text-sm` a `text-base` |
| Label | `font-body font-medium` | `text-sm` |
| Caption / Helper | `font-body` | `text-xs` |
| Preço / Código | `font-mono font-bold` | variável |

---

## 3. Tokens de Suporte

### 3.1 Raios de Borda

| Token | Valor | Classe Tailwind |
|---|---|---|
| `--radius-sm` | `0.375rem` | `rounded-sm` |
| `--radius-md` | `0.5rem` | `rounded-md` |
| `--radius-lg` | `0.75rem` | `rounded-lg` |
| `--radius-xl` | `1rem` | `rounded-xl` |
| `--radius-full` | `9999px` | `rounded-full` |

### 3.2 Sombras

| Token | Classe Tailwind | Uso |
|---|---|---|
| `--shadow-sm` | `shadow-sm` | Cards, inputs |
| `--shadow-md` | `shadow-md` | Dropdowns, popovers |
| `--shadow-lg` | `shadow-lg` | Modais, dialogs |

> As sombras usam `rgb(36 28 21 / ...)` (derivado da cor Tinta) para manter coesão visual.

---

## 4. Uso em Componentes shadcn/ui

Os componentes shadcn/ui do projeto devem seguir este mapeamento de cores:

### 4.1 Button

```tsx
// Variante default (primária) → pimenta
"bg-pimenta text-white hover:bg-pimenta/90 shadow-sm"

// Variante outline → borda pimenta
"border border-pimenta text-pimenta bg-transparent hover:bg-pimenta hover:text-white"

// Variante secondary → kraft
"bg-kraft text-tinta hover:bg-kraft/80 shadow-sm"

// Variante ghost → sem fundo
"text-tinta hover:bg-tinta/5"

// Variante destructive → vermelho (error)
"bg-error text-white hover:bg-error/90"

// Variante link → pimenta
"text-pimenta underline-offset-4 hover:underline"
```

### 4.2 Card

```tsx
// Card padrão
"bg-papel border border-tinta/10 rounded-xl shadow-sm"

// Card de destaque (comanda, bloco especial)
"bg-kraft border border-tinta/10 rounded-xl"

// Card de informação
"bg-azulejo/10 border border-azulejo/20 rounded-xl"
```

### 4.3 Badge

```tsx
// Padrão
"bg-pimenta text-white"

// Sucesso (disponível, ativo)
"bg-erva text-white"

// Info
"bg-azulejo text-white"

// Neutro
"bg-kraft text-tinta"

// Outline
"border border-tinta/20 text-tinta"
```

### 4.4 Input / Textarea

```tsx
"bg-papel border border-tinta/15 text-tinta
 placeholder:text-tinta/40
 focus-visible:ring-2 focus-visible:ring-pimenta focus-visible:ring-offset-2
 focus-visible:ring-offset-papel"
```

### 4.5 Tabs

```tsx
// TabsList
"bg-kraft/50 rounded-lg p-1"

// TabsTrigger (ativo)
"data-[state=active]:bg-papel data-[state=active]:text-tinta data-[state=active]:shadow-sm"

// TabsTrigger (inativo)
"text-tinta/60 hover:text-tinta"
```

---

## 5. Aliases de Compatibilidade

Para não quebrar componentes existentes que usam os tokens antigos, `globals.css` mantém aliases:

| Token Antigo | Mapeado Para |
|---|---|
| `--color-surface` | `#FFFDF9` (= papel) |
| `--color-surface-secondary` | `#f5f0e8` (tom quente derivado) |
| `--color-surface-tertiary` | `#EFE0C3` (= kraft) |
| `--color-text-primary` | `#241C15` (= tinta) |
| `--color-text-secondary` | `#5c4f42` (tinta claro) |
| `--color-text-muted` | `#8a7e72` |
| `--color-brand-500` | `#D9480F` (= pimenta) |
| `--color-success` | `#3F7D58` (= erva) |
| `--color-info` | `#3B6E8F` (= azulejo) |

> **Importante:** Em componentes novos, use SEMPRE os nomes canônicos (`papel`, `tinta`, `pimenta`, `erva`, `azulejo`, `kraft`). Os aliases existem apenas para retrocompatibilidade e serão removidos no futuro.

---

## 6. Guia Rápido para IA

Ao gerar código para o PedidoLocal, siga estas regras:

### Cores

| Contexto | Classe |
|---|---|
| Fundo da página | `bg-papel` |
| Texto principal | `text-tinta` |
| Texto secundário | `text-tinta/70` |
| Texto desabilitado | `text-tinta/50` |
| Botão primário | `bg-pimenta text-white hover:bg-pimenta/90` |
| Link de ação | `text-pimenta hover:text-pimenta/80` |
| Sucesso / Ativo | `bg-erva text-white` ou `text-erva` |
| Informação | `bg-azulejo text-white` ou `text-azulejo` |
| Card especial | `bg-kraft text-tinta` |
| Borda padrão | `border-tinta/10` |
| Focus ring | `focus-visible:ring-pimenta` |

### Tipografia

| Contexto | Classe |
|---|---|
| Títulos (h1-h3) | `font-display font-bold` |
| Texto corrido | (padrão, `font-body` implícito) |
| Labels | `font-body text-sm font-medium` |
| Botões | `font-body font-medium` |
| Preços | `font-mono font-bold` |
| Códigos / Senhas | `font-mono font-bold` |

### Regras Gerais

1. **Nunca** use cores genéricas do Tailwind (`blue-500`, `gray-100`, etc.) — use os tokens do design system.
2. **Sempre** use `font-display` para headings e `font-mono` para valores numéricos/monetários.
3. **Bordas** devem usar `border-tinta/10` ou `border-tinta/15`, nunca `border-gray-*`.
4. **Sombras** usar os tokens `shadow-sm`, `shadow-md`, `shadow-lg` (já calibrados com a cor tinta).
5. **Focus** usar `focus-visible:ring-pimenta` como padrão.
6. Para **hover** em fundos claros, use `hover:bg-tinta/5`.
7. Para **hover** em botões coloridos, use `/90` de opacidade (ex: `hover:bg-pimenta/90`).
