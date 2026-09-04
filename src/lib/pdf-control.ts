export class PdfBusyError extends Error {
  constructor(message = "The PDF renderer is busy. Try again shortly.") {
    super(message);
    this.name = "PdfBusyError";
  }
}

/** Only the app itself may be reached by the server-side rendering browser. */
export function isAllowedPdfRequest(requestUrl: string, appOrigin: string): boolean {
  try {
    return new URL(requestUrl).origin === new URL(appOrigin).origin;
  } catch {
    return false;
  }
}

type MaybePromise = void | Promise<void>;

/**
 * Return a timeout promptly without pretending the underlying work has stopped.
 * Cleanup owns the render slot and runs only after that work really settles.
 */
export function runWithDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout: () => MaybePromise,
  onSettled: () => MaybePromise,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  const settled = operation.then(
    async (value) => {
      await onSettled();
      return value;
    },
    async (error: unknown) => {
      await onSettled();
      throw error;
    },
  );

  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      void Promise.resolve(onTimeout()).catch(() => undefined);
      reject(new PdfBusyError("PDF rendering timed out."));
    }, timeoutMs);
  });

  return Promise.race([settled, deadline]).finally(() => {
    if (!timedOut && timer) clearTimeout(timer);
  });
}

type Release = () => void;
type Waiter = {
  resolve: (release: Release) => void;
  reject: (error: PdfBusyError) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** A small bounded queue prevents PDF requests from exhausting Chromium/host memory. */
export class PdfRenderGate {
  private active = 0;
  private readonly waiting: Waiter[] = [];

  constructor(
    private readonly maxActive: number,
    private readonly maxPending: number,
    private readonly waitTimeoutMs: number,
  ) {
    if (maxActive < 1 || maxPending < 0 || waitTimeoutMs < 1) {
      throw new Error("Invalid PDF render gate limits");
    }
  }

  get activeCount() {
    return this.active;
  }

  get pendingCount() {
    return this.waiting.length;
  }

  acquire(): Promise<Release> {
    if (this.active < this.maxActive) {
      this.active += 1;
      return Promise.resolve(this.releaseOnce());
    }

    if (this.waiting.length >= this.maxPending) {
      return Promise.reject(new PdfBusyError());
    }

    return new Promise<Release>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.waiting.indexOf(waiter);
          if (index >= 0) this.waiting.splice(index, 1);
          reject(new PdfBusyError("Timed out waiting for the PDF renderer."));
        }, this.waitTimeoutMs),
      };
      this.waiting.push(waiter);
    });
  }

  private releaseOnce(): Release {
    let released = false;
    return () => {
      if (released) return;
      released = true;

      const next = this.waiting.shift();
      if (next) {
        clearTimeout(next.timer);
        next.resolve(this.releaseOnce());
      } else {
        this.active -= 1;
      }
    };
  }
}
