"use client";

import { Button } from "@components/ui/button";
import { PasswordField } from "@components/ui/password-field";
import useRequestHelper from "@helpers/useRequestHelper";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    newPassword: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string().min(1, "Required"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "The two entries differ",
  });

type ChangePasswordValues = z.infer<typeof schema>;

const EMPTY: ChangePasswordValues = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export function ChangePasswordForm() {
  const { privateRequest } = useRequestHelper();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });

  const close = () => {
    setOpen(false);
    reset(EMPTY);
  };

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      await privateRequest<{ ok: true }>("/users/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      toast.success("Password changed.");
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The password could not be changed.");
    }
  });

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="xs"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        Change password
      </Button>

      {open && (
        <form
          onSubmit={onSubmit}
          className="flex w-full flex-col gap-3 border-t border-line-soft pt-3.5"
        >
          <div className="grid gap-2.5 sm:grid-cols-3">
            <PasswordField
              label="Current password"
              autoComplete="current-password"
              error={errors.currentPassword?.message}
              {...register("currentPassword")}
            />
            <PasswordField
              label="New password"
              autoComplete="new-password"
              error={errors.newPassword?.message}
              {...register("newPassword")}
            />
            <PasswordField
              label="Repeat new password"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              {...register("confirmPassword")}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="submit"
              variant="primary"
              size="xs"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving…" : "Save password"}
            </Button>
            <span className="text-11 text-ink-8">Eight characters minimum. The session survives the change.</span>
          </div>
        </form>
      )}
    </>
  );
}
