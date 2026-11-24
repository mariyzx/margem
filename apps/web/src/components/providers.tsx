"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import * as React from "react";
import { MOTION_DURATIONS, MOTION_EASINGS } from "@margem/config/motion";
import { ToastProvider, ToastViewport } from "@margem/ui";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: MOTION_DURATIONS.base, ease: [...MOTION_EASINGS.out] }}
    >
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          {children}
          <ToastViewport />
        </ToastProvider>
      </LazyMotion>
    </MotionConfig>
  );
}
