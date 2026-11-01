"use client";
import AnimatedNumber from "./AnimatedNumber";

import type { TaggedProduct } from "@/lib/tags";
import CompactAuthor from "./CompactAuthor";
import type { ProductAuthor } from "@/lib/identity";
import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { createPortal } from 'react-dom';

type Props = {
  product: TaggedProduct;
  pending: boolean;
  canManage?: boolean;
  author?: ProductAuthor;
  onEdit: (trigger: HTMLElement) => void;
  onStatus: () => void;
  onDelete: () => void;
  expense?: boolean;
};

// Present one persisted product and its explicit edit, completion and delete actions.
export default function OrderCard({
  product,
  canManage = false,
  author,
  pending,
  onEdit,
  onStatus,
  onDelete,
  expense = false,
}: Props) {
  const completed = product.status === "completed";
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const held = useRef(false);
  // Cancel long press on scroll, pointer movement, release and unmount.
  function cancelHold() { if (hold.current) clearTimeout(hold.current); hold.current = null; }
  useEffect(() => {
    document.addEventListener('scroll', cancelHold, true);
    return () => { cancelHold(); document.removeEventListener('scroll', cancelHold, true); };
  }, []);
  // Close outside the menu, restoring keyboard focus on Escape.
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector("button")?.focus();
    function outside(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  // The native top layer escapes overflow and card stacking contexts; flip above at the bottom edge.
  useLayoutEffect(() => {
    if (!open || !panel.current || !trigger.current) return;
    const element = panel.current;
    element.showPopover();
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor) return;
      const height = element.getBoundingClientRect().height;
      element.style.left = `${Math.max(8, Math.min(anchor.right - element.offsetWidth, window.innerWidth - element.offsetWidth - 8))}px`;
      element.style.top = `${Math.max(8, anchor.bottom + height + 8 <= window.innerHeight ? anchor.bottom + 4 : anchor.top - height - 4)}px`;
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { element.hidePopover();window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true); };
  },[open]);
  return (
    <article
      className={`product-row compact-product ${expense ? 'expense-row' : ''}`}
      aria-busy={pending}
      onPointerDown={event => {
        held.current = false;
        if (!canManage || pending || event.button !== 0 || !event.isPrimary || (event.target as HTMLElement).closest('button')) return;
        origin.current = { x: event.clientX, y: event.clientY };
        cancelHold();
        hold.current = setTimeout(() => { held.current = true; setOpen(true); }, 550);
      }}
      onPointerMove={event => { if (Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 8) cancelHold(); }}
      onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold}
      onContextMenu={event => { if (canManage) { event.preventDefault(); cancelHold(); setOpen(true); } }}
      onClickCapture={event => {
        if (!held.current) return;
        held.current = false;
        // Some touch browsers omit the release click. Do not consume the user's
        // next deliberate menu action when that synthetic click never arrives.
        if (panel.current?.contains(event.target as Node)) return;
        event.preventDefault(); event.stopPropagation();
      }}
    >
      {/* Two compact rows: purchase name followed by author and local date. */}
      <div className="compact-details">
        <h3 className="font-semibold">{product.name}</h3>
        <CompactAuthor author={author} timestamp={product.created_at} />
        {pending && <span role="status" className="sr-only">Зберігається…</span>}
      </div>
      {/* Wrapping actions preserve usable buttons on mobile. */}
      <div className="product-end compact-end">
        <p className="product-price">
          <AnimatedNumber value={product.price} />{" "}

        </p>
        <div className="compact-actions">
          {!completed && (
            <button
              disabled={pending}
              onClick={onStatus}
              aria-label={`Завершити ${product.name}`}
              className="icon-action"
            >
              ✓
            </button>
          )}
          {canManage && <div
            ref={menu}
            className="product-menu"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
                trigger.current?.focus();
              }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const buttons = Array.from(
                  panel.current?.querySelectorAll<HTMLButtonElement>(
                    "[data-menu-action]",
                  ) ?? [],
                );
                const index = buttons.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
                buttons[
                  (index +
                    (event.key === "ArrowDown" ? 1 : buttons.length - 1)) %
                    buttons.length
                ]?.focus();
              }
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget) && !panel.current?.contains(event.relatedTarget))
                setOpen(false);
            }}
          >
            <button
              ref={trigger}
              disabled={pending}
              aria-label={`Дії: ${product.name}`}
              aria-expanded={open}
              aria-controls={menuId}
              onClick={() => setOpen(!open)}
              className="icon-action"
            >
              ⋯
            </button>
            {open && createPortal((
              <div
                ref={panel}
                popover="auto"
                onToggle={event=>{if(event.newState==='closed')setOpen(false);}}
                id={menuId}
                className="product-menu-panel"
                style={{position:'fixed',inset:'auto',margin:0,maxWidth:'calc(100vw - 16px)',maxHeight:'calc(100dvh - 16px)',overflowY:'auto'}}
                aria-label="Дії продукту"
              >
                {(!completed || expense) && (
                  <button
                    data-menu-action
                    disabled={pending}
                    onClick={() => {
                      setOpen(false);
                      onEdit(trigger.current!);
                    }}
                  >
                    {expense ? 'Змінити ціну' : 'Редагувати'}
                  </button>
                )}
                <button
                  data-menu-action
                  disabled={pending}
                  onClick={() => {
                    setOpen(false);
                    trigger.current?.focus();
                    onDelete();
                  }}
                  className="text-danger"
                >
                  Видалити
                </button>
              </div>
            ),document.body)}
          </div>}
        </div>
      </div>
    </article>
  );
}
