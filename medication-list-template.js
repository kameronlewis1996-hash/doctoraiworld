document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('print-template')?.addEventListener('click', () => window.print());
  document.getElementById('download-csv')?.addEventListener('click', () => {
    const csv = '\uFEFFName as shown on label,Strength or form shown on label,Directions shown on label,Questions for my care team\r\n';
    const file = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'medication-list-template.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
});
