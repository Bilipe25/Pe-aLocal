/**
 * A Orders API usa uma compra Pix predefinida no sandbox. Esses valores são
 * públicos e constam na documentação oficial do Mercado Pago; não são
 * credenciais nem configuração da conta conectada.
 */
export const MERCADO_PAGO_SANDBOX_PIX_AMOUNT_CENTS = 5_000;
export const MERCADO_PAGO_SANDBOX_PIX_PAYER_EMAIL = 'test_user_br@testuser.com';

export const MERCADO_PAGO_SANDBOX_PIX_AMOUNT_MESSAGE =
  'No ambiente de teste do Mercado Pago, o Pix só pode ser gerado para um pedido com total exato de R$ 50,00. Ajuste a sacola ou escolha dinheiro ou cartão no recebimento.';

export const MERCADO_PAGO_SANDBOX_PIX_EMAIL_MESSAGE =
  'No ambiente de teste do Mercado Pago, use exatamente test_user_br@testuser.com.';
