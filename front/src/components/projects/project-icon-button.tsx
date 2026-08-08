"use client";

import { DEFAULT_PROJECT_COLOR } from "@components/projects/project-form.util";
import { IconPicker } from "@components/ui/icon-picker";
import useRequestHelper from "@helpers/useRequestHelper";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { ProjectDto } from "@lib/api-types";

/** How long a colour drag settles before its PATCH goes out. */
const COLOR_SAVE_DELAY_MS = 400;

/**
 * A project's icon, editable in place (COS-458) — on the overview header and
 * on every row of the projects list, which is where Linear opens this popup.
 *
 * Icon and colour both live here now, because the picker carries both. An
 * icon click saves immediately and closes; colour changes are debounced —
 * dragging across the custom picker is hundreds of values a second, and only
 * the one it settles on is worth a request. Both are drawn before the request
 * answers and put back if it fails: a picker that waits for a round trip
 * before showing anything feels broken.
 */
export function ProjectIconButton({
  project,
  size = 36,
  glyph = 28,
  className,
}: {
  project: Pick<ProjectDto, "key" | "name" | "icon" | "color">;
  size?: number;
  glyph?: number;
  className?: string;
}) {
  const router = useRouter();
  const { privateRequest } = useRequestHelper();

  const [icon, setIcon] = useState(project.icon ?? "");
  const [color, setColor] = useState(project.color ?? DEFAULT_PROJECT_COLOR);

  /** What the server last confirmed — where a failed save falls back to. */
  const saved = useRef({ icon: project.icon ?? "", color: project.color ?? DEFAULT_PROJECT_COLOR });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const patch = async (body: { icon?: string | null; color?: string }) => {
    try {
      await privateRequest<ProjectDto>(`/projects/${project.key}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      saved.current = {
        icon: body.icon === undefined ? saved.current.icon : (body.icon ?? ""),
        color: body.color ?? saved.current.color,
      };
      // Everything else on the page — the sidebar, the header, the projects
      // list — is server-rendered from the same row.
      router.refresh();
    } catch (error) {
      setIcon(saved.current.icon);
      setColor(saved.current.color);
      toast.error(error instanceof Error ? error.message : "The project could not be saved.");
    }
  };

  const onIcon = (next: string) => {
    setIcon(next);
    clearTimeout(timer.current);
    const body: { icon: string | null; color?: string } = { icon: next === "" ? null : next };
    if (color !== saved.current.color) {
      body.color = color;
    }
    void patch(body);
  };

  const onColor = (next: string) => {
    setColor(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void patch({ color: next });
    }, COLOR_SAVE_DELAY_MS);
  };

  return (
    <IconPicker
      value={icon}
      onChange={onIcon}
      color={color}
      onColorChange={onColor}
      size={size}
      glyph={glyph}
      label={`Change the ${project.name} icon`}
      className={className}
    />
  );
}
