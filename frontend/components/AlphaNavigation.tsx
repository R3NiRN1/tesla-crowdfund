import Link from "next/link";

type NavKey = "deployed" | "setup" | "drafts" | "new" | "admin";

const navItems: { href: string; label: string; key: NavKey }[] = [
  { href: "/", label: "Deployed campaigns", key: "deployed" },
  { href: "/setup", label: "Setup", key: "setup" },
  { href: "/campaigns", label: "Campaign drafts", key: "drafts" },
  { href: "/campaigns/new", label: "New draft", key: "new" },
  { href: "/admin", label: "Admin review", key: "admin" },
];

export default function AlphaNavigation({ active }: { active: NavKey }) {
  return (
    <nav className="alpha-nav" aria-label="Alpha workspace navigation">
      {navItems.map((item) => (
        <Link key={item.key} href={item.href} aria-current={active === item.key ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
