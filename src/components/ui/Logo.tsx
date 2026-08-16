import Image from "next/image";
import { cn } from "@/lib/cn";

/**
 * Brand wordmark. `light` = full-color for light surfaces,
 * `dark` = white/gold for navy surfaces.
 * Source asset is 5834x1574 (aspect ~3.706).
 */
export function Logo({
  variant = "light",
  className,
  priority = false,
}: {
  variant?: "light" | "dark";
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={variant === "light" ? "/brand/logo-light.webp" : "/brand/logo-dark.webp"}
      alt="Diamond Booking"
      width={5834}
      height={1574}
      priority={priority}
      className={cn("h-10 w-auto", className)}
    />
  );
}
