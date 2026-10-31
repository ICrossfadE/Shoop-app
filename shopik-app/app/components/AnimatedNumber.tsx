'use client';

import { useEffect, useRef } from 'react';
import { formatMoney } from '@/lib/money';

// Animate only the visual text; assistive technology receives the final value once.
export default function AnimatedNumber({ value, money = true }: { value: number; money?: boolean }) {
  const element = useRef<HTMLSpanElement>(null);
  const previous = useRef(value);
  const format = (number: number) => money ? formatMoney(number) : String(Math.round(number));
  useEffect(() => {
    const start = previous.current;
    previous.current = value;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const started = performance.now();
    let frame = 0;
    // Ease out over a short interval without scheduling React renders per frame.
    function tick(now: number) {
      const progress = Math.min((now - started) / 360, 1);
      if (element.current) element.current.textContent = format(start + (value - start) * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Formatting depends only on the explicit money mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, money]);
  return <span className="animated-number"><span className="sr-only">{format(value)}</span><span ref={element} aria-hidden="true">{format(value)}</span></span>;
}
