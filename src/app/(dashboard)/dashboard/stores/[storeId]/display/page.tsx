import { PageHeader } from '@/components/shared/page-header';
import { ReadOnlyNotice } from '@/components/shared/read-only-notice';
import { StorefrontDisplaySettingsForm } from '@/features/stores/components/storefront-display-settings-form';
import { loadStorePageData } from '@/features/stores/page-access';
import { formatZipCode } from '@/lib/brazil';
import { getStorefrontDisplaySettings } from '@/server/services/store-settings.service';

export const metadata = { title: 'Exibição no cardápio' };

function formatAddress(
  address: {
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  } | null,
) {
  if (!address) return null;
  const street = `${address.street}, ${address.number}`;
  const locality = `${address.neighborhood}, ${address.city} - ${address.state}`;
  const complement = address.complement?.trim();
  return [street, complement, locality, `CEP ${formatZipCode(address.zipCode)}`]
    .filter(Boolean)
    .join(' · ');
}

export default async function StorefrontDisplayPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const { store, canEdit } = await loadStorePageData(() => getStorefrontDisplaySettings(storeId));
  const settings = {
    showEstimatedTimeInHero: store.settings?.showEstimatedTimeInHero ?? true,
    showFulfillmentInHero: store.settings?.showFulfillmentInHero ?? false,
    showMinOrderValueInHero: store.settings?.showMinOrderValueInHero ?? true,
    showOpeningHoursInHero: store.settings?.showOpeningHoursInHero ?? false,
    showFullAddressInStoreInfo: store.settings?.showFullAddressInStoreInfo ?? false,
    showRecentPurchasesSection: store.settings?.showRecentPurchasesSection ?? true,
    showFeaturedProductsSection: store.settings?.showFeaturedProductsSection ?? true,
  };
  const fulfillment = [
    store.settings?.deliveryEnabled ? 'Entrega' : null,
    store.settings?.pickupEnabled ? 'Retirada' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div>
      <PageHeader
        title="Exibição no cardápio"
        description="Controle as informações da capa e a privacidade do painel Sobre a loja."
        backHref={`/dashboard/stores/${storeId}`}
      />

      <section
        className="border-border bg-surface max-w-3xl rounded-xl border p-4 sm:p-6"
        aria-label="Preferências de exibição do cardápio"
      >
        {!canEdit && (
          <ReadOnlyNotice message="Seu perfil pode consultar estas preferências, mas somente o proprietário pode alterá-las." />
        )}
        <StorefrontDisplaySettingsForm
          storeId={storeId}
          expectedConfigurationVersion={store.configurationVersion}
          settings={settings}
          preview={{
            estimatedTime: `${store.settings?.estimatedTimeMinMinutes ?? 30}–${store.settings?.estimatedTimeMaxMinutes ?? 50} min`,
            minOrderValue: store.settings?.minOrderValue ?? 0,
            fulfillment: fulfillment || null,
            hasOpeningHours: store.openingHours.length > 0,
            fullAddress: formatAddress(store.address),
          }}
          readOnly={!canEdit}
        />
      </section>
    </div>
  );
}
