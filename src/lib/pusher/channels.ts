export function privateStoreChannel(storeId: string) {
  return `private-store-${storeId}`;
}

export function storeEventChannels(storeId: string, includeLegacyPublicChannel: boolean) {
  const privateChannel = privateStoreChannel(storeId);
  return includeLegacyPublicChannel ? [privateChannel, `store-${storeId}`] : privateChannel;
}
