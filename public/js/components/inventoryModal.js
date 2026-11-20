import { closeOverlay, openOverlay } from '../utils.js';

function ensureInventoryModal(root) {
  let overlay = root.querySelector('#inventoryModal');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'inventoryModal';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="modal-panel" aria-labelledby="inventoryModalTitle" aria-describedby="inventoryModalSubtitle">
      <div class="modal-header-custom">
        <div><h2 class="modal-title-custom" id="inventoryModalTitle"></h2><p class="modal-subtitle" id="inventoryModalSubtitle"></p></div>
        <button class="btn-modal-close" id="inventoryModalClose" type="button" aria-label="Cerrar ventana"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
      </div>
      <div class="modal-body-custom" id="inventoryModalBody"></div>
      <div class="modal-footer-custom" id="inventoryModalFooter"></div>
    </div>`;
  root.append(overlay);
  return overlay;
}

export function createInventoryModal(root) {
  const overlay = ensureInventoryModal(root);
  const title = root.querySelector('#inventoryModalTitle');
  const subtitle = root.querySelector('#inventoryModalSubtitle');
  const body = root.querySelector('#inventoryModalBody');
  const footer = root.querySelector('#inventoryModalFooter');

  function close() {
    closeOverlay('inventoryModal');
  }

  root.querySelector('#inventoryModalClose').addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  return {
    close,
    open(modalTitle, modalSubtitle, modalBody, modalFooter) {
      title.textContent = modalTitle;
      subtitle.textContent = modalSubtitle;
      body.replaceChildren(modalBody);
      footer.replaceChildren(...modalFooter);
      openOverlay('inventoryModal');
    },
    createButton(label, className, onClick) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.textContent = label;
      button.addEventListener('click', onClick);
      return button;
    },
  };
}
