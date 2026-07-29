/**
 * Contratos públicos do reconhecimento rápido do checkout.
 *
 * Reconhecimento não autenticado. Não utilizar para autorização de dados
 * sensíveis nem ampliar estes DTOs com models Prisma ou dados completos.
 */
export interface MaskedCustomerAddressDto {
  opaqueReference: string;
  label: string;
  maskedAddress: string;
  isDefault: boolean;
  lastUsedLabel?: string;
  requiresDeliveryZoneSelection: boolean;
}

export type CustomerRecognitionResult =
  | {
      recognized: true;
      maskedName: string;
      maskedPhone: string;
      maskedAddresses: MaskedCustomerAddressDto[];
    }
  | {
      recognized: false;
      message: string;
      recognitionUnavailable?: boolean;
      retryAfterSeconds?: number;
    };

export type CustomerRecognitionConfirmationResult =
  | { confirmed: true; mode: 'SAVED_ADDRESS'; opaqueReference: string }
  | { confirmed: true; mode: 'NEW_ADDRESS' };

export interface CustomerRecognitionInvalidationResult {
  invalidated: true;
}
