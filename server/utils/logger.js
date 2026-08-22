export const logger = {
  info: (...args) => console.log("[IronEra]", ...args),
  warn: (...args) => console.warn("[IronEra]", ...args),
  error: (...args) => console.error("[IronEra]", ...args)
};
