'use client';
import type { ComponentProps } from 'react';
import { navigateList } from '@/lib/use-list';

// Keep real URLs, new tabs and no-JS navigation; ordinary clicks switch the shell.
export default function ScreenLink({ href, onClick, ...props }: ComponentProps<'a'> & { href: string }) {
  return <a {...props} href={href} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target || props.download) return;
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin || !['/', '/expenses', '/settings'].includes(url.pathname)) return;
    event.preventDefault();
    navigateList(url.pathname + url.search + url.hash);
    if (url.hash) requestAnimationFrame(() => document.getElementById(url.hash.slice(1))?.scrollIntoView());
    else window.scrollTo(0, 0);
  }} />;
}
