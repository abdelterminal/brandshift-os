import { getTranslations } from "next-intl/server";

import { MyDay } from "@/components/today/my-day";
import { requireUser } from "@/lib/auth/guards";

/**
 * Your own work, for somebody whose Today is about everybody else's.
 *
 * A manager, admin or owner opens Today onto the coordination queue -- what
 * has stopped, what has slipped, what nobody has picked up. That is the right
 * screen for the job, but it left them with a three-row summary of their own
 * tasks and nowhere to see the rest, which is the gap this closes: the same
 * Now / Next / Later a member gets, in full.
 *
 * Not a sixth rail destination -- the rail is capped at five and the
 * coordinator's is already full -- so it is reached from the Mine card on
 * Today, the same way the uncapped queue is reached from its lanes.
 *
 * Open to everyone rather than gated to managers. A member's Today already
 * *is* this screen, so the page is simply the same answer at a second address,
 * and refusing them would be a rule with nothing behind it.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Today");
  return { title: t("myWorkTitle") };
}

export default async function MyWorkPage() {
  const session = await requireUser();
  return <MyDay name={session.user.name} heading="myWorkTitle" />;
}
