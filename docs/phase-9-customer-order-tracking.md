# Fase 9 — Acompanhamento automático do cliente

## Arquitetura

O PostgreSQL continua sendo a fonte definitiva. A página pública usa três caminhos de
reconciliação, sempre consultando o estado canônico pelo `publicToken`:

1. evento `tracking-updated` em canal Pusher privado;
2. polling leve a cada 20 segundos;
3. atualização ao voltar para a aba, recuperar a conexão ou tocar em **Atualizar**.

O evento em tempo real é apenas um sinal. Ao recebê-lo, o navegador consulta novamente
o endpoint público e não aplica diretamente um status recebido do Pusher.

## Segurança e privacidade

- canal: `private-order-{sha256(publicToken)}`;
- autenticação do canal exige o token original, o slug canônico e o nome exato do canal;
- o endpoint de polling valida token e slug e possui rate limit distribuído;
- respostas usam `private, no-store` e `no-referrer`;
- o payload público não contém `orderId`, telefone, endereço, itens ou observações;
- motivos de cancelamento são convertidos em mensagens públicas seguras;
- `cancellationNote` nunca é retornado ao cliente;
- o nome do canal não contém o token original.

## Experiência

- estado atual com texto e ícone, sem depender somente de cor;
- linha de progresso diferente para retirada e entrega;
- previsão recalculada a partir da etapa e da configuração da loja;
- comunicação explícita de cancelamento;
- estado da conexão, última sincronização e atualização manual;
- fallback preserva o último estado conhecido quando a rede falha;
- layout mobile-first com alvos de toque de pelo menos 44 px.

## Rollout em staging

Esta fase não cria migration.

1. publicar aplicação e worker de outbox da mesma revisão;
2. confirmar as variáveis públicas e privadas do Pusher em staging;
3. criar um pedido descartável;
4. abrir o acompanhamento em outra aba;
5. avançar status e pagamento no dashboard;
6. confirmar atualização pelo canal privado;
7. bloquear o Pusher e confirmar polling em até 20 segundos;
8. testar retorno à aba e botão Atualizar;
9. cancelar um pedido e revisar a mensagem pública;
10. inspecionar payloads para confirmar ausência de PII.

## Rollback

1. reimplantar a revisão anterior da aplicação e do worker de outbox;
2. não há rollback de banco;
3. eventos pendentes continuam compatíveis porque o payload da outbox não mudou;
4. a página anterior volta a funcionar com o mesmo `publicToken`.
