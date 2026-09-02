"use client";

import { useEffect } from "react";

import { clearSessionCookieAction } from "@/lib/auth/actions";

/**
 * Clears the dead session cookie when the 401 page renders.
 *
 * It cannot happen while rendering: cookies can only be written from a Server
 * Action or a Route Handler, not during a page render. So the page renders,
 * then this fires once and the cookie is gone -- which is why the next request
 * goes straight to sign-in instead of bouncing through here again.
 */
export function SignOutOnMount() {
  useEffect(() => {
    void clearSessionCookieAction();
  }, []);

  return null;
}
