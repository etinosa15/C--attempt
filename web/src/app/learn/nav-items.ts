import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faTableCells,
  faRoute,
  faClone,
  faFolder,
  faCode,
  faRankingStar,
  faBook,
  faGear,
  faUser,
} from "@fortawesome/free-solid-svg-icons";

export type NavItem = { href: string; label: string; icon: IconDefinition };

// Single source of the learn primary nav — consumed by both the desktop sidebar
// and the mobile drawer so they can never drift. Order matches the former top nav.
export const NAV: NavItem[] = [
  { href: "/learn", label: "Overview", icon: faTableCells },
  { href: "/learn/paths", label: "Paths", icon: faRoute },
  { href: "/learn/review", label: "Review", icon: faClone },
  { href: "/learn/projects", label: "Projects", icon: faFolder },
  { href: "/learn/playground", label: "Playground", icon: faCode },
  { href: "/learn/leaderboard", label: "Leaderboard", icon: faRankingStar },
  { href: "/learn/notebook", label: "Notebook", icon: faBook },
  { href: "/learn/settings", label: "Settings", icon: faGear },
  { href: "/learn/account", label: "Account", icon: faUser },
];
