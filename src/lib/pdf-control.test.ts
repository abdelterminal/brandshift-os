import { describe, expect, it } from "vitest";

import {
  PdfBusyError,
  PdfRenderGate,
  isAllowedPdfRequest,
  runWithDeadline,
} from "./pdf-control";

describe("isAllowedPdfRequest", () => {
  const origin = "http://127.0.0.1:3000";

  it("allows only requests to the rendering application's own origin", () => {
    expect(isAllowedPdfRequest("http://127.0.0.1:3000/en/finance/quotes/1/print", origin)).toBe(
      true,
    );
    expect(isAllowedPdfRequest("http://127.0.0.1:3000/_next/static/font.woff2", origin)).toBe(true);
  });

  it("blocks external, loopback-alias and private-network requests", () => {
    expect(isAllowedPdfRequest("https://cdn.example.com/logo.png", origin)).toBe(false);
    expect(isAllowedPdfRequest("http://localhost:3000/admin", origin)).toBe(false);
    expect(isAllowedPdfRequest("http://169.254.169.254/latest/meta-data", origin)).toBe(false);
    expect(isAllowedPdfRequest("http://192.168.1.9/private", origin)).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isAllowedPdfRequest("not a url", origin)).toBe(false);
  });
});

describe("PdfRenderGate", () => {
  it("queues a bounded number of renders and rejects excess work", async () => {
    const gate = new PdfRenderGate(1, 1, 1_000);
    const releaseFirst = await gate.acquire();
    const second = gate.acquire();

    await expect(gate.acquire()).rejects.toBeInstanceOf(PdfBusyError);

    releaseFirst();
    const releaseSecond = await second;
    releaseSecond();

    expect(gate.activeCount).toBe(0);
    expect(gate.pendingCount).toBe(0);
  });

  it("times out queued work instead of waiting forever", async () => {
    const gate = new PdfRenderGate(1, 1, 5);
    const release = await gate.acquire();

    await expect(gate.acquire()).rejects.toBeInstanceOf(PdfBusyError);
    release();
  });
});

describe("runWithDeadline", () => {
  it("keeps cleanup deferred until a timed-out operation actually settles", async () => {
    let finish!: () => void;
    const operation = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let timeoutHandled = false;
    let cleanedUp = false;

    await expect(
      runWithDeadline(
        operation,
        5,
        () => {
          timeoutHandled = true;
        },
        () => {
          cleanedUp = true;
        },
      ),
    ).rejects.toBeInstanceOf(PdfBusyError);

    expect(timeoutHandled).toBe(true);
    expect(cleanedUp).toBe(false);

    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cleanedUp).toBe(true);
  });
});
