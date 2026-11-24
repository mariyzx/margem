export const MOTION_DURATIONS = {
  instant: 0.08,
  fast: 0.14,
  base: 0.22,
  slow: 0.32,
  reveal: 0.7,
} as const;

export const MOTION_EASINGS = {
  out: [0.2, 0.8, 0.2, 1],
  inOut: [0.4, 0, 0.2, 1],
} as const;
