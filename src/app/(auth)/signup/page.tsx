import type { Metadata } from "next";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = {
  title: "Start your free trial",
  description:
    "Create your Diamond Booking account — 7-day free trial, no credit card required.",
};

export default function SignupPage() {
  return <SignupForm />;
}
