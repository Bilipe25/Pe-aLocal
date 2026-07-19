---
target: pagina de loguin
total_score: 30
p0_count: 0
p1_count: 1
timestamp: 2026-07-19T17-00-19Z
slug: src-app-auth-login-page-tsx
---
Method: dual-agent (A: /root/login_design_review · B: /root/login_detector_evidence)

## Design Health Score

| # | Heurística | Nota | Questão principal |
|---|---|---:|---|
| 1 | Visibilidade do estado do sistema | 3/4 | Loading, busy e erros estão claros; anúncio durante o redirecionamento ainda merece validação assistiva. |
| 2 | Correspondência com o mundo real | 4/4 | Linguagem familiar e português direto. |
| 3 | Controle e liberdade | 3/4 | Há saída para home e recuperação de senha, mas não para problemas de acesso/provisionamento. |
| 4 | Consistência e padrões | 3/4 | Controles coerentes; a identidade tipográfica do sistema quase não aparece. |
| 5 | Prevenção de erros | 3/4 | Schema, autocomplete e bloqueio de envio duplicado; validação ainda é majoritariamente reativa. |
| 6 | Reconhecimento em vez de memorização | 4/4 | Rótulos persistentes, ações visíveis e ícones nomeados. |
| 7 | Flexibilidade e eficiência | 3/4 | Enter, autocomplete e visibilidade da senha ajudam; não há rota alternativa de acesso. |
| 8 | Estética e design minimalista | 3/4 | Foco excelente, mas composição genérica e subtítulo redundante. |
| 9 | Reconhecimento e recuperação de erros | 3/4 | Erros inline preservam os campos; falta escalada contextual para suporte. |
| 10 | Ajuda e documentação | 1/4 | Existe recuperação de senha, mas nenhuma orientação para conta sem acesso. |
| **Total** |  | **30/40** | **Bom — base sólida, com lacunas relevantes antes do acabamento final.** |

## Anti-Patterns Verdict

**Avaliação de design:** não há violações gritantes de “AI slop”. O login evita texto em gradiente, glassmorphism, raios exagerados, fundo de grade, bordas laterais decorativas, sombra ampla e movimento gratuito. O risco é mais sutil: a composição “logo + card central + dois campos + botão” é tão previsível que poderia pertencer a qualquer SaaS. Familiaridade é correta para autenticação; falta apenas uma camada útil e específica de PedidoLocal.

**Detector determinístico:** `detect.mjs --json "src/app/(auth)"` retornou `[]`, exit code 0: zero achados, zero regras e zero falsos positivos.

**Overlay visual:** não foi gerado. O runtime de navegador retornou zero navegadores disponíveis para ambos os agentes; sem tab, a preflight de mutação e a injeção não puderam ocorrer. O fallback confirmou HTTP 200, `<main>`, título, campos, submit, recuperação e credenciais de desenvolvimento no HTML renderizado. Portanto, não existe overlay confiável visível ao usuário nesta execução.

## Overall Impression

O login é enxuto, claro e mecanicamente mais completo do que a média: cobre loading, validação, falha de credenciais, falha de conexão, senha visível, sucesso e redirecionamento. A maior oportunidade não é adicionar decoração; é usar a única linha de apoio e a composição desktop para transmitir quem pode entrar, qual acesso usar e como recuperar uma conta que não está provisionada.

## Cognitive Load

Os oito itens passaram: foco único, chunking, agrupamento, hierarquia, uma decisão por vez, escolhas mínimas, baixa exigência de memória e disclosure progressivo. Há no máximo quatro ações visíveis no principal ponto de decisão. **0 falhas: carga cognitiva baixa.** A exceção prática é o bloco de credenciais de desenvolvimento, que pede transferência manual de e-mail e senha e disputa levemente com o card.

## Emotional Journey

- **Chegada:** calma e imediatamente compreensível, porém genérica.
- **Compromisso:** rótulos, mostrar senha e CTA largo reduzem ansiedade.
- **Vale emocional:** quem não foi provisionado encontra um beco sem saída; “esqueci minha senha” diagnostica outro problema.
- **Falha:** mensagens inline humanas e preservação dos campos são o ponto mais forte.
- **Final:** o toast de boas-vindas fecha bem, mas o destino precisa reafirmar estabelecimento e conta ativos.

## What’s Working

1. Estados reais completos: suspense, loading, disabled, validação, credencial inválida, conexão, sucesso e redirect.
2. Fundamentos acessíveis: labels, autocomplete, foco, alvos 44–48px, `aria-invalid`, alertas, `aria-pressed`, `aria-busy` e movimento reduzido.
3. Disciplina visual: Pimenta fica reservada à ação/foco, o submit domina e ações secundárias permanecem secundárias.

## Priority Issues

### [P1] Recuperação de acesso termina cedo demais

**Por que importa:** “Esqueci minha senha” não ajuda proprietário de primeiro acesso, funcionário ainda não provisionado, e-mail cadastrado incorretamente ou usuário aguardando associação à loja. Esse público pouco técnico tende a procurar suporte.

**Correção:** adicionar uma única rota secundária, de baixa ênfase, como “Ainda não tem acesso? Fale com o responsável da sua loja” ou suporte contextual. Não revelar se uma conta existe.

**Comando sugerido:** `$impeccable harden src/app/(auth)/login`

### [P2] A tela quase não expressa a identidade PedidoLocal

**Por que importa:** card central e tipografia integralmente funcional poderiam pertencer a qualquer painel. A marca promete proximidade e autenticidade, mas Bricolage e o contexto de negócio local não participam da chegada.

**Correção:** preservar o formulário familiar, aplicar identidade tipográfica com parcimônia ao wordmark/H1 e usar o espaço desktop para uma única mensagem útil sobre autonomia local. No mobile, manter a coluna única. Sem ilustração improvisada, glass ou card adicional.

**Comando sugerido:** `$impeccable bolder src/app/(auth)/login`

### [P2] Autofocus e centralização são frágeis com teclado móvel

**Por que importa:** `autoFocus` abre o teclado antes da orientação e `min-h-screen items-center` pode empurrar CTA, recuperação e erros para fora da área visual.

**Correção:** usar `min-h-dvh`, alinhar ao topo em viewports compactos e centralizar a partir de breakpoints maiores. Remover autofocus incondicional em contexto touch. Validar 320/375px, landscape, zoom 200%, teclado aberto e dois erros simultâneos.

**Comando sugerido:** `$impeccable adapt src/app/(auth)/login`

### [P2] O subtítulo repete o título em vez de orientar

**Por que importa:** “Entrar no painel” e “Acesse o painel do seu estabelecimento” comunicam quase a mesma coisa; não dizem qual e-mail usar nem deixam claro que é acesso para estabelecimentos.

**Correção:** substituir por uma frase específica, como “Use o e-mail cadastrado pela sua loja.” Se consumidores podem chegar aqui, explicitar “Acesso para estabelecimentos”.

**Comando sugerido:** `$impeccable clarify src/app/(auth)/login`

### [P3] Credenciais de desenvolvimento enfraquecem confiança e ergonomia

**Por que importa:** senha em texto aberto normaliza exposição, usa texto abaixo do piso móvel do sistema e cria um segundo bloco visual. Demo exige copiar/memorizar duas strings.

**Correção:** manter estritamente local, rotular como conta de demonstração, usar pelo menos 14px e oferecer “Preencher dados de demonstração” ou controles de cópia acessíveis.

**Comando sugerido:** `$impeccable polish src/app/(auth)/login`

## Persona Red Flags

**Jordan — primeiro acesso:** entende o formulário, mas não sabe qual e-mail usar nem como resolver acesso ainda não provisionado. O link de senha não cobre esse caso.

**Sam — acessibilidade:** encontra boa semântica, foco, alertas e redução de movimento. O `autoFocus` pode mover foco antes de título/contexto; anúncio do toast seguido de redirect e expansão em zoom 200% ainda precisam de validação assistiva.

**Casey — mobile distraído:** autocomplete e alvos de toque ajudam, mas o teclado automático pode esconder o CTA. A ação não é ancorada na zona do polegar e os campos não demonstram persistência após interrupção.

## Minor Observations

- `CardTitle` como `div` envolvendo `h1` é válido, mas uma API `asChild` seria mais limpa.
- O logo funciona como retorno à home, embora visualmente pareça apenas marca.
- Mostrar/ocultar senha tem alvo e nome acessível corretos.
- O skeleton respeita movimento reduzido por meio do wrapper `.auth-shell`.
- O dashboard de destino deve identificar imediatamente o estabelecimento ativo.

## Questions to Consider

1. Se o wordmark desaparecesse, qual detalhe ainda identificaria o PedidoLocal?
2. O login é exclusivamente para usuários já provisionados? Se sim, por que essa fronteira não é declarada?
3. Qual é a rota correta quando “esqueci a senha” é o diagnóstico errado?
4. O autofocus otimiza o público mobile real ou principalmente o teste em desktop?
5. Uma linha útil sobre autonomia local geraria mais confiança do que o subtítulo atual?
