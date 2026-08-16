"use client";

import { useState } from "react";
import { Em } from "@/components/ui/SectionHeading";
import { Label, inputBase } from "@/components/ui/Field";
import {
  StepHeader,
  StepFooter,
  GhostButton,
  Toggle,
  InfoNote,
  WizardError,
} from "../wizard-ui";
import {
  EMPLOYEE_COLORS,
  type TeamInput,
  type TeamMemberInput,
} from "@/lib/onboarding/types";
import { cn } from "@/lib/cn";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

let localSeq = 0;
function nextLocalId() {
  localSeq += 1;
  return `emp-${Date.now()}-${localSeq}`;
}

function blankMember(existing: number): TeamMemberInput {
  return {
    localId: nextLocalId(),
    name: "",
    email: "",
    title: "",
    color: EMPLOYEE_COLORS[(existing + 1) % EMPLOYEE_COLORS.length],
  };
}

function ColorSwatches({
  value,
  onChange,
  name,
}: {
  value: string;
  onChange: (color: string) => void;
  name: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`Calendar color for ${name}`}
      className="flex items-center gap-2"
    >
      {EMPLOYEE_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={`Color ${color}`}
          onClick={() => onChange(color)}
          className={cn(
            "h-6 w-6 cursor-pointer rounded-full border-2 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-expo)]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
            value === color
              ? "scale-110 border-navy-900"
              : "border-transparent hover:scale-110",
          )}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

export function TeamStep({
  value,
  ownerName,
  busy,
  onSubmit,
  onBack,
}: {
  value: TeamInput;
  ownerName: string;
  busy: boolean;
  onSubmit: (next: TeamInput) => void;
  onBack: () => void;
}) {
  const [team, setTeam] = useState<TeamInput>(value);
  const [error, setError] = useState<string | null>(null);

  const updateMember = (localId: string, patch: Partial<TeamMemberInput>) => {
    setTeam((t) => ({
      ...t,
      members: t.members.map((m) =>
        m.localId === localId ? { ...m, ...patch } : m,
      ),
    }));
  };

  const removeMember = (localId: string) => {
    setTeam((t) => ({
      ...t,
      members: t.members.filter((m) => m.localId !== localId),
    }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const filled = team.members.filter((m) => m.name.trim() || m.email.trim());
    for (const m of filled) {
      if (!m.name.trim()) {
        setError("Every teammate needs a name.");
        return;
      }
      if (m.email.trim() && !EMAIL_RE.test(m.email.trim())) {
        setError(`The email for ${m.name.trim()} doesn't look complete.`);
        return;
      }
    }
    if (!team.ownerBookable && filled.length === 0) {
      setError(
        "Someone has to take the jobs — add a teammate or make yourself bookable.",
      );
      return;
    }
    onSubmit({ ...team, members: filled });
  };

  const ownerInitial = (ownerName.trim()[0] ?? "O").toUpperCase();

  return (
    <form noValidate onSubmit={submit}>
      <StepHeader
        step={3}
        title={
          <>
            Who does <Em>the work?</Em>
          </>
        }
        lede="Teammates get their own calendar color and a day-sheet login. Invites go out automatically once email sending is configured."
      />

      <WizardError>{error}</WizardError>

      {/* Owner card */}
      <div className="mb-4 rounded-[14px] border border-navy-900/8 bg-card p-4 shadow-[0_1px_3px_rgb(12_36_64/0.05)] min-[521px]:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3.5">
            <span
              aria-hidden
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full font-display text-[1.05rem] font-bold text-white"
              style={{ backgroundColor: team.ownerColor }}
            >
              {ownerInitial}
            </span>
            <div>
              <p className="text-[0.92rem] font-semibold text-ink">{ownerName}</p>
              <p className="text-[0.76rem] text-ink-faint">
                Owner · that&rsquo;s you
              </p>
            </div>
          </div>
          <Toggle
            id="owner-bookable"
            checked={team.ownerBookable}
            onChange={(next) => setTeam((t) => ({ ...t, ownerBookable: next }))}
            label="I take bookings too"
            description="Adds you to the calendar so customers can book you directly."
          />
          {team.ownerBookable && (
            <div>
              <p className="mb-2 text-[0.8rem] font-semibold text-ink">
                Your calendar color
              </p>
              <ColorSwatches
                value={team.ownerColor}
                onChange={(color) => setTeam((t) => ({ ...t, ownerColor: color }))}
                name={ownerName}
              />
            </div>
          )}
        </div>
      </div>

      {/* Members */}
      <div className="flex flex-col gap-4">
        {team.members.map((m, index) => (
          <div
            key={m.localId}
            className="rounded-[14px] border border-navy-900/8 bg-card p-4 shadow-[0_1px_3px_rgb(12_36_64/0.05)] min-[521px]:p-5"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-gold-100 px-2.5 py-1 text-[0.66rem] font-bold tracking-[0.08em] text-gold-700 uppercase">
                <span aria-hidden className="h-1.5 w-1.5 rotate-45 bg-gold-500" />
                Invite queued
              </span>
              <button
                type="button"
                onClick={() => removeMember(m.localId)}
                aria-label={`Remove ${m.name || `teammate ${index + 1}`}`}
                className="cursor-pointer rounded-[8px] px-2 py-1 text-[0.78rem] font-semibold text-ink-faint transition-colors duration-[var(--duration-fast)] hover:bg-[#fdf6f5] hover:text-[#a63d39] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
              >
                Remove
              </button>
            </div>

            <div className="grid gap-4 min-[641px]:grid-cols-2">
              <div>
                <Label htmlFor={`${m.localId}-name`}>Full name</Label>
                <input
                  id={`${m.localId}-name`}
                  type="text"
                  placeholder="Maria Lopez"
                  value={m.name}
                  onChange={(e) => updateMember(m.localId, { name: e.target.value })}
                  className={inputBase}
                />
              </div>
              <div>
                <Label htmlFor={`${m.localId}-email`}>Email for the invite</Label>
                <input
                  id={`${m.localId}-email`}
                  type="email"
                  placeholder="maria@yourbusiness.com"
                  value={m.email}
                  onChange={(e) => updateMember(m.localId, { email: e.target.value })}
                  className={inputBase}
                />
              </div>
              <div>
                <Label htmlFor={`${m.localId}-title`} hint="Optional">
                  Title
                </Label>
                <input
                  id={`${m.localId}-title`}
                  type="text"
                  placeholder="Senior Technician"
                  value={m.title}
                  onChange={(e) => updateMember(m.localId, { title: e.target.value })}
                  className={inputBase}
                />
              </div>
              <div>
                <p className="mb-1.5 text-[0.8rem] font-semibold text-ink">
                  Calendar color
                </p>
                <div className="flex h-[46px] items-center">
                  <ColorSwatches
                    value={m.color}
                    onChange={(color) => updateMember(m.localId, { color })}
                    name={m.name || `teammate ${index + 1}`}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <GhostButton
          onClick={() => {
            setTeam((t) => ({
              ...t,
              members: [...t.members, blankMember(t.members.length)],
            }));
            setError(null);
          }}
        >
          + Add a teammate
        </GhostButton>

        {team.members.length > 0 && (
          <InfoNote>
            <b className="font-semibold">Invites are queued, not sent.</b>{" "}
            Email sending is configured in the integrations phase — each
            teammate&rsquo;s invite goes out automatically the moment it&rsquo;s
            live.
          </InfoNote>
        )}
      </div>

      <StepFooter busy={busy} onBack={onBack} />
    </form>
  );
}
