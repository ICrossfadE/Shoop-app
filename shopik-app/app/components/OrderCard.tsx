"use client";
import AnimatedNumber from "./AnimatedNumber";

import type { TaggedProduct } from "@/lib/tags";
import TagBadge from "./TagBadge";
import AuthorInfo from "./AuthorInfo";
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
}: Props) {
  const completed = product.status === "completed";
  const day = new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv" });
  const isToday =
    day.format(new Date(product.created_at)) === day.format(new Date());
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
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
      className={`product-row relative ${isToday ? "product-today" : ""}`}
      aria-busy={pending}
    >
      {/* Product details wrap on narrow screens and for long names. */}
      <div className="min-w-0 space-y-2 break-words [overflow-wrap:anywhere]">
        {pending && (
          <p role="status" className="text-sm text-muted">
            Зберігається…
          </p>
        )}
        <h3
          className={`text-lg font-semibold ${completed ? "text-muted line-through" : ""}`}
        >
          {product.name}
        </h3>
        {product.description && (
          <p className="whitespace-pre-wrap text-muted">
            {product.description}
          </p>
        )}
        <ul aria-label="Теги продукту" className="flex flex-wrap gap-2">
          {product.tags.map((tag) => (
            <li key={tag.id}>
              <TagBadge tag={tag} />
            </li>
          ))}
        </ul>
        {/* <ul
          aria-label="Теги продукту"
          className="flex absolute w-[120%] top-0 right-0 left-0"
        >
          {product.tags.map((tag) => (
            <li key={tag.id} className="flex-grow h-2">
              <div
                style={{ backgroundColor: tag.color }}
                // className="w-4 h-4 rounded-full"
                className="h-2"
              />
            </li>
          ))}
        </ul> */}
        <AuthorInfo author={author} createdAt={product.created_at} />
      </div>
      {/* Wrapping actions preserve usable buttons on mobile. */}
      <div className="product-end">
        <p className="product-price">
          <AnimatedNumber value={product.price} />{" "}
          <small className="text-muted">UAH</small>
        </p>
        <div className="mt-2 flex justify-end gap-2">
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
                {!completed && (
                  <button
                    data-menu-action
                    disabled={pending}
                    onClick={() => {
                      setOpen(false);
                      onEdit(trigger.current!);
                    }}
                  >
                    Редагувати
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
