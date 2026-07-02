"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Leaf, LayoutDashboard, Bell, LineChart, Bug, Sprout, Tractor, Database } from "lucide-react";

const NAV_ITEMS = [
  { href: "/",           label: "Dashboard",        icon: LayoutDashboard },
  { href: "/plant",      label: "Plant Detection",  icon: Sprout          },
  { href: "/disease",    label: "Disease Detection",icon: Leaf            },
  { href: "/insect",     label: "Pest Detection",   icon: Bug             },
  { href: "/agriculture",label: "Farm Practice",    icon: Tractor         },
  { href: "/alerts",     label: "Alerts",           icon: Bell            },
  { href: "/history",    label: "History",          icon: LineChart       },
  { href: "/data",       label: "Data Log",         icon: Database        },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-60 min-h-screen bg-gray-900 text-white fixed left-0 top-0 bottom-0 z-30">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-700">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-600">
          <Leaf className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight text-white">Smart AgriSense</p>
          <p className="text-xs text-gray-400">IoT Farm Dashboard</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary-600 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-700">
        <p className="text-xs text-gray-500">Cameroon Smallholder Farms</p>
        <p className="text-xs text-gray-600 mt-0.5">v1.0 — Live</p>
      </div>
    </aside>
  );
}
