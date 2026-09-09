// lib/bg-timer.ts
// Background-safe timers using a Web Worker heartbeat.
// Falls back to native setInterval/setTimeout when Worker is unavailable.

let worker: Worker | null = null;
const callbacks = new Map<string, () => void>();
let idCounter = 0;

function ensureWorker(): Worker | null {
    if (worker) return worker;
    if (typeof window === "undefined" || typeof Worker === "undefined") return null;
    try {
        worker = new Worker("/timer-worker.js");
        worker.onmessage = (e) => {
            if (e.data.type === "tick") {
                const cb = callbacks.get(e.data.id);
                if (cb) cb();
            }
        };
        worker.onerror = () => { worker = null; };
        return worker;
    } catch {
        return null;
    }
}

/** setInterval that survives background tab throttling. Returns a stop function. */
export function bgSetInterval(callback: () => void, ms: number): () => void {
    // 阻止 follow-up-service 的后台轮询。
    // follow-up-service 使用的轮询函数名为 pollSchedules；直接在计时器层拦截，
    // 不影响其它后台定时服务，也不会影响用户主动发送消息后的正常 AI 回复。
    if (callback.name === "pollSchedules") {
        return () => {};
    }

    const w = ensureWorker();
    const id = `bgi_${++idCounter}`;

    if (w) {
        callbacks.set(id, callback);
        w.postMessage({ type: "start-interval", id, ms });
        return () => {
            callbacks.delete(id);
            w.postMessage({ type: "stop", id });
        };
    }

    const nativeId = setInterval(callback, ms);
    return () => clearInterval(nativeId);
}

/** setTimeout that survives background tab throttling. Returns a cancel function. */
export function bgSetTimeout(callback: () => void, ms: number): () => void {
    const w = ensureWorker();
    const id = `bgt_${++idCounter}`;

    if (w) {
        callbacks.set(id, () => {
            callbacks.delete(id);
            callback();
        });
        w.postMessage({ type: "start-timeout", id, ms });
        return () => {
            callbacks.delete(id);
            w.postMessage({ type: "stop", id });
        };
    }

    const nativeId = setTimeout(callback, ms);
    return () => clearTimeout(nativeId);
}

/** Clean up the worker (call on app teardown). */
export function bgTimerCleanup(): void {
    if (worker) {
        worker.postMessage({ type: "stop-all" });
        worker.terminate();
        worker = null;
    }
    callbacks.clear();
}
