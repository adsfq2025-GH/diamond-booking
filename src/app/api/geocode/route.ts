import { NextResponse, type NextRequest } from "next/server";

/**
 * Address autocomplete proxy. Fronts the free Photon (OpenStreetMap) geocoder
 * so the browser calls our own origin (no CORS, works inside the embedded
 * widget iframe) and we can normalize the shape. No API key required.
 *
 * GET /api/geocode?q=<query>  ->  { suggestions: [{ formatted, line1, city, state, zip }] }
 */
export interface GeoSuggestion {
  formatted: string;
  line1: string;
  city: string;
  state: string;
  zip: string;
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 4) return NextResponse.json({ suggestions: [] });

  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lang=en`;
    const res = await fetch(url, {
      headers: { "User-Agent": "DiamondBooking/1.0 (booking widget)" },
      // brief cache to be kind to the free service
      next: { revalidate: 3600 },
    });
    if (!res.ok) return NextResponse.json({ suggestions: [] });
    const data = (await res.json()) as {
      features?: Array<{ properties?: Record<string, string> }>;
    };

    const suggestions: GeoSuggestion[] = (data.features ?? [])
      .map((f) => {
        const p = f.properties ?? {};
        const line1 = [p.housenumber, p.street].filter(Boolean).join(" ") || p.name || "";
        const formatted = [line1, p.city, p.state, p.postcode].filter(Boolean).join(", ");
        return {
          formatted,
          line1,
          city: p.city ?? "",
          state: p.state ?? "",
          zip: p.postcode ?? "",
        };
      })
      .filter((s) => s.formatted.length > 0);

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
