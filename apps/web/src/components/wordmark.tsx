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

  const easeOut = [...MOTION_EASINGS.out] as [number, number, number, number];
  const easeInOut = [...MOTION_EASINGS.inOut] as [number, number, number, number];

  const letterVariants = {
    hidden: { opacity: 0, scale: 0.92 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { duration: 0.28, ease: easeOut },
    },
  };

  const bottomCornerVariants = {
    hidden: { x: 6, y: -3, opacity: 0 },
    visible: {
      x: 0,
      y: 0,
      opacity: 1,
      transition: { delay: 0.15, duration: 0.4, ease: easeOut },
    },
  };

  const topCornerVariants = {
    hidden: { x: -6, y: 3, opacity: 0 },
    visible: {
      x: 0,
      y: 0,
      opacity: 1,
      transition: { delay: 0.15, duration: 0.4, ease: easeOut },
    },
  };

  const restVariants = {
    hidden: { maxWidth: 0, opacity: 0 },
    visible: {
      maxWidth: "3.4em",
      opacity: 1,
      transition: {
        delay: 0.35,
        duration: MOTION_DURATIONS.reveal,
        ease: easeInOut,
      },
    },
  };

  return (
    <m.span
      key={animateIntro ? "intro" : "static"}
      initial={animateIntro ? "hidden" : false}
      animate="visible"
      className="relative inline-flex items-baseline px-[0.45em] py-[0.15em] font-serif text-3xl font-semibold tracking-tight text-ink"
    >
      <m.span
        aria-hidden="true"
        variants={bottomCornerVariants}
        className="pointer-events-none absolute bottom-0 left-0 h-[0.34em] w-[0.34em] border-b-[0.055em] border-l-[0.055em] border-bic"
      />
      <m.span variants={letterVariants}>M</m.span>
      <m.span
        variants={restVariants}
        className="-mb-[0.18em] inline-block overflow-hidden pb-[0.18em] whitespace-nowrap"
      >
        argem
      </m.span>
      <m.span
        aria-hidden="true"
        variants={topCornerVariants}
        className="pointer-events-none absolute top-0 right-0 h-[0.34em] w-[0.34em] border-t-[0.055em] border-r-[0.055em] border-bic"
      />
    </m.span>
  );
}
