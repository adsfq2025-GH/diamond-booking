/*
  TEMPLATE CONTENT — this privacy policy is standard SaaS template text
  drafted by the product team. It MUST be reviewed and approved by legal
  counsel before launch. Do not treat as final legal language.
*/
import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/sections/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Diamond Booking collects, uses, and protects data — for the businesses on our platform and the customers who book through them.",
};

const sections: LegalSection[] = [
  {
    id: "who-we-are",
    heading: "Who we are",
    paragraphs: [
      <>
        Diamond Booking (&ldquo;Diamond,&rdquo; &ldquo;we,&rdquo;
        &ldquo;us&rdquo;) provides booking, scheduling, and business
        management software for home service companies. This policy explains
        what personal data we collect, why we collect it, and the choices you
        have. It covers our marketing website, the Diamond Booking
        application, and the embeddable booking widget.
      </>,
      <>
        Two kinds of people interact with Diamond: <b>account holders</b>{" "}
        (business owners, office staff, and technicians who sign in) and{" "}
        <b>end customers</b> (people who book services from a business that
        uses Diamond). We treat their data differently, as described below.
      </>,
    ],
  },
  {
    id: "data-we-collect",
    heading: "Data we collect",
    paragraphs: [
      <>
        <b>Account data.</b> When a business signs up we collect the business
        name, your name, email address, password (stored only as a salted
        hash), industry, and team member profiles you create.
      </>,
      <>
        <b>Booking data.</b> Appointments, services, notes, schedules,
        invoices, and related records that businesses create in the normal
        course of using the platform.
      </>,
      <>
        <b>Payment data.</b> Card and bank details are collected and stored by
        our payment processor, Stripe — they never touch Diamond&rsquo;s
        servers. We store only non-sensitive references (such as the last four
        digits and payment status).
      </>,
      <>
        <b>Usage data.</b> Log data, device and browser type, and in-product
        events that help us keep the service reliable and improve it. We do
        not sell this data or use it for third-party advertising.
      </>,
    ],
  },
  {
    id: "customer-data",
    heading: "Your customers' data",
    paragraphs: [
      <>
        When an end customer books through a business on Diamond, the booking
        details (name, contact information, service address, appointment
        history) belong to that business. Diamond processes this data as a{" "}
        <b>service provider / data processor</b> on the business&rsquo;s
        instructions. We never contact a business&rsquo;s customers for our
        own marketing, and we never sell customer lists.
      </>,
      <>
        Businesses on Diamond are responsible for having a lawful basis to
        collect their customers&rsquo; data and for honoring deletion
        requests, which the platform supports directly.
      </>,
    ],
  },
  {
    id: "how-we-use-data",
    heading: "How we use data",
    paragraphs: [
      <>
        We use data to operate the service (scheduling, reminders, payments,
        dispatch), to secure accounts and prevent fraud and abuse, to provide
        support, to send transactional messages (confirmations, reminders,
        receipts), and — for account holders only, with opt-out — occasional
        product updates. We do not use your data to train third-party AI
        models or serve behavioral advertising.
      </>,
    ],
  },
  {
    id: "subprocessors",
    heading: "Sub-processors",
    paragraphs: [
      <>
        We rely on a short list of infrastructure providers to run Diamond:
        Supabase (database and authentication), Stripe (payments), Resend
        (transactional email), and our cloud hosting provider. Each is bound
        by a data processing agreement and processes data only on our
        instructions. A current list is available on request at{" "}
        <a className="font-semibold text-blue-600 hover:underline" href="mailto:legal@diamondbooking.com">
          legal@diamondbooking.com
        </a>
        .
      </>,
    ],
  },
  {
    id: "retention",
    heading: "Retention & export",
    paragraphs: [
      <>
        Your data stays in your account for as long as the account is active.
        After cancellation, data remains exportable for 90 days, then is
        deleted from production systems within 30 further days (backups age
        out on a rolling schedule of up to 35 days). You can export
        customers, bookings, and invoices as CSV at any time — no support
        ticket required.
      </>,
    ],
  },
  {
    id: "security",
    heading: "Security",
    paragraphs: [
      <>
        All traffic is encrypted in transit (TLS 1.2+) and data is encrypted
        at rest. Access to production systems is restricted, logged, and
        reviewed. Every account is isolated at the database layer with
        row-level security. If we ever become aware of a breach affecting
        your data, we will notify you without undue delay and within any
        legally required window.
      </>,
    ],
  },
  {
    id: "your-rights",
    heading: "Your rights",
    paragraphs: [
      <>
        Depending on where you live (including under GDPR and CCPA/CPRA), you
        may have the right to access, correct, export, restrict, or delete
        your personal data, and to object to certain processing. Account
        holders can exercise most of these directly in the product; for
        anything else, email us and we will respond within 30 days. We do not
        discriminate against anyone for exercising a privacy right.
      </>,
    ],
  },
  {
    id: "cookies",
    heading: "Cookies",
    paragraphs: [
      <>
        We use strictly necessary cookies to keep you signed in and remember
        preferences, plus privacy-respecting, aggregate analytics on the
        marketing site. We do not use cross-site tracking cookies or
        third-party advertising pixels.
      </>,
    ],
  },
  {
    id: "children",
    heading: "Children",
    paragraphs: [
      <>
        Diamond Booking is a business tool and is not directed at children
        under 16. We do not knowingly collect personal data from children; if
        you believe a child has provided us data, contact us and we will
        delete it.
      </>,
    ],
  },
  {
    id: "changes",
    heading: "Changes to this policy",
    paragraphs: [
      <>
        If we make material changes, we will notify account holders by email
        at least 14 days before they take effect and update the date at the
        top of this page. Minor clarifications may be posted without notice.
      </>,
    ],
  },
  {
    id: "contact",
    heading: "Contact",
    paragraphs: [
      <>
        Privacy questions or requests:{" "}
        <a className="font-semibold text-blue-600 hover:underline" href="mailto:legal@diamondbooking.com">
          legal@diamondbooking.com
        </a>
        . General support:{" "}
        <a className="font-semibold text-blue-600 hover:underline" href="mailto:support@diamondbooking.com">
          support@diamondbooking.com
        </a>
        .
      </>,
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Your data, in"
      emphasis="plain terms."
      docName="Diamond Booking Privacy Policy"
      updated="August 15, 2026"
      intro="No forty-page maze. This is what we collect, why we collect it, and the rights you keep — written to be read, not skimmed past."
      sections={sections}
    />
  );
}
