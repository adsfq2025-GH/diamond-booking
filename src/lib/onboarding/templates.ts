/**
 * Industry service templates for onboarding Step 2. One click adds the
 * template as an editable service draft. Keys match the industry names
 * offered on the signup form.
 */

export interface ServiceTemplate {
  name: string;
  category: string;
  duration_minutes: number;
  price_cents: number;
  deposit_cents: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
}

export const SERVICE_TEMPLATES: Record<string, ServiceTemplate[]> = {
  Cleaning: [
    { name: "Standard Home Cleaning", category: "Residential", duration_minutes: 120, price_cents: 12000, deposit_cents: 0, buffer_before_minutes: 0, buffer_after_minutes: 30 },
    { name: "Deep Cleaning", category: "Residential", duration_minutes: 240, price_cents: 24000, deposit_cents: 5000, buffer_before_minutes: 0, buffer_after_minutes: 30 },
    { name: "Move-In / Move-Out Clean", category: "Residential", duration_minutes: 300, price_cents: 32000, deposit_cents: 5000, buffer_before_minutes: 0, buffer_after_minutes: 30 },
    { name: "Office Cleaning", category: "Commercial", duration_minutes: 90, price_cents: 15000, deposit_cents: 0, buffer_before_minutes: 0, buffer_after_minutes: 15 },
  ],
  HVAC: [
    { name: "AC Tune-Up", category: "Maintenance", duration_minutes: 90, price_cents: 12900, deposit_cents: 0, buffer_before_minutes: 15, buffer_after_minutes: 15 },
    { name: "Furnace Inspection", category: "Maintenance", duration_minutes: 60, price_cents: 9900, deposit_cents: 0, buffer_before_minutes: 15, buffer_after_minutes: 15 },
    { name: "Repair Visit (Diagnostic)", category: "Repair", duration_minutes: 120, price_cents: 14900, deposit_cents: 4900, buffer_before_minutes: 15, buffer_after_minutes: 30 },
  ],
  Plumbing: [
    { name: "Drain Cleaning", category: "Service", duration_minutes: 90, price_cents: 17500, deposit_cents: 0, buffer_before_minutes: 15, buffer_after_minutes: 15 },
    { name: "Leak Repair", category: "Repair", duration_minutes: 120, price_cents: 22500, deposit_cents: 5000, buffer_before_minutes: 15, buffer_after_minutes: 30 },
    { name: "Water Heater Install", category: "Install", duration_minutes: 240, price_cents: 89500, deposit_cents: 15000, buffer_before_minutes: 30, buffer_after_minutes: 30 },
  ],
  Roofing: [
    { name: "Roof Inspection", category: "Inspection", duration_minutes: 60, price_cents: 0, deposit_cents: 0, buffer_before_minutes: 30, buffer_after_minutes: 30 },
    { name: "Leak Repair", category: "Repair", duration_minutes: 180, price_cents: 45000, deposit_cents: 10000, buffer_before_minutes: 30, buffer_after_minutes: 30 },
    { name: "Gutter Cleaning", category: "Maintenance", duration_minutes: 120, price_cents: 18000, deposit_cents: 0, buffer_before_minutes: 15, buffer_after_minutes: 15 },
  ],
  Landscaping: [
    { name: "Lawn Mowing", category: "Maintenance", duration_minutes: 60, price_cents: 6500, deposit_cents: 0, buffer_before_minutes: 0, buffer_after_minutes: 15 },
    { name: "Yard Cleanup", category: "Seasonal", duration_minutes: 180, price_cents: 22500, deposit_cents: 5000, buffer_before_minutes: 15, buffer_after_minutes: 15 },
    { name: "Hedge & Shrub Trimming", category: "Maintenance", duration_minutes: 120, price_cents: 14500, deposit_cents: 0, buffer_before_minutes: 0, buffer_after_minutes: 15 },
  ],
  Electrical: [
    { name: "Outlet / Switch Install", category: "Install", duration_minutes: 60, price_cents: 14500, deposit_cents: 0, buffer_before_minutes: 15, buffer_after_minutes: 15 },
    { name: "Panel Inspection", category: "Inspection", duration_minutes: 90, price_cents: 12500, deposit_cents: 0, buffer_before_minutes: 15, buffer_after_minutes: 15 },
    { name: "Lighting Installation", category: "Install", duration_minutes: 120, price_cents: 24500, deposit_cents: 5000, buffer_before_minutes: 15, buffer_after_minutes: 30 },
  ],
  "Pest Control": [
    { name: "General Pest Treatment", category: "Treatment", duration_minutes: 60, price_cents: 12900, deposit_cents: 0, buffer_before_minutes: 15, buffer_after_minutes: 15 },
    { name: "Termite Inspection", category: "Inspection", duration_minutes: 90, price_cents: 9900, deposit_cents: 0, buffer_before_minutes: 15, buffer_after_minutes: 15 },
    { name: "Rodent Control Visit", category: "Treatment", duration_minutes: 90, price_cents: 19500, deposit_cents: 4900, buffer_before_minutes: 15, buffer_after_minutes: 15 },
  ],
  "Pool Care": [
    { name: "Weekly Pool Cleaning", category: "Maintenance", duration_minutes: 60, price_cents: 9500, deposit_cents: 0, buffer_before_minutes: 0, buffer_after_minutes: 15 },
    { name: "Pool Opening", category: "Seasonal", duration_minutes: 180, price_cents: 32500, deposit_cents: 7500, buffer_before_minutes: 15, buffer_after_minutes: 15 },
    { name: "Pool Closing", category: "Seasonal", duration_minutes: 180, price_cents: 29500, deposit_cents: 7500, buffer_before_minutes: 15, buffer_after_minutes: 15 },
  ],
  "Window Washing": [
    { name: "Exterior Window Wash", category: "Residential", duration_minutes: 120, price_cents: 16500, deposit_cents: 0, buffer_before_minutes: 15, buffer_after_minutes: 15 },
    { name: "Interior + Exterior Wash", category: "Residential", duration_minutes: 210, price_cents: 27500, deposit_cents: 5000, buffer_before_minutes: 15, buffer_after_minutes: 15 },
    { name: "Storefront Windows", category: "Commercial", duration_minutes: 60, price_cents: 8500, deposit_cents: 0, buffer_before_minutes: 0, buffer_after_minutes: 15 },
  ],
  "Appliance Repair": [
    { name: "Diagnostic Visit", category: "Diagnostic", duration_minutes: 60, price_cents: 9900, deposit_cents: 0, buffer_before_minutes: 15, buffer_after_minutes: 15 },
    { name: "Washer / Dryer Repair", category: "Repair", duration_minutes: 120, price_cents: 19500, deposit_cents: 4900, buffer_before_minutes: 15, buffer_after_minutes: 30 },
    { name: "Refrigerator Repair", category: "Repair", duration_minutes: 120, price_cents: 22500, deposit_cents: 4900, buffer_before_minutes: 15, buffer_after_minutes: 30 },
  ],
};

/** Templates for a tenant's industry (empty array when unknown). */
export function templatesForIndustry(industry: string | null | undefined): ServiceTemplate[] {
  if (!industry) return [];
  // stored values may be lowercased (see seed: 'cleaning')
  const key = Object.keys(SERVICE_TEMPLATES).find(
    (k) => k.toLowerCase() === industry.trim().toLowerCase(),
  );
  return key ? SERVICE_TEMPLATES[key] : [];
}
