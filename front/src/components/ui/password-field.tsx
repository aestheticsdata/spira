"use client";

import { cn } from "@lib/utils";
import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";

/**
 * A password input with a reveal toggle, shared by the login form and the
 * change-password form so the two behave identically.
 *
 * Every other prop is forwarded to the `<input>`, which is what lets
 * react-hook-form's `register()` be spread onto it directly — React 19 passes
 * `ref` through as an ordinary prop, so no `forwardRef` is needed.
 *
 * The toggle is `tabIndex={-1}`: tabbing out of the password field should reach
 * the submit button, not a decoration. It stays reachable by pointer and by
 * screen readers, and `aria-pressed` reports the state rather than leaving the
 * icon to carry it alone.
 */
export function PasswordField({
  label,
  error,
  className,
  ...inputProps
}: Omit<React.ComponentProps<"input">, "type"> & {
  label: string;
  error?: string;
}) {
  const generatedId = useId();
  const id = inputProps.id ?? generatedId;
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-115 text-ink-7"
      >
        {label}
      </label>
      <div className="relative">
        <input
          {...inputProps}
          id={id}
          type={revealed ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          className={cn(
            "h-8 w-full rounded-lg border border-line bg-field pr-9 pl-2.5 text-13 text-ink-2 outline-none focus:border-line-focus",
            error && "border-danger",
            className,
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setRevealed((current) => !current)}
          aria-label={revealed ? "Hide password" : "Show password"}
          aria-pressed={revealed}
          className="absolute inset-y-0 right-0 grid w-9 place-items-center text-ink-7 hover:text-ink-3"
        >
          {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {error && <p className="text-11 text-danger">{error}</p>}
    </div>
  );
}
