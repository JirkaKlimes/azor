type Variants = Record<string, Record<string, unknown>>;

// Subtle, professional animation variants for transcript items

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.15, ease: "easeOut" }
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.1, ease: "easeIn" }
  },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -16 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.2, ease: "easeOut" }
  },
  exit: {
    opacity: 0,
    x: -8,
    transition: { duration: 0.1, ease: "easeIn" }
  },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 16 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.2, ease: "easeOut" }
  },
  exit: {
    opacity: 0,
    x: 8,
    transition: { duration: 0.1, ease: "easeIn" }
  },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.15, ease: "easeOut" }
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.1, ease: "easeIn" }
  },
};

export const slideUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: "easeOut" }
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.1, ease: "easeIn" }
  },
};

export const expandCollapse: Variants = {
  hidden: { height: 0, opacity: 0 },
  visible: {
    height: "auto",
    opacity: 1,
    transition: { duration: 0.2, ease: "easeOut" }
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.15, ease: "easeIn" }
  },
};

// Floating animation for empty states
export const float: Variants = {
  initial: { y: 0 },
  animate: {
    y: [-2, 2, -2],
    transition: {
      duration: 3,
      ease: "easeInOut",
      repeat: Infinity,
    },
  },
};

// Pulse animation for highlights
export const highlightPulse: Variants = {
  initial: {
    backgroundColor: "rgba(250, 204, 21, 0.5)" // yellow-400 with opacity
  },
  animate: {
    backgroundColor: "rgba(250, 204, 21, 0.25)",
    transition: { duration: 0.8, ease: "easeOut" }
  },
};
