"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withRetry = withRetry;
exports.sleep = sleep;
exports.withTimeout = withTimeout;
const logger_js_1 = require("./logger.js");
const logger = (0, logger_js_1.createLogger)('retry');
async function withRetry(fn, options) {
    const { maxAttempts, initialDelayMs, maxDelayMs = 30_000, backoffMultiplier = 2, retryIf = () => true, onRetry, } = options;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (attempt === maxAttempts)
                break;
            if (!retryIf(error))
                break;
            const delay = Math.min(initialDelayMs * Math.pow(backoffMultiplier, attempt - 1), maxDelayMs);
            logger.warn('Retrying after error', {
                attempt,
                maxAttempts,
                delayMs: delay,
                error: error instanceof Error ? error.message : String(error),
            });
            if (onRetry) {
                onRetry(error, attempt);
            }
            await sleep(delay);
        }
    }
    throw lastError;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function withTimeout(promise, timeoutMs, errorMessage) {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error(errorMessage ?? `Operation timed out after ${timeoutMs}ms`)), timeoutMs));
    return Promise.race([promise, timeout]);
}
//# sourceMappingURL=retry.js.map