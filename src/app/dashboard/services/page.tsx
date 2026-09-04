import type { Metadata } from "next";
import { getServices } from "@/lib/dashboard/data";
import { ServicesClient } from "@/components/dashboard/sections/ServicesClient";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage() {
  const services = await getServices();
  return <ServicesClient initial={services} />;
}
