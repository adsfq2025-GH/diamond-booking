"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { WidgetData } from "@/lib/dashboard/types";
import { Icon } from "../icons";
import { Panel, PanelHeader } from "../ui";
import { inputBase, Label } from "@/components/ui/Field";
import { GhostBtn } from "./shared";

const SWATCHES = ["#2e86c1", "#0c2440", "#3fb68b", "#8e6bbf", "#e07a5f", "#f4b942"];

export function WidgetClient({
  data,
}: {
  data: WidgetData;
}) {
  const [color, setColor] = useState(data.primaryColor);
  const [radius, setRadius] = useState(parseInt(data.radius) || 12);
  const [copied, setCopied] = useState<"embed" | "link" | null>(null);

  const bookUrl = `${data.appUrl}/book/${data.publicKey}`;
  const embed = `<script src="${data.appUrl}/embed.js" data-key="${data.publicKey}" async></script>`;

  function copy(text: string, which: "embed" | "link") {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1600);
    });
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Controls */}
        <div className="space-y-5 lg:col-span-3">
          <Panel>
            <PanelHeader title="Embed on your website" caption="Paste this before the closing </body> tag" />
            <div className="px-5 py-5">
              <div className="relative">
                <pre className="overflow-x-auto rounded-[10px] border border-line bg-navy-950 px-4 py-3.5 pr-12 text-[0.78rem] leading-[1.6] text-blue-100">
                  <code>{embed}</code>
                </pre>
                <button
                  type="button"
                  onClick={() => copy(embed, "embed")}
                  aria-label="Copy embed code"
                  className="absolute top-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-[8px] bg-white/10 text-white transition-colors hover:bg-white/20"
                >
                  <Icon name={copied === "embed" ? "check" : "widget"} className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4">
                <Label htmlFor="book-link">Direct booking link</Label>
                <div className="flex gap-2">
                  <input id="book-link" readOnly className={cn(inputBase, "flex-1 font-mono text-[0.8rem]")} value={bookUrl} />
                  <GhostBtn onClick={() => copy(bookUrl, "link")} icon={copied === "link" ? "check" : "external"}>
                    {copied === "link" ? "Copied" : "Copy"}
                  </GhostBtn>
                </div>
                <a
                  href={bookUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-blue-600 hover:text-blue-700"
                >
                  Open booking page
                  <Icon name="external" className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Appearance" caption="Match your brand" />
            <div className="space-y-5 px-5 py-5">
              <div>
                <Label htmlFor="w-color">Accent color</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {SWATCHES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-label={`Use ${s}`}
                      onClick={() => setColor(s)}
                      className={cn(
                        "h-8 w-8 rounded-full border-2 transition-transform hover:scale-110",
                        color.toLowerCase() === s.toLowerCase() ? "border-ink" : "border-transparent",
                      )}
                      style={{ backgroundColor: s }}
                    />
                  ))}
                  <input
                    type="color"
                    aria-label="Custom color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-8 w-10 cursor-pointer rounded-[6px] border border-line bg-card"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="w-radius">Corner radius — {radius}px</Label>
                <input
                  id="w-radius"
                  type="range"
                  min={0}
                  max={24}
                  value={radius}
                  onChange={(e) => setRadius(parseInt(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Custom fields" caption="Extra questions on the booking form" />
            <div className="px-5 py-5">
              {data.customFields.length === 0 ? (
                <p className="text-[0.83rem] text-ink-faint">No custom fields yet.</p>
              ) : (
                <ul className="space-y-2">
                  {data.customFields.map((f) => (
                    <li
                      key={f.key}
                      className="flex items-center justify-between rounded-[10px] border border-line px-3.5 py-2.5"
                    >
                      <div>
                        <p className="text-[0.85rem] font-medium text-ink">{f.label}</p>
                        <p className="text-[0.72rem] text-ink-faint capitalize">
                          {f.type} · {f.required ? "required" : "optional"}
                        </p>
                      </div>
                      <Icon name="dots" className="h-4 w-4 text-ink-faint" />
                    </li>
                  ))}
                </ul>
              )}
              <GhostBtn icon="plus" className="mt-3">
                Add field
              </GhostBtn>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Allowed domains" caption="Where the widget may be embedded" />
            <div className="px-5 py-5">
              <div className="flex flex-wrap gap-2">
                {data.allowedDomains.length === 0 ? (
                  <p className="text-[0.83rem] text-ink-faint">Any domain (no restriction).</p>
                ) : (
                  data.allowedDomains.map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-line-strong bg-surface-alt px-3 py-1.5 text-[0.8rem] text-ink"
                    >
                      {d}
                      <Icon name="close" className="h-3.5 w-3.5 cursor-pointer text-ink-faint hover:text-ink" />
                    </span>
                  ))
                )}
              </div>
            </div>
          </Panel>
        </div>

        {/* Live preview */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-[76px]">
            <p className="mb-3 text-[0.7rem] font-bold tracking-[0.16em] text-ink-faint uppercase">
              Live preview
            </p>
            <WidgetPreview color={color} radius={radius} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** A faithful static mock of the embeddable widget that reflects the controls. */
function WidgetPreview({ color, radius }: { color: string; radius: number }) {
  const services = [
    { name: "Standard Home Cleaning", price: "$120", dur: "2h", on: true },
    { name: "Deep Cleaning", price: "$240", dur: "4h", on: false },
    { name: "Office Cleaning", price: "$150", dur: "1h 30m", on: false },
  ];
  return (
    <div
      className="mx-auto max-w-[360px] overflow-hidden border border-line bg-card shadow-float"
      style={{ borderRadius: radius + 6 }}
    >
      <div className="px-5 py-4 text-white" style={{ backgroundColor: color }}>
        <p className="text-[0.72rem] font-semibold tracking-wide opacity-80 uppercase">Book online</p>
        <p className="font-display text-[1.15rem] font-semibold">Clean Sweep Services</p>
      </div>
      <div className="space-y-2.5 px-5 py-5">
        <p className="text-[0.75rem] font-semibold text-ink-faint">1. Choose a service</p>
        {services.map((s) => (
          <div
            key={s.name}
            className="flex items-center justify-between border px-3.5 py-2.5"
            style={{
              borderRadius: radius,
              borderColor: s.on ? color : "var(--line)",
              backgroundColor: s.on ? `${color}12` : "transparent",
            }}
          >
            <div>
              <p className="text-[0.83rem] font-semibold text-ink">{s.name}</p>
              <p className="text-[0.72rem] text-ink-faint">{s.dur}</p>
            </div>
            <span className="font-instrument text-[0.9rem] font-semibold text-ink">{s.price}</span>
          </div>
        ))}
        <button
          type="button"
          disabled
          className="mt-2 w-full py-2.5 text-center text-[0.85rem] font-semibold text-white"
          style={{ backgroundColor: color, borderRadius: radius }}
        >
          Continue
        </button>
        <p className="pt-1 text-center text-[0.66rem] text-ink-faint">
          Powered by Diamond Booking
        </p>
      </div>
    </div>
  );
}
