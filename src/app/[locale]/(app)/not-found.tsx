import { NotFoundNotice } from "@/components/errors/not-found";

/** Rendered inside the shell, so somebody who followed a dead link still has the rail. */
export default function NotFound() {
  return <NotFoundNotice />;
}
