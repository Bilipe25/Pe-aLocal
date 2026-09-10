import { createRoot } from 'react-dom/client';
import { StorefrontOffers } from '@/components/storefront/storefront-offers';
import { ProductCard } from '@/components/storefront/product-card';
import { createDefaultCustomization } from '@/features/customization/domain';
import { getStorefrontThemeStyle } from '@/features/customization/theme';
import { useCartStore } from '@/stores/cart-store';
import { fixedOffer, flexibleOffer } from '../storefront-offers';
import '@/app/globals.css';

useCartStore.getState().setStore('offers-preview', 'offers-preview');
const product = fixedOffer.components[0].product;
const config = createDefaultCustomization();

createRoot(document.getElementById('root')!).render(
  <div className="storefront-theme" style={getStorefrontThemeStyle(config)}>
    <header className="storefront-catalog">
      <h1>Validação isolada de ofertas</h1>
      <p>Dados de teste. Nenhum pedido é enviado.</p>
    </header>
    <StorefrontOffers offers={[fixedOffer, flexibleOffer]} storeOpen onProductClick={() => {}} />
    <main className="storefront-catalog">
      <h2 className="storefront-section-title">Hambúrgueres</h2>
      <ProductCard {...product} promotionalPrice={2000} showImage showBadges onClick={() => {}} />
    </main>
  </div>,
);
