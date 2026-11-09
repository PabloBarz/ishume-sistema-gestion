import { closeOverlay, openOverlay } from '../utils.js';

export function createInventoryModal(root) {
  const overlay = root.querySelector('#inventoryModal');
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
