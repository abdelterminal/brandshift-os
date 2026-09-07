import {
  Building2,
  CalendarDays,
  FolderKanban,
  Hash,
  Inbox,
  LayoutGrid,
  ListTodo,
  MessagesSquare,
  Palmtree,
  ReceiptEuro,
  Target,
  Goal,
  BookOpenCheck,
  Copy,
  CalendarCheck,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { NavIconName } from "@/lib/navigation";

/**
 * Icon name -> component.
 *
 * `src/lib/navigation.ts` names icons as strings rather than holding the
 * components themselves, because the rail is built on the server and handed to
 * a Client Component -- and a function cannot cross that boundary. Keeping the
 * nav data plain also makes it something a test can assert on directly.
 */
export const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  today: Sun,
  work: FolderKanban,
  myWork: ListTodo,
  people: Users,
  department: Building2,
  insights: LayoutGrid,
  inbox: Inbox,
  calendar: CalendarDays,
  channel: Hash,
  channels: MessagesSquare,
  leave: Palmtree,
  crm: Target,
  finance: ReceiptEuro,
  objectives: Goal,
  sops: BookOpenCheck,
  templates: Copy,
  reviews: CalendarCheck,
};
