import {
  ArrowRightLeft,
  Bell,
  BookOpenText,
  Boxes,
  CalendarClock,
  Cog,
  FileDown,
  FlaskConical,
  House,
  LockKeyhole,
  Map,
  TriangleAlert,
  UserRoundCheck,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { IconName } from "./navigation";

const ICONS: Record<IconName, LucideIcon> = {
  home: House,
  practices: BookOpenText,
  calendar: CalendarClock,
  attendance: UserRoundCheck,
  machine: Cog,
  loans: ArrowRightLeft,
  incident: TriangleAlert,
  maintenance: Wrench,
  reports: FileDown,
  inventory: Boxes,
  spaces: Map,
  people: UsersRound,
  labs: FlaskConical,
  bell: Bell,
  lock: LockKeyhole,
};

export function NavIcon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  const Icon = ICONS[name];
  return <Icon aria-hidden className={className} />;
}
