"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/jobs", label: "Jobs", icon: "🔍" },
  { href: "/interview", label: "Interview", icon: "🎤" },
  { href: "/leetcode", label: "LeetCode", icon: "💻" },
  { href: "/resume", label: "Resume", icon: "📝" },
  { href: "/cover-letter", label: "Cover Letter", icon: "✉️" },
  { href: "/outreach", label: "Outreach", icon: "🤝" },
  { href: "/pipeline", label: "Pipeline", icon: "📋" },
  { href: "/profile", label: "Profile", icon: "⚙️" },
];

export default function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="w-16 hover:w-52 transition-all duration-200 bg-gray-900 border-r border-gray-800 flex flex-col py-4 overflow-hidden group shrink-0">
      <div className="px-3 mb-6">
        <h1 className="text-lg font-bold text-blue-400 whitespace-nowrap overflow-hidden">
          <span className="group-hover:hidden">CH</span>
          <span className="hidden group-hover:inline">Career Hunter</span>
        </h1>
      </div>
      <div className="flex flex-col gap-1 px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-blue-500/10 text-blue-400"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              }`}
            >
              <span className="text-lg shrink-0">{item.icon}</span>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
