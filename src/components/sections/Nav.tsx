"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";

const links = [
  { label: "Product", href: "/#product" },
  { label: "Features", href: "/#features" },
  { label: "Industries", href: "/#industries" },
  { label: "Pricing", href: "/#pricing" },
  { label: "FAQ", href: "/#faq" },
];

/**
 * Sticky context-aware nav: transparent over the hero, blurred
 * surface + hairline after 24px of scroll.
 */
export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-[100]",
        "transition-[background-color,border-color,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-out-expo)]",
        scrolled
          ? "border-b border-line bg-surface/80 shadow-[0_1px_2px_rgb(12_36_64/0.04)] backdrop-blur-[14px]"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <Container className="flex h-[72px] items-center justify-between">
        <Link href="/" aria-label="Diamond Booking home" className="shrink-0">
          <Logo variant="light" priority />
        </Link>

        <nav
          aria-label="Primary"
          className="hidden items-center gap-9 text-[0.9rem] font-medium text-ink-muted min-[900px]:flex"
        >
          {links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={cn(
                "relative py-1 transition-colors duration-[var(--duration-fast)] hover:text-ink",
                "after:absolute after:bottom-0 after:left-0 after:h-[1.5px] after:w-0 after:bg-blue-600",
                "after:transition-[width] after:duration-[var(--duration-fast)] after:ease-[var(--ease-out-expo)]",
                "hover:after:w-full",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-5">
          <Link
            href="/login"
            className="hidden text-[0.9rem] font-semibold text-ink-muted transition-colors duration-[var(--duration-fast)] hover:text-ink min-[900px]:block"
          >
            Sign in
          </Link>
          <Button href="/signup" variant="gold" size="sm">
            Start free trial
          </Button>
        </div>
      </Container>
    </header>
  );
}
