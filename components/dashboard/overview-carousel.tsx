"use client";

import { useRef, useState, useImperativeHandle, useLayoutEffect, type Ref, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type OverviewCarouselHandle = { goTo: (index: number) => void };

export function OverviewCarousel({ cards, carouselRef }: {
  cards: { title: string; content: ReactNode }[];
  carouselRef: Ref<OverviewCarouselHandle>;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const activeTitle = cards[active].title;
  // Follow only the visible card, including expanded details and responsive reflow.
  // Fixed slide heights either clip content or leave large empty panels.
  useLayoutEffect(() => {
    const element = track.current;
    const card = element?.children[active] as HTMLElement | undefined;
    if (!element || !card) return;
    const fitHeight = () => { element.style.height = `${card.getBoundingClientRect().height}px`; };
    fitHeight();
    const observer = new ResizeObserver(fitHeight);
    observer.observe(card);
    return () => observer.disconnect();
  }, [active, activeTitle]);

  function goTo(index: number) {
    const element = track.current;
    const card = element?.children[index] as HTMLElement | undefined;
    const first = element?.firstElementChild as HTMLElement | null;
    if (!element || !card || !first) return;
    if (element.contains(document.activeElement)) element.focus({ preventScroll: true });
    // Native scrolling supports touch/trackpads without custom gesture handlers.
    element.scrollTo({ left: card.offsetLeft - first.offsetLeft, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  useImperativeHandle(carouselRef, () => ({ goTo }));
  return <div className="overview-carousel" role="region" aria-roledescription="carousel" aria-label="Financial overview">
    <div className="overview-carousel-heading">
      <p aria-live="polite" aria-atomic="true"><strong>{cards[active].title}</strong><span>{active + 1} / {cards.length}</span></p>
      <div className="overview-carousel-arrows">
        <button type="button" aria-label="Previous overview card" disabled={active === 0} onClick={() => goTo(active - 1)}><ChevronLeft size={20} /></button>
        <button type="button" aria-label="Next overview card" disabled={active === cards.length - 1} onClick={() => goTo(active + 1)}><ChevronRight size={20} /></button>
      </div>
    </div>
    <div ref={track} className="overview-carousel-track" tabIndex={0} aria-label="Swipe or use left and right arrow keys to browse overview cards"
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        const next = event.key === "ArrowRight" ? Math.min(active + 1, cards.length - 1) : event.key === "ArrowLeft" ? Math.max(active - 1, 0) : event.key === "Home" ? 0 : event.key === "End" ? cards.length - 1 : null;
        if (next !== null) { event.preventDefault(); goTo(next); }
      }}
      onScroll={() => {
        const element = track.current;
        if (!element) return;
        const first = element.children[0] as HTMLElement;
        const second = element.children[1] as HTMLElement | undefined;
        const step = second ? second.offsetLeft - first.offsetLeft : element.clientWidth;
        if (step) setActive(Math.max(0, Math.min(cards.length - 1, Math.round(element.scrollLeft / step))));
      }}>
      {cards.map((card, index) => <div key={card.title} className="overview-carousel-card" role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${cards.length}: ${card.title}`} inert={index !== active}>{card.content}</div>)}
    </div>
    <div className="overview-carousel-navigation" role="group" aria-label="Choose overview card">
      {cards.map((card, index) => <button type="button" key={card.title} aria-label={`Show ${card.title}`} aria-current={active === index ? "true" : undefined} onClick={() => goTo(index)}><span aria-hidden="true" /></button>)}
    </div>
  </div>;
}
