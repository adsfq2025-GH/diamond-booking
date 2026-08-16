/*
  TEMPLATE CONTENT — these terms of service are standard SaaS template
  text drafted by the product team. They MUST be reviewed and approved
  by legal counsel before launch. Do not treat as final legal language.
*/
import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/sections/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern use of Diamond Booking — trials, billing, acceptable use, data ownership, and everything in between.",
};

const sections: LegalSection[] = [
  {
    id: "agreement",
    heading: "The agreement",
    paragraphs: [
      <>
        These Terms of Service (&ldquo;Terms&rdquo;) are a contract between
        your business and Diamond Booking (&ldquo;Diamond,&rdquo;
        &ldquo;we,&rdquo; &ldquo;us&rdquo;). By creating an account or using
        the service you accept them on behalf of the business you represent,
        and you confirm you have authority to do so.
      </>,
    ],
  },
  {
    id: "the-service",
    heading: "The service",
    paragraphs: [
      <>
        Diamond provides booking, scheduling, dispatch, payment, and business
        management software for home service companies, including an
        embeddable booking widget and a hosted booking page. We may improve
        or modify features over time; we will not materially reduce the core
        functionality of your paid plan during a paid term.
      </>,
    ],
  },
  {
    id: "accounts",
    heading: "Accounts & roles",
    paragraphs: [
      <>
        You are responsible for the accuracy of your account information, the
        security of your credentials, and the actions of team members you
        invite. Role permissions (owner, staff, technician) exist to limit
        access — assign them thoughtfully. Tell us promptly at{" "}
        <a className="font-semibold text-blue-600 hover:underline" href="mailto:support@diamondbooking.com">
          support@diamondbooking.com
        </a>{" "}
        if you suspect unauthorized use.
      </>,
    ],
  },
  {
    id: "trial-billing",
    heading: "Trial & billing",
    paragraphs: [
      <>
        Every plan starts with a 7-day free trial. No payment method is
        required for the trial and nothing is charged automatically when it
        ends. Paid subscriptions bill monthly or yearly in advance; yearly
        plans are priced at ten months for twelve. Upgrades prorate
        immediately; downgrades apply at the next renewal.
      </>,
      <>
        You can cancel at any time, effective at the end of the paid period.
        Unused full months of a yearly plan are refunded on request. Prices
        may change with at least 30 days&rsquo; notice, never mid-term.
      </>,
    ],
  },
  {
    id: "fees-taxes",
    heading: "Fees & taxes",
    paragraphs: [
      <>
        Plan prices exclude taxes; where required we collect applicable
        sales tax or VAT. Payments you accept from your customers are
        processed by Stripe under Stripe&rsquo;s own terms and processing
        fees — Diamond adds no markup and never holds your funds.
      </>,
    ],
  },
  {
    id: "your-data",
    heading: "Your data",
    paragraphs: [
      <>
        Your business data — customers, bookings, invoices, notes — is yours.
        You grant us a license to host and process it solely to provide the
        service, as described in our{" "}
        <a className="font-semibold text-blue-600 hover:underline" href="/privacy">
          Privacy Policy
        </a>
        . You can export it as CSV at any time, and it remains exportable for
        90 days after cancellation.
      </>,
    ],
  },
  {
    id: "acceptable-use",
    heading: "Acceptable use",
    paragraphs: [
      <>
        Use Diamond for lawful business scheduling. You may not use the
        service to send spam, to violate telemarketing or messaging laws, to
        infringe others&rsquo; rights, to probe or disrupt our systems, or to
        resell the platform without a written agreement. We may suspend
        accounts that put the platform or other customers at risk, with
        notice where practical.
      </>,
    ],
  },
  {
    id: "messaging",
    heading: "SMS & email compliance",
    paragraphs: [
      <>
        Reminder and marketing messages are sent on your behalf, at your
        direction. You are responsible for having consent to contact your
        customers and for complying with applicable messaging laws (such as
        TCPA and CAN-SPAM in the US). Diamond enforces opt-out handling
        automatically: a customer who unsubscribes stops receiving messages
        from your account.
      </>,
    ],
  },
  {
    id: "ip",
    heading: "Intellectual property",
    paragraphs: [
      <>
        Diamond owns the platform, its design, and its code. You own your
        data and your branding. Feedback you send us may be used to improve
        the product without obligation. Neither side gains rights to the
        other&rsquo;s trademarks.
      </>,
    ],
  },
  {
    id: "termination",
    heading: "Termination",
    paragraphs: [
      <>
        You may close your account at any time. We may terminate for material
        breach if it remains uncured 14 days after notice, or immediately for
        serious abuse. On termination, your data follows the retention and
        export schedule in the Privacy Policy.
      </>,
    ],
  },
  {
    id: "disclaimers",
    heading: "Warranty disclaimer",
    paragraphs: [
      <>
        The service is provided &ldquo;as is.&rdquo; We work hard to keep it
        fast and available (and have the uptime record to show for it), but
        we cannot promise it will be uninterrupted or error-free, and we
        disclaim implied warranties to the extent the law allows.
      </>,
    ],
  },
  {
    id: "liability",
    heading: "Limitation of liability",
    paragraphs: [
      <>
        To the maximum extent permitted by law, neither party is liable for
        indirect, incidental, or consequential damages, and Diamond&rsquo;s
        total liability under these Terms is capped at the amounts you paid
        us in the 12 months before the claim. Nothing in these Terms limits
        liability that cannot lawfully be limited.
      </>,
    ],
  },
  {
    id: "changes",
    heading: "Changes to these terms",
    paragraphs: [
      <>
        If we make material changes, we will notify account holders by email
        at least 30 days before they take effect. Continued use after the
        effective date constitutes acceptance; if you disagree, you may
        cancel and receive a pro-rated refund of any prepaid, unused term.
      </>,
    ],
  },
  {
    id: "law-contact",
    heading: "Governing law & contact",
    paragraphs: [
      <>
        These Terms are governed by the laws of the State of Delaware,
        excluding its conflict-of-law rules, and disputes will be resolved in
        the state or federal courts located there. Questions:{" "}
        <a className="font-semibold text-blue-600 hover:underline" href="mailto:legal@diamondbooking.com">
          legal@diamondbooking.com
        </a>
        .
      </>,
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Fair terms for"
      emphasis="working businesses."
      docName="Diamond Booking Terms of Service"
      updated="August 15, 2026"
      intro="The contract behind the product, in readable English: what you get, what we promise, and what we ask of each other."
      sections={sections}
    />
  );
}
