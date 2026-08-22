const allowedScreens = new Set([
  'pos',
  'product',
  'delivery',
  'table',
  'payment',
  'success',
  'kds',
]);
const params = new URLSearchParams(window.location.search);
const requested = params.get('screen') ?? 'pos';
const activeScreen = allowedScreens.has(requested) ? requested : 'pos';

for (const screen of document.querySelectorAll('.screen')) {
  screen.hidden = screen.id !== activeScreen;
}
document.body.dataset.screen = activeScreen;

for (const button of document.querySelectorAll('[data-mode]')) {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode;
    if (mode === 'delivery') window.location.href = '?screen=delivery';
    if (mode === 'table') window.location.href = '?screen=table';
    if (mode === 'pickup') {
      for (const candidate of document.querySelectorAll('[data-mode]')) {
        candidate.classList.toggle('selected', candidate === button);
      }
    }
  });
}

const search = document.querySelector('#product-search');
search?.addEventListener('input', () => {
  const terms = search.value.toLocaleLowerCase('pt-BR').trim().split(/\s+/).filter(Boolean);
  for (const tile of document.querySelectorAll('.product-tile')) {
    const searchable = tile.textContent.toLocaleLowerCase('pt-BR');
    tile.classList.toggle(
      'is-filtered',
      terms.length > 0 && !terms.every((term) => searchable.includes(term)),
    );
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'F2' && search) {
    event.preventDefault();
    search.focus();
  }
});

const toast = document.querySelector('.prototype-toast');
for (const button of document.querySelectorAll('.quick-add')) {
  button.addEventListener('click', () => {
    if (!toast) return;
    toast.hidden = false;
    window.setTimeout(() => {
      toast.hidden = true;
    }, 1800);
  });
}

function syncChoiceRows(container) {
  for (const row of container.querySelectorAll('label')) {
    const input = row.querySelector('input');
    row.classList.toggle('selected', Boolean(input?.checked));
    let check = row.querySelector('svg');
    if (input?.checked && !check) {
      check = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      check.innerHTML = '<use href="#i-check"></use>';
      row.append(check);
    }
    if (!input?.checked && check) check.remove();
  }
}

for (const group of document.querySelectorAll('.payment-methods, .payment-timing')) {
  group.addEventListener('change', () => syncChoiceRows(group));
}

for (const group of document.querySelectorAll('.dialog-scroll fieldset')) {
  group.addEventListener('change', () => syncChoiceRows(group));
}

for (const address of document.querySelectorAll('.address-option')) {
  address.addEventListener('change', () => {
    for (const candidate of document.querySelectorAll('.address-option')) {
      candidate.classList.toggle('selected', Boolean(candidate.querySelector('input')?.checked));
    }
  });
}

for (const category of document.querySelectorAll('.category-strip button')) {
  category.addEventListener('click', () => {
    for (const candidate of document.querySelectorAll('.category-strip button')) {
      const selected = candidate === category;
      candidate.classList.toggle('selected', selected);
      candidate.setAttribute('aria-selected', String(selected));
    }
  });
}
