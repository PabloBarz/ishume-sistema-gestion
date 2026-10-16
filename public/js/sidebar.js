// Referencias del menú lateral y del área principal; no gestionan la navegación SPA.
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');
const openButton = document.getElementById('btnToggleSidebar');
const closeButton = document.getElementById('btnCloseSidebar');
const main = document.querySelector('.main-content');
const mobile = window.matchMedia('(max-width: 768px)');

function closeMenu(restoreFocus = true) {
  const wasOpen = sidebar.classList.contains('open');
  sidebar.classList.remove('open');
  overlay.hidden = true;
  openButton.setAttribute('aria-expanded', 'false');
  document.documentElement.classList.remove('sidebar-open');
  document.body.classList.remove('sidebar-open');
  main.inert = false;

  if (mobile.matches) {
    sidebar.setAttribute('aria-hidden', 'true');
    sidebar.inert = true;
  } else {
    sidebar.removeAttribute('aria-hidden');
    sidebar.inert = false;
  }
  sidebar.removeAttribute('role');
  sidebar.removeAttribute('aria-modal');

  if (wasOpen && restoreFocus && mobile.matches) openButton.focus();
}

function openMenu() {
  if (!mobile.matches) return;
  sidebar.inert = false;
  sidebar.removeAttribute('aria-hidden');
  sidebar.setAttribute('role', 'dialog');
  sidebar.setAttribute('aria-modal', 'true');
  sidebar.classList.add('open');
  overlay.hidden = false;
  openButton.setAttribute('aria-expanded', 'true');
  document.documentElement.classList.add('sidebar-open');
  document.body.classList.add('sidebar-open');
  main.inert = true;
  closeButton.focus();
}

function syncLayout() {
  const focusWasInSidebar = sidebar.contains(document.activeElement);
  closeMenu(false);
  if (focusWasInSidebar) {
    if (mobile.matches) openButton.focus();
    else main.focus();
  }
}

openButton.addEventListener('click', () => {
  if (sidebar.classList.contains('open')) closeMenu();
  else openMenu();
});
closeButton.addEventListener('click', () => closeMenu());
overlay.addEventListener('click', () => closeMenu());

document.addEventListener('keydown', (event) => {
  if (!sidebar.classList.contains('open')) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    closeMenu();
  } else if (event.key === 'Tab') {
    const focusable = [...sidebar.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first) {
      event.preventDefault();
      closeButton.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (!sidebar.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    }
  }
});

mobile.addEventListener('change', syncLayout);
syncLayout();
