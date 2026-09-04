import { NotFoundNotice } from "@/components/errors/not-found";

/** The print group has no shell, so this renders bare. */
export default function NotFound() {
  return <NotFoundNotice />;
}
