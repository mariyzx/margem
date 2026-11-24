"use client";

import { m, useReducedMotion } from "motion/react";
import * as React from "react";
import { MOTION_DURATIONS, MOTION_EASINGS } from "@margem/config/motion";

const INTRO_STORAGE_KEY = "margem:wordmark-intro-seen";

export function Wordmark() {
  const prefersReduced = useReducedMotion();
  const [animateIntro, setAnimateIntro] = React.useState(false);

  React.useEffect(() => {
    if (prefersReduced) return;
    const alreadySeen = window.sessionStorage.getItem(INTRO_STORAGE_KEY);
    if (!alreadySeen) {
      setAnimateIntro(true);
      window.sessionStorage.setItem(INTRO_STORAGE_KEY, "1");
    }
  }, [prefersReduced]);

  const transition = {
    duration: MOTION_DURATIONS.reveal,
    ease: [...MOTION_EASINGS.out] as [number, number, number, number],
  };

  return (
    <span className="relative inline-flex items-center px-[0.45em] py-[0.15em] font-serif text-3xl font-semibold tracking-tight text-ink">
      <m.span
        aria-hidden="true"
        initial={animateIntro ? { x: 8, y: -4, opacity: 0 } : false}
        animate={{ x: 0, y: 0, opacity: 1 }}
        transition={transition}
        className="pointer-events-none absolute bottom-0 left-0 h-[0.34em] w-[0.34em] border-b-[0.055em] border-l-[0.055em] border-bic"
      />
      <span>Margem</span>
      <m.span
        aria-hidden="true"
        initial={animateIntro ? { x: -8, y: 4, opacity: 0 } : false}
        animate={{ x: 0, y: 0, opacity: 1 }}
        transition={transition}
        className="pointer-events-none absolute top-0 right-0 h-[0.34em] w-[0.34em] border-t-[0.055em] border-r-[0.055em] border-bic"
      />
    </span>
  );
}
