import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";

const columns: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Dashboard", href: "/#product" },
      { label: "Booking widget", href: "/#product" },
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/#pricing" },
    ],
  },
  {
    heading: "Industries",
    links: [
      { label: "Cleaning", href: "/#industries" },
      { label: "HVAC & Electrical", href: "/#industries" },
      { label: "Plumbing & Roofing", href: "/#industries" },
      { label: "Landscaping", href: "/#industries" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Support", href: "/contact" },
      { label: "API docs", href: "/features" },
      { label: "Contact sales", href: "/contact" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-navy-950 pt-[72px] pb-10 text-white/60">
      <Container>
        <div className="mb-14 grid grid-cols-1 gap-11 min-[521px]:grid-cols-2 min-[861px]:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <Logo variant="dark" className="mb-[18px] h-11" />
            <p className="max-w-[26em] text-[0.85rem] leading-[1.7] font-light text-white/50">
              Booking infrastructure for home service companies. 500,000+
              appointments scheduled every month across cleaning, HVAC,
              plumbing, roofing, and landscaping.
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.heading}>
              <h4 className="mb-[18px] text-[0.7rem] font-bold tracking-[0.18em] text-white/40 uppercase">
                {col.heading}
              </h4>
              <ul className="flex flex-col gap-[11px] text-[0.88rem]">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-white/70 transition-colors duration-[var(--duration-fast)] hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-between gap-4 border-t border-white/10 pt-7 text-[0.78rem] text-white/40">
          <span>© 2026 Diamond Booking. All rights reserved.</span>
          <span>Privacy · Terms · Security</span>
        </div>
      </Container>
    </footer>
  );
}
