export interface RetryOptions {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    retryIf?: (error: unknown) => boolean;
    onRetry?: (error: unknown, attempt: number) => void;
}
export declare function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T>;
export declare function sleep(ms: number): Promise<void>;
export declare function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage?: string): Promise<T>;
//# sourceMappingURL=retry.d.ts.map