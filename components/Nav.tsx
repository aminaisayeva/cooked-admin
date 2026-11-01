"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUPS = [
  {
    label: "Overview",
    links: [
      { href: "/", label: "Stats" },
      { href: "/voices", label: "Voices" },
    ],
  },
  {
    label: "Content",
    links: [
      { href: "/users", label: "Users" },
      { href: "/media", label: "Images & captions" },
      { href: "/votes", label: "Votes" },
    ],
  },
  {
    label: "AI pipeline",
    links: [
      { href: "/chains", label: "Prompt chains" },
      { href: "/requests", label: "Generation requests" },
      { href: "/responses", label: "LLM responses" },
      { href: "/models", label: "LLM models" },
      { href: "/providers", label: "LLM providers" },
      { href: "/terms", label: "Terms" },
      { href: "/examples", label: "Examples" },
    ],
  },
  {
    label: "Access",
    links: [{ href: "/signups", label: "Sign-ups" }],
  },
];

// A sidebar on wide screens; a scrolling row on phones.
export default function Nav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex gap-4 overflow-x-auto lg:flex-col lg:gap-5 lg:overflow-visible">
      {GROUPS.map((g) => (
        <div key={g.label} className="flex shrink-0 items-center gap-1 lg:flex-col lg:items-stretch">
          <p className="hidden px-3 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase lg:block">{g.label}</p>
          {g.links.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition ${
                  active ? "bg-wash font-medium text-ink" : "text-ink-2 hover:bg-wash hover:text-ink"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
