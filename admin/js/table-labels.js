/**
 * Copies each column heading onto its body cells as data-label, so narrow screens can show
 * a table row as a stacked card with a label beside each value (see .stack-table in admin.css).
 */
export function labelCells(tbody) {
  const table = tbody?.closest("table");
  if (!table) return;
  const headings = [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim());
  for (const row of tbody.rows) {
    [...row.cells].forEach((cell, i) => {
      if (cell.colSpan === 1 && headings[i]) cell.dataset.label = headings[i];
    });
  }
}
