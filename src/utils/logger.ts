const PREFIX = '[Dashell Player]';
const DEBUG_ENABLED = false;

export const logger = {
  info: (..._args: unknown[]) => undefined,
  warn: (...args: unknown[]) => console.warn(PREFIX, ...args),
  error: (...args: unknown[]) => console.error(PREFIX, ...args),
  debug: (...args: unknown[]) => {
    if (DEBUG_ENABLED) console.debug(PREFIX, ...args);
  },
};
