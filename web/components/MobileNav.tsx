"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Bell, LineChart, Bug, Sprout, Tractor, Leaf, Database } from "lucide-react";

const NAV_ITEMS = [
  { href: "/",           label: "Home",    icon: LayoutDashboard },
  { href: "/plant",      label: "Plant",   icon: Sprout          },
  { href: "/disease",    label: "Disease", icon: Leaf            },
  { href: "/insect",     label: "Pests",   icon: Bug             },
  { href: "/agriculture",label: "Farm",    icon: Tractor         },
  { href: "/alerts",     label: "Alerts",  icon: Bell            },
  { href: "/history",    label: "History", icon: LineChart       },
  { href: "/data",       label: "Data",    icon: Database        },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-gray-900 border-t border-gray-700 flex">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-1 text-xs font-medium transition-colors ${
              isActive ? "text-primary-400" : "text-gray-400 hover:text-white"
            }`}
          >
            <Icon className={`w-5 h-5 ${isActive ? "text-primary-400" : "text-gray-400"}`} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
