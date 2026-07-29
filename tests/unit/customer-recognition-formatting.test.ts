import { describe, expect, it } from 'vitest';

import {
  createCustomerAddressFingerprint,
  customerNamesMatch,
  formatAddressForCustomerPreview,
  formatAddressForStore,
  maskCustomerName,
  maskPhone,
  normalizeCustomerName,
} from '@/server/services/customer-recognition-formatting';

const address = {
  street: 'Rua das Flores',
  number: '182',
  complement: 'Apto 43',
  neighborhood: 'Centro',
  city: 'São Paulo',
  state: 'SP',
  zipCode: '01234-567',
  reference: 'Portão azul',
};

describe('formatação privada do reconhecimento de cliente', () => {
  it('normaliza nome de forma exata, sem fuzzy matching', () => {
    expect(normalizeCustomerName('  JoÃO   Mártins ')).toBe('joao martins');
    expect(customerNamesMatch('João Martins', ' JOAO   MARTINS ')).toBe(true);
    expect(customerNamesMatch('João Martins', 'João Martin')).toBe(false);
    expect(customerNamesMatch('Maria Oliveira', 'Maria de Oliveira')).toBe(false);
  });

  it.each([
    ['João', 'J***'],
    ['João Martins', 'João M***'],
    ['Maria de Oliveira Souza', 'Maria de O*** S***'],
  ])('mascara o nome %s deterministicamente', (value, expected) => {
    expect(maskCustomerName(value)).toBe(expected);
  });

  it('mascara telefone preservando apenas DDD e dois dígitos finais', () => {
    expect(maskPhone('(11) 99999-1234')).toBe('(11) *****-**34');
    expect(maskPhone('valor-inválido')).toBe('(**) *****-****');
  });

  it('retorna somente uma prévia mascarada do endereço', () => {
    const preview = formatAddressForCustomerPreview(address);

    expect(preview).toBe('Rua das F***, nº *** — Centro');
    expect(preview).not.toContain('182');
    expect(preview).not.toContain('Apto');
    expect(preview).not.toContain('01234');
    expect(preview).not.toContain('Portão');
  });

  it('mantém o endereço completo somente no formatador server-side do lojista', () => {
    const full = formatAddressForStore(address);

    expect(full).toContain('Rua das Flores, 182');
    expect(full).toContain('Apto 43');
    expect(full).toContain('CEP 01234-567');
    expect(full).toContain('Referência: Portão azul');
  });

  it('deduplica o destino sem depender da referência e diferencia complemento', async () => {
    const first = await createCustomerAddressFingerprint(address);
    const sameDestination = await createCustomerAddressFingerprint({
      ...address,
      street: ' rua das flôres ',
      reference: 'Agora o portão é verde',
    });
    const anotherUnit = await createCustomerAddressFingerprint({
      ...address,
      complement: 'Apto 44',
    });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(sameDestination).toBe(first);
    expect(anotherUnit).not.toBe(first);
  });
});
