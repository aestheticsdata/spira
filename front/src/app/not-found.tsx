import { ROUTES } from "@components/shared/config/constants";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
      <p className="identifier text-11 tracking-key text-ink-8">404</p>
      <p className="text-15 text-ink-2">That identifier does not resolve.</p>
      <Link
        href={ROUTES.projects.path}
        className="text-125 text-ink-link hover:text-ink-link-hover"
      >
        Back to projects
      </Link>
    </div>
  );
}
