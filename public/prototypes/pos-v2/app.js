const allowedScreens = new Set([
  'pos',
  'holds',
  'repeat',
  'customer',
  'discount',
  'no-permission',
  'terminal',
  'focus',
  'success',
]);

const params = new URLSearchParams(window.location.search);
const requestedScreen = params.get('screen') ?? 'pos';
const activeScreen = allowedScreens.has(requestedScreen) ? requestedScreen : 'pos';
document.body.dataset.screen = activeScreen;

for (const layer of document.querySelectorAll('[data-layer]')) {
  layer.hidden = layer.dataset.layer !== activeScreen;
}

const search = document.querySelector('#product-search');
const searchableProducts = [...document.querySelectorAll('[data-product]')];

function normalize(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

search?.addEventListener('input', () => {
  const terms = normalize(search.value).trim().split(/\s+/).filter(Boolean);
  for (const product of searchableProducts) {
    const matches =
      terms.length === 0 || terms.every((term) => normalize(product.textContent).includes(term));
    product.hidden = !matches;
  }
});

for (const modeButton of document.querySelectorAll('[data-mode]')) {
  modeButton.addEventListener('click', () => {
    for (const candidate of document.querySelectorAll('[data-mode]')) {
      const selected = candidate === modeButton;
      candidate.classList.toggle('selected', selected);
      candidate.setAttribute('aria-checked', String(selected));
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

const shortcutPopover = document.querySelector('.shortcut-popover');
for (const toggle of document.querySelectorAll('.help-toggle')) {
  toggle.addEventListener('click', () => {
    shortcutPopover.hidden = !shortcutPopover.hidden;
  });
}

function isTypingTarget(target) {
  return (
    target instanceof HTMLElement &&
    (target.matches('input, textarea, select') || target.isContentEditable)
  );
}

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return;
  if (event.key === '/' && search) {
    event.preventDefault();
    search.focus();
    return;
  }
  if (event.altKey && ['1', '2', '3'].includes(event.key)) {
    event.preventDefault();
    document.querySelectorAll('[data-mode]')[Number(event.key) - 1]?.click();
    return;
  }
  if (event.altKey && event.key.toLocaleLowerCase('pt-BR') === 'h') {
    event.preventDefault();
    window.location.href = '?screen=holds';
    return;
  }
  if (!event.altKey && event.key === '?') {
    event.preventDefault();
    shortcutPopover.hidden = !shortcutPopover.hidden;
  }
});

const toast = document.querySelector('.prototype-toast');
function showToast(message = 'Ação simulada no protótipo') {
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    toast.hidden = true;
  }, 1700);
}

for (const product of searchableProducts) {
  if (product.matches('button:not(:disabled)')) {
    product.addEventListener('click', () =>
      showToast(`${product.querySelector('strong')?.textContent ?? 'Item'} adicionado`),
    );
  }
}

for (const button of document.querySelectorAll('.copy-link, .recent-actions button:nth-child(2)')) {
  button.addEventListener('click', () => showToast('Link de acompanhamento copiado'));
}

for (const button of document.querySelectorAll(
  '.primary-action, .modal button, .drawer button, .mobile-order-bar button',
)) {
  if (!button.closest('.help-toggle') && !button.matches('[data-product]')) {
    button.addEventListener('click', () => showToast());
  }
}
