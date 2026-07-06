#!/usr/bin/env node
// CHANTER MCP Server – Entry point.
// Starts the MCP server over stdio transport.

import { startServer } from "./server.js";

startServer().catch((err) => {
  console.error("FATAL: Failed to start CHANTER MCP Server:", err);
  process.exit(1);
});
