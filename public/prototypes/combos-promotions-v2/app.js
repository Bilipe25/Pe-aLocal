const screens = new Set(['merchant', 'builder', 'storefront', 'flexible', 'cart']);
const params = new URLSearchParams(window.location.search);
const requestedScreen = params.get('screen') ?? 'merchant';
const activeScreen = screens.has(requestedScreen) ? requestedScreen : 'merchant';

for (const screen of document.querySelectorAll('.screen')) {
  screen.hidden = screen.id !== activeScreen;
}

document.body.dataset.screen = activeScreen;

for (const button of document.querySelectorAll('[data-filter]')) {
  button.addEventListener('click', () => {
    const filter = button.dataset.filter;
    for (const candidate of document.querySelectorAll('[data-filter]')) {
      candidate.classList.toggle('selected', candidate === button);
    }
    for (const row of document.querySelectorAll('.offer-row')) {
      row.classList.toggle('is-filtered', filter !== 'all' && row.dataset.status !== filter);
    }
  });
}

const publishButton = document.querySelector('#publish-offer');
const publishToast = document.querySelector('.prototype-toast');

publishButton?.addEventListener('click', () => {
  if (!publishToast) return;
  publishToast.hidden = false;
  publishButton.textContent = 'Pronta para publicar';
  publishButton.setAttribute('aria-disabled', 'true');
  window.setTimeout(() => {
    publishToast.hidden = true;
  }, 3200);
});

const formatCurrency = (cents) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

function updateComboSelection() {
  const selectedSide = document.querySelector('input[name="side"]:checked');
  const selectedDrink = document.querySelector('input[name="drink"]:checked');
  const selectedInputs = [selectedSide, selectedDrink].filter(Boolean);
  const extra = selectedInputs.reduce(
    (total, input) => total + Number(input.dataset.extra ?? 0),
    0,
  );
  const summary = document.querySelector('#choice-summary');
  const total = document.querySelector('#combo-total');

  if (summary) summary.textContent = selectedInputs.map((input) => input.value).join(' · ');
  if (total) total.textContent = formatCurrency(2990 + extra);

  for (const row of document.querySelectorAll('.option-row')) {
    const input = row.querySelector('input[type="radio"]');
    row.classList.toggle('selected', Boolean(input?.checked));
  }
}

for (const input of document.querySelectorAll('.option-row input[type="radio"]')) {
  input.addEventListener('change', updateComboSelection);
}

updateComboSelection();
