"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";

/**
 * The spinning brand emblem (mockup treatment): multiply blend +
 * feathered edge mask melt the mp4's near-white background into the
 * section gradient; a faint radial brand-blue glow sits behind it.
 * Reduced motion pauses the video on its poster frame.
 */
export function VideoEmblem({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (reduce) {
      video.pause();
      video.currentTime = 0;
    } else {
      void video.play().catch(() => {});
    }
  }, [reduce]);

  return (
    <div
      aria-hidden
      className={cn("grid place-items-center *:[grid-area:1/1]", className)}
    >
      <span className="aspect-square w-[min(72%,400px)] rounded-full bg-[radial-gradient(circle,rgb(46_134_193/0.14),rgb(46_134_193/0.04)_55%,transparent_72%)]" />
      <video
        ref={videoRef}
        className="orbit-video h-auto w-[min(420px,100%)] min-[961px]:w-[min(520px,100%)]"
        src="/brand/spinning-logo.mp4"
        poster="/brand/logo-poster.png"
        autoPlay
        muted
        loop
        playsInline
      />
    </div>
  );
}
