document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('print-checklist')?.addEventListener('click', () => window.print());
  document.getElementById('clear-checklist')?.addEventListener('click', () => {
    document.querySelectorAll('.page-main input').forEach((input) => {
      if (input.type === 'checkbox') input.checked = false;
      else input.value = '';
    });
    const status = document.getElementById('checklist-status');
    if (status) status.textContent = 'Entries cleared from this page.';
  });
});
