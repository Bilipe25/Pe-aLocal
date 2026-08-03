/**
 * Delivery monetary values are stored as PostgreSQL INTEGER cents.
 * Keep validation and form limits aligned with the database boundary.
 */
export const MAX_DELIVERY_MONEY_CENTS = 2_147_483_647;
export const MAX_DELIVERY_MONEY_REAIS = MAX_DELIVERY_MONEY_CENTS / 100;
