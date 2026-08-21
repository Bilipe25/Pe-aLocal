const icon = (name, className = "icon") =>
  `<svg class="${className}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const navItems = [
  ["grid", "Visão geral"],
  ["orders", "Central"],
  ["kitchen", "Cozinha"],
  ["store", "Salão"],
  ["bag", "Catálogo"],
  ["tag", "Ofertas", true],
  ["coupon", "Cupons"],
  ["chart", "Relatórios"],
  ["truck", "Entrega"],
  ["store", "Minha loja"],
];

function merchantShell(content, active = "Ofertas") {
  const nav = navItems
    .map(
      ([itemIcon, label]) => `
        <a class="nav-item ${active === label ? "active" : ""}" href="${label === "Ofertas" ? "?screen=merchant" : "#"}" title="${label}">
          ${icon(itemIcon)}<span>${label}</span>
        </a>`,
    )
    .join("");

  return `
    <div class="merchant-app">
      <aside class="sidebar">
        <a class="brand" href="?screen=merchant" aria-label="PedidoLocal">
          <span class="brand-mark">p</span><span>PedidoLocal</span>
        </a>
        <nav aria-label="Navegação principal">${nav}</nav>
        <div class="store-switcher">
          <span class="store-avatar">HJ</span>
          <span><strong>Hamburgueria João</strong><small>Aberta para pedidos</small></span>
          ${icon("chevron")}
        </div>
      </aside>
      <section class="merchant-main">
        <header class="merchant-topbar">
          <button class="mobile-brand" type="button"><span class="brand-mark">p</span><span>PedidoLocal</span></button>
          <span class="context-name">Hamburgueria João</span>
          <div class="user-avatar" aria-label="Conta de João">JS</div>
        </header>
        ${content}
      </section>
    </div>`;
}

function offerRow({ type, title, detail, current, original, saving, schedule, status }) {
  return `
    <article class="offer-row">
      <div class="offer-type-icon ${type === "Combo" ? "combo" : "promotion"}">${icon(type === "Combo" ? "bag" : "tag")}</div>
      <div class="offer-identity">
        <div class="row-title"><h3>${title}</h3><span class="type-label">${type}</span></div>
        <p>${detail}</p>
      </div>
      <div class="offer-price">
        <span>${original}</span><strong>${current}</strong><small>${saving}</small>
      </div>
      <div class="offer-schedule">${icon("clock")}<span>${schedule}</span></div>
      <span class="status ${status === "Ativa" ? "active" : "paused"}"><i></i>${status}</span>
      <button class="icon-button" type="button" aria-label="Mais ações">${icon("more")}</button>
    </article>`;
}

function merchantOverview() {
  return merchantShell(`
    <div class="page-wrap offers-page">
      <div class="page-heading">
        <div><span class="eyebrow">Venda mais com simplicidade</span><h1>Ofertas</h1><p>Monte combos e preços promocionais para aparecerem direto no seu cardápio.</p></div>
        <a class="button primary" href="?screen=choose">${icon("plus")}Criar oferta</a>
      </div>
      <div class="offer-toolbar">
        <div class="tabs" role="tablist" aria-label="Filtrar ofertas">
          <button class="selected" type="button">Todas <span>3</span></button>
          <button type="button">Combos <span>2</span></button>
          <button type="button">Promoções <span>1</span></button>
        </div>
      </div>
      <section class="offer-list" aria-label="Ofertas cadastradas">
        <div class="list-header"><span>Oferta</span><span>Preço</span><span>Disponibilidade</span><span>Status</span><span></span></div>
        ${offerRow({ type: "Combo", title: "Combo X-Bacon", detail: "X-Bacon + Batata P + Refrigerante", original: "R$ 52,80", current: "R$ 46,90", saving: "Economia de R$ 5,90", schedule: "Todos os dias", status: "Ativa" })}
        ${offerRow({ type: "Promoção", title: "X-Tudo com preço especial", detail: "X-Tudo", original: "R$ 32,90", current: "R$ 27,90", saving: "R$ 5,00 a menos", schedule: "Sex e sáb · 18h–23h", status: "Ativa" })}
        ${offerRow({ type: "Combo", title: "Dupla da casa", detail: "2 X-Salada + 2 Refrigerantes", original: "R$ 68,00", current: "R$ 59,90", saving: "Economia de R$ 8,10", schedule: "Todos os dias", status: "Pausada" })}
      </section>
      <div class="list-footnote"><span>2 ofertas ativas no cardápio</span><span>Valores e disponibilidade são conferidos novamente no fechamento do pedido.</span></div>
    </div>`);
}

function offerChooser() {
  return merchantShell(`
    <div class="page-wrap narrow-page">
      <a class="back-link" href="?screen=merchant">${icon("back")}Voltar para ofertas</a>
      <div class="simple-heading"><span class="eyebrow">Nova oferta</span><h1>O que você quer criar?</h1><p>Escolha um formato. Você confere tudo na própria tela antes de publicar.</p></div>
      <div class="choice-list">
        <a class="choice-row" href="?screen=combo">
          <span class="choice-icon combo">${icon("bag")}</span>
          <span><strong>Combo</strong><small>Junte dois ou mais itens por um preço especial.</small></span>
          ${icon("arrow")}
        </a>
        <a class="choice-row" href="?screen=promotion">
          <span class="choice-icon promotion">${icon("tag")}</span>
          <span><strong>Promoção de produto</strong><small>Dê um preço promocional a um produto do cardápio.</small></span>
          ${icon("arrow")}
        </a>
      </div>
      <p class="choice-note">Cupons por código continuam sendo gerenciados separadamente em <strong>Cupons</strong>.</p>
    </div>`);
}

function comboEditor() {
  return merchantShell(`
    <div class="editor-page">
      <header class="editor-heading">
        <div><a class="back-link" href="?screen=choose">${icon("back")}Escolher outro formato</a><h1>Criar combo</h1><p>Junte itens do cardápio e defina o preço especial.</p></div>
        <div class="editor-actions"><a class="button secondary" href="?screen=merchant">Cancelar</a><button class="button primary" type="button" data-toast="Combo publicado no cardápio">Publicar combo</button></div>
      </header>
      <div class="editor-layout">
        <form class="editor-form" onsubmit="return false">
          <section class="form-section">
            <div class="section-heading"><span class="step-index">1</span><div><h2>Identificação</h2><p>Como o combo aparecerá no cardápio.</p></div></div>
            <label class="field"><span>Nome do combo</span><input type="text" value="Combo X-Bacon" maxlength="70" /><small>13 de 70 caracteres</small></label>
            <label class="field"><span>Descrição <em>opcional</em></span><textarea rows="2">Um clássico completo para matar a fome.</textarea></label>
          </section>
          <section class="form-section">
            <div class="section-heading"><span class="step-index">2</span><div><h2>Itens do combo</h2><p>Escolha pelo menos dois itens. Os adicionais continuam sendo cobrados à parte.</p></div></div>
            <div class="selected-products">
              <div class="selected-product"><img src="./combo-x-bacon.png" alt="X-Bacon" /><span><strong>X-Bacon</strong><small>R$ 29,90</small></span><div class="quantity"><button type="button" aria-label="Diminuir">−</button><b>1</b><button type="button" aria-label="Aumentar">+</button></div><button class="remove-button" type="button" aria-label="Remover X-Bacon">${icon("close")}</button></div>
              <div class="selected-product"><span class="product-placeholder fries">B</span><span><strong>Batata frita P</strong><small>R$ 12,90</small></span><div class="quantity"><button type="button" aria-label="Diminuir">−</button><b>1</b><button type="button" aria-label="Aumentar">+</button></div><button class="remove-button" type="button" aria-label="Remover Batata frita P">${icon("close")}</button></div>
              <div class="selected-product"><span class="product-placeholder drink">R</span><span><strong>Refrigerante lata</strong><small>R$ 10,00</small></span><div class="quantity"><button type="button" aria-label="Diminuir">−</button><b>1</b><button type="button" aria-label="Aumentar">+</button></div><button class="remove-button" type="button" aria-label="Remover Refrigerante lata">${icon("close")}</button></div>
            </div>
            <button class="add-product" type="button">${icon("plus")}Adicionar outro produto</button>
          </section>
          <section class="form-section pricing-section">
            <div class="section-heading"><span class="step-index">3</span><div><h2>Preço</h2><p>O preço dos itens acompanha o cardápio. O preço especial só muda quando você editar.</p></div></div>
            <div class="price-fields">
              <label class="field readonly"><span>Itens separados</span><div class="money-input"><span>R$</span><input value="52,80" readonly /></div></label>
              <label class="field"><span>Preço do combo</span><div class="money-input focus"><span>R$</span><input id="combo-price" inputmode="decimal" value="46,90" /></div></label>
            </div>
            <div id="saving-message" class="saving-message">${icon("check")}Seu cliente economiza <strong>R$ 5,90</strong> neste combo.</div>
          </section>
        </form>
        <aside class="editor-summary">
          <span class="summary-kicker">Prévia do preço</span>
          <h2>Combo X-Bacon</h2>
          <ul><li><span>1× X-Bacon</span><span>R$ 29,90</span></li><li><span>1× Batata frita P</span><span>R$ 12,90</span></li><li><span>1× Refrigerante lata</span><span>R$ 10,00</span></li></ul>
          <div class="summary-total"><span>Itens separados</span><s>R$ 52,80</s><span>Preço no cardápio</span><strong id="summary-price">R$ 46,90</strong></div>
          <p>${icon("check")}Opções e adicionais entram normalmente no pedido.</p>
        </aside>
      </div>
    </div>`);
}

function promotionEditor() {
  return merchantShell(`
    <div class="editor-page">
      <header class="editor-heading">
        <div><a class="back-link" href="?screen=choose">${icon("back")}Escolher outro formato</a><h1>Criar promoção</h1><p>Escolha um produto, um preço e quando a promoção ficará disponível.</p></div>
        <div class="editor-actions"><a class="button secondary" href="?screen=merchant">Cancelar</a><button class="button primary" type="button" data-toast="Promoção publicada no cardápio">Publicar promoção</button></div>
      </header>
      <div class="editor-layout">
        <form class="editor-form" onsubmit="return false">
          <section class="form-section">
            <div class="section-heading"><span class="step-index">1</span><div><h2>Produto</h2><p>Um produto só pode ter uma promoção ativa no mesmo horário.</p></div></div>
            <label class="field"><span>Produto do cardápio</span><button class="select-control" type="button"><span><strong>X-Tudo</strong><small>Lanches · R$ 32,90</small></span>${icon("chevron")}</button></label>
          </section>
          <section class="form-section pricing-section">
            <div class="section-heading"><span class="step-index">2</span><div><h2>Preço promocional</h2><p>Adicionais mantêm seus valores normais.</p></div></div>
            <div class="price-fields">
              <label class="field readonly"><span>Preço atual</span><div class="money-input"><span>R$</span><input value="32,90" readonly /></div></label>
              <label class="field"><span>Preço promocional</span><div class="money-input focus"><span>R$</span><input value="27,90" /></div></label>
            </div>
            <div class="saving-message">${icon("check")}Seu cliente economiza <strong>R$ 5,00</strong> por unidade.</div>
          </section>
          <section class="form-section">
            <div class="section-heading"><span class="step-index">3</span><div><h2>Disponibilidade</h2><p>As datas e horas seguem o horário de Fortaleza.</p></div></div>
            <div class="segmented"><button type="button">Sempre</button><button class="selected" type="button">Programar</button></div>
            <div class="field-row"><label class="field"><span>Começa em</span><input type="date" value="2026-08-21" /></label><label class="field"><span>Termina em</span><input type="date" value="2026-08-31" /></label></div>
            <fieldset class="days"><legend>Dias da semana</legend><label><input type="checkbox" /><span>Seg</span></label><label><input type="checkbox" /><span>Ter</span></label><label><input type="checkbox" /><span>Qua</span></label><label><input type="checkbox" /><span>Qui</span></label><label><input type="checkbox" checked /><span>Sex</span></label><label><input type="checkbox" checked /><span>Sáb</span></label><label><input type="checkbox" /><span>Dom</span></label></fieldset>
            <div class="field-row"><label class="field"><span>Das</span><input type="time" value="18:00" /></label><label class="field"><span>Até</span><input type="time" value="23:00" /></label></div>
          </section>
        </form>
        <aside class="editor-summary promotion-summary">
          <span class="summary-kicker">Resumo</span><span class="preview-type">Promoção de produto</span><h2>X-Tudo</h2>
          <div class="promo-preview-price"><s>R$ 32,90</s><strong>R$ 27,90</strong><span>Economize R$ 5,00</span></div>
          <div class="availability-box">${icon("clock")}<span><strong>De 21 a 31 de agosto</strong><small>Sextas e sábados, das 18h às 23h</small></span></div>
          <p>${icon("check")}A promoção aparece e termina automaticamente.</p>
        </aside>
      </div>
    </div>`);
}

function storefrontHeader({ title = "Hamburgueria João", back = false, cartCount = 0 } = {}) {
  return `<header class="storefront-header">
    ${back ? `<a class="round-button" href="?screen=storefront" aria-label="Voltar">${icon("back")}</a>` : `<span class="store-logo">HJ</span>`}
    <span class="storefront-title"><strong>${title}</strong>${back ? "" : "<small>Aberta · 25–40 min</small>"}</span>
    <a class="round-button cart-button" href="?screen=cart" aria-label="Abrir sacola">${icon("cart")}${cartCount ? `<b>${cartCount}</b>` : ""}</a>
  </header>`;
}

function mobileFrame(content, className = "") {
  return `<div class="mobile-canvas ${className}"><div class="phone-status"><span>9:41</span><span>••• 5G ▰</span></div>${content}</div>`;
}

function storefront() {
  return mobileFrame(`
    ${storefrontHeader()}
    <main class="storefront-body">
      <div class="storefront-intro"><h1>Feito na chapa,<br />do jeito que você gosta.</h1><p>Lanches artesanais e porções para compartilhar.</p></div>
      <nav class="category-strip" aria-label="Categorias"><a class="active" href="#offers">Ofertas</a><a href="#">Lanches</a><a href="#">Porções</a><a href="#">Bebidas</a></nav>
      <section id="offers" class="store-offers">
        <div class="section-title"><div><span>Vale a pena</span><h2>Ofertas</h2></div><small>2 disponíveis</small></div>
        <article class="featured-combo">
          <img src="./combo-x-bacon.png" alt="X-Bacon, batata frita e refrigerante" />
          <div class="featured-copy"><span class="offer-pill">Combo</span><h3>Combo X-Bacon</h3><p>X-Bacon + Batata P + Refrigerante lata</p><div class="store-price"><span><s>R$ 52,80</s><strong>R$ 46,90</strong></span><small>Economize R$ 5,90</small></div><a class="button storefront-cta" href="?screen=configure">Escolher opções ${icon("arrow")}</a></div>
        </article>
        <article class="compact-promotion"><div><span class="offer-pill promotion">Preço especial</span><h3>X-Tudo</h3><p>Sexta e sábado, das 18h às 23h</p></div><div class="compact-price"><s>R$ 32,90</s><strong>R$ 27,90</strong></div><button class="compact-action" type="button">Ver</button></article>
      </section>
      <section class="regular-products"><div class="section-title"><div><span>Mais pedidos</span><h2>Lanches</h2></div></div><article class="regular-product"><span class="regular-product-photo">XS</span><div><h3>X-Salada</h3><p>Hambúrguer, queijo, salada e molho da casa</p><strong>R$ 24,90</strong></div><button class="compact-action" type="button">Ver</button></article></section>
    </main>
  `, "storefront-screen");
}

function configureCombo() {
  return mobileFrame(`
    ${storefrontHeader({ title: "Montar combo", back: true, cartCount: 1 })}
    <main class="config-body">
      <img class="config-hero" src="./combo-x-bacon.png" alt="Combo X-Bacon" />
      <div class="config-intro"><span class="offer-pill">Combo</span><h1>Combo X-Bacon</h1><p>Escolha as opções de cada item. Os adicionais são cobrados à parte.</p><div class="config-price"><strong>R$ 46,90</strong><span><s>R$ 52,80</s> · economize R$ 5,90</span></div></div>
      <section class="component-section"><header><span><small>1 de 3</small><h2>X-Bacon</h2></span><span class="required">Obrigatório</span></header><fieldset><legend>Ponto da carne</legend><label class="option-row"><input type="radio" name="point" checked /><span><strong>Ao ponto</strong><small>Mais pedido</small></span><b>Incluído</b></label><label class="option-row"><input type="radio" name="point" /><span><strong>Bem passada</strong></span><b>Incluído</b></label></fieldset><fieldset><legend>Quer adicionar?</legend><label class="option-row"><input type="checkbox" checked /><span><strong>Bacon extra</strong></span><b>+ R$ 4,00</b></label></fieldset></section>
      <section class="component-section"><header><span><small>2 de 3</small><h2>Batata frita P</h2></span><span class="done">${icon("check")}Incluída</span></header></section>
      <section class="component-section"><header><span><small>3 de 3</small><h2>Refrigerante lata</h2></span><span class="required">Obrigatório</span></header><fieldset><legend>Escolha o sabor</legend><label class="option-row"><input type="radio" name="drink" checked /><span><strong>Coca-Cola</strong></span><b>Incluído</b></label><label class="option-row"><input type="radio" name="drink" /><span><strong>Coca-Cola Zero</strong></span><b>Incluído</b></label></fieldset></section>
      <div class="mobile-action-bar"><div><span>Total</span><strong>R$ 50,90</strong></div><a class="button storefront-cta" href="?screen=cart">Adicionar à sacola</a></div>
    </main>
  `, "config-screen");
}

function cart() {
  return mobileFrame(`
    ${storefrontHeader({ title: "Sua sacola", back: true })}
    <main class="cart-body">
      <div class="cart-heading"><h1>Revise seu pedido</h1><p>Confira os itens antes de continuar.</p></div>
      <article class="cart-combo">
        <header><span class="offer-pill">Combo</span><button type="button">Editar</button></header>
        <div class="cart-line"><img src="./combo-x-bacon.png" alt="Combo X-Bacon" /><span><strong>Combo X-Bacon</strong><small>1 unidade</small></span><b>R$ 46,90</b></div>
        <ul class="combo-components"><li><span>1× X-Bacon</span><small>Ao ponto · Bacon extra</small><b>+ R$ 4,00</b></li><li><span>1× Batata frita P</span><small>Incluída</small></li><li><span>1× Refrigerante lata</span><small>Coca-Cola</small></li></ul>
        <div class="cart-item-foot"><div class="quantity"><button type="button">−</button><b>1</b><button type="button">+</button></div><strong>R$ 50,90</strong></div>
      </article>
      <button class="coupon-row" type="button">${icon("coupon")}<span><strong>Tem um cupom?</strong><small>Digite o código no próximo passo</small></span>${icon("arrow")}</button>
      <section class="cart-summary"><h2>Resumo</h2><dl><div><dt>Itens e adicionais</dt><dd>R$ 56,80</dd></div><div class="saving"><dt>${icon("tag")}Economia no combo</dt><dd>− R$ 5,90</dd></div><div><dt>Entrega</dt><dd>Calculada a seguir</dd></div><div class="total"><dt>Total parcial</dt><dd>R$ 50,90</dd></div></dl></section>
      <div class="mobile-action-bar cart-action"><div><span>Total parcial</span><strong>R$ 50,90</strong></div><button class="button storefront-cta" type="button">Ir para entrega</button></div>
    </main>
  `, "cart-screen");
}

const screens = {
  merchant: merchantOverview,
  choose: offerChooser,
  combo: comboEditor,
  promotion: promotionEditor,
  storefront,
  configure: configureCombo,
  cart,
};

const params = new URLSearchParams(window.location.search);
const requestedScreen = params.get("screen") || "merchant";
const render = screens[requestedScreen] || screens.merchant;
document.getElementById("prototype").innerHTML = render();
document.body.dataset.screen = requestedScreen;

const comboPriceInput = document.getElementById("combo-price");
if (comboPriceInput) {
  const message = document.getElementById("saving-message");
  const summary = document.getElementById("summary-price");
  comboPriceInput.addEventListener("input", () => {
    const parsed = Number(comboPriceInput.value.replace(".", "").replace(",", "."));
    if (!Number.isFinite(parsed)) return;
    summary.textContent = money.format(parsed);
    const saving = 52.8 - parsed;
    message.classList.toggle("warning", saving <= 0);
    message.innerHTML = saving > 0
      ? `${icon("check")}Seu cliente economiza <strong>${money.format(saving)}</strong> neste combo.`
      : `Defina um valor menor que ${money.format(52.8)} para criar uma economia real.`;
  });
}

document.querySelectorAll("[data-toast]").forEach((button) => {
  button.addEventListener("click", () => {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.textContent = button.dataset.toast;
    document.body.append(toast);
    window.setTimeout(() => toast.remove(), 2600);
  });
});
