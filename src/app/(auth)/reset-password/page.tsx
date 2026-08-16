import type { Metadata } from "next";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: "Set a new password for your Diamond Booking account.",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
