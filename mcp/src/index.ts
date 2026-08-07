#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SpiraApiError, SpiraClient } from "./client.js";
import { Resolver } from "./resolve.js";
import { registerReadTools } from "./tools/read.js";
import { registerSaveTool } from "./tools/save.js";

/**
 * Spira's MCP server (COS-286).
 *
 * stdio, launched by the client, talking to Spira's REST API over HTTPS with an API token (C1).
 * Nothing runs on ks-b for this: the API is already there, and a second listening process would be
 * one more thing to deploy, secure and keep alive for no gain.
 *
 * Tool names deliberately mirror Linear's, so the phrasing that works today keeps working after the
 * cutover.
 */

const DEFAULT_BASE_URL = "https://spira.1991computer.com/api";

function readConfig(): { baseUrl: string; token: string } {
  const token = process.env.SPIRA_API_TOKEN;

  if (!token) {
    // stderr, not stdout: stdout is the MCP protocol channel and anything written there is a
    // protocol violation the client sees as a parse error rather than as this message.
    process.stderr.write(
      "spira-mcp: SPIRA_API_TOKEN is not set. Create a token in Spira under Settings → API tokens.\n",
    );
    process.exit(1);
  }

  return { baseUrl: process.env.SPIRA_API_URL ?? DEFAULT_BASE_URL, token };
}

async function main(): Promise<void> {
  const config = readConfig();
  const client = new SpiraClient(config);
  const resolver = new Resolver(client);

  const server = new McpServer(
    { name: "spira", version: "1.0.0" },
    {
      instructions:
        "Spira is a self-hosted issue tracker. Issues are identified as KEY-N (SPI-24). Issues " +
        "imported from Linear also carry their original COS-N identifier, and every tool that takes " +
        "an identifier accepts either form. States and labels are referred to by name.",
    },
  );

  registerReadTools(server, client, resolver);
  registerSaveTool(server, client, resolver);

  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  const message =
    error instanceof SpiraApiError ? `${error.message} (${error.status} on ${error.path})` : String(error);
  process.stderr.write(`spira-mcp: ${message}\n`);
  process.exit(1);
});
