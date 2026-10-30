let locks = 0;
let originalOverflow = '';

// Independent pending forms may open/close in a different order.
export function lockDialogScroll() {
  if (locks++ === 0) { originalOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
  return () => { if (--locks === 0) document.body.style.overflow = originalOverflow; };
}
