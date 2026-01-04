const modalBackdrop = document.getElementById("modal-confirm");
const modalContent = modalBackdrop.querySelector(".modal-content");
let confirmCallback = null;

/**
 * Показывает кастомное модальное окно подтверждения
 * @param {string} message - Текст сообщения для пользователя
 * @param {function} onConfirm - Функция, которая будет вызвана при нажатии "Да"
 */
function showConfirmModal(message, onConfirm) {
  confirmCallback = onConfirm;

  modalContent.innerHTML = `
        <div class="modal-header">Подтверждение действия</div>
        <div class="modal-body">${message}</div>
        <div class="modal-footer">
            <button id="modal-confirm-yes" class="btn btn-danger">Да</button>
            <button id="modal-confirm-no" class="btn btn-secondary">Отмена</button>
        </div>
    `;

  modalBackdrop.classList.remove("hidden");

  // Назначаем обработчики кнопок
  document
    .getElementById("modal-confirm-yes")
    .addEventListener("click", handleConfirmYes);
  document
    .getElementById("modal-confirm-no")
    .addEventListener("click", hideConfirmModal);

  // Скрытие при клике вне окна (если нужно, но лучше избегать для критических действий)
  // modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) hideConfirmModal(); });
}

window.confirmModal = function confirmModal(message) {
  return new Promise((resolve) => {
    showConfirmModal(message, () => resolve(true));

    // Перехват “Отмена”
    const noBtn = document.getElementById("modal-confirm-no");
    if (noBtn) {
      noBtn.addEventListener("click", () => resolve(false), { once: true });
    }
  });
};

function handleConfirmYes() {
  if (confirmCallback) {
    confirmCallback(); // Вызываем переданную функцию (например, handleDelete)
  }
  hideConfirmModal();
}

function hideConfirmModal() {
  modalBackdrop.classList.add("hidden");
  confirmCallback = null; // Очищаем callback
}
