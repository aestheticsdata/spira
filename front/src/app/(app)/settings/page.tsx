import { ChangePasswordForm } from "@app/(app)/settings/change-password-form";
import { LabelList } from "@app/(app)/settings/label-list";
import { TokenList } from "@app/(app)/settings/token-list";
import { AppHeader } from "@components/shell/app-header";
import { displayName, initials } from "@lib/account";
import { serverFetch } from "@lib/server-api";

import type { ApiTokenDto, AuthenticatedUserDto, LabelDto } from "@lib/api-types";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings · Spira" };

/** The tools the connector exposes (COS-286). Names mirror Linear's MCP server. */
const MCP_TOOLS = [
  "list_projects",
  "get_project",
  "list_issues",
  "get_issue",
  "save_issue",
  "list_labels",
  "list_issue_statuses",
];

/**
 * The connector is a stdio process the client launches, not an HTTP endpoint — this card used to
 * advertise `/api/mcp`, which was never built and never will be. What it calls is the ordinary REST
 * API with a bearer token, so the address worth showing is the one the token is for.
 */
const MCP_COMMAND = "claude mcp add spira -- node <spira>/mcp/dist/index.js";

export default async function SettingsPage() {
  const [user, labels, tokens] = await Promise.all([
    serverFetch<AuthenticatedUserDto>("/users/me"),
    serverFetch<LabelDto[]>("/labels"),
    serverFetch<ApiTokenDto[]>("/tokens"),
  ]);

  const liveToken = tokens.find((token) => token.revokedAt === null) ?? null;

  return (
    <>
      <AppHeader leaf="Settings" />

      <div className="sp-scroll min-h-0 flex-1 overflow-y-auto pt-10 pb-20">
        <div className="mx-auto flex max-w-[720px] flex-col gap-[30px] px-6">
          <div>
            <h1 className="text-22 font-semibold tracking-title text-ink-1">Settings</h1>
            <p className="mt-[9px] text-135 text-ink-5">
              No invites, no roles. Everything below belongs to this account and is invisible to any other.
            </p>
          </div>

          <section className="overflow-hidden rounded-2xl border border-line">
            <div className="border-b border-line bg-surface px-4 py-[13px] text-125 font-semibold text-ink-3">
              Account
            </div>
            {/* Wrapping so the password form, when open, drops onto its own line
                under the row instead of squeezing into it. */}
            <div className="flex flex-wrap items-center gap-3 p-4">
              <span className="identifier grid size-[30px] place-items-center rounded-full bg-primary-bg text-10 text-primary-ink">
                {initials(user.username)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-13 text-ink-2">{displayName(user.username)}</div>
                {/* The address you sign in with, which the name above drops. */}
                <div className="mt-0.5 truncate text-115 text-ink-7">{user.username}</div>
              </div>
              <ChangePasswordForm />
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-line">
            <div className="flex items-center gap-2.5 border-b border-line bg-surface px-4 py-[13px]">
              <div className="text-125 font-semibold text-ink-3">MCP connector</div>
              {/* The design draws this pill green and connected. It is not, and
                  will not be until the connector ships, so it reads neutral. */}
              <div className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5">
                <span className="size-[5px] rounded-full bg-ink-9" />
                <span className="text-105 text-ink-7">Not configured</span>
              </div>
            </div>
            <div className="flex flex-col gap-3 p-4">
              <div>
                <div className="mb-1.5 text-115 text-ink-7">Register the connector</div>
                <div className="flex h-8 items-center rounded-lg border border-line bg-field px-2.5">
                  <span className="identifier flex-1 truncate text-115 text-ink-9">{MCP_COMMAND}</span>
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-115 text-ink-7">API token</div>
                <div className="flex h-8 items-center rounded-lg border border-line bg-field px-2.5">
                  <span className="identifier flex-1 truncate text-115 text-ink-9">
                    {liveToken ? `spira_pat_${"\u2022".repeat(20)}${liveToken.suffix}` : "No token issued"}
                  </span>
                </div>
              </div>
              <p className="text-125 text-ink-7">
                Issue a token above, build <span className="identifier text-ink-5">mcp/</span>, and register it with the
                command above. States and labels are given by name, and either identifier form works — a legacy{" "}
                <span className="identifier text-ink-5">COS-</span> reference resolves to the issue it became.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {MCP_TOOLS.map((tool) => (
                  <span
                    key={tool}
                    className="identifier rounded-[5px] border border-line bg-surface px-[7px] py-[3px] text-105 text-ink-9"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <TokenList tokens={tokens} />

          <LabelList labels={labels} />
        </div>
      </div>
    </>
  );
}
