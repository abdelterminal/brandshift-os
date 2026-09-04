import { ForbiddenNotice } from "@/components/errors/forbidden";

/** The print group has no shell, so this renders bare. */
export default function Forbidden() {
  return <ForbiddenNotice />;
}
