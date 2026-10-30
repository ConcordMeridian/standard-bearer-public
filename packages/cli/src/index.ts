#!/usr/bin/env node
export * from "./commands.js";

import { runCommand } from "./commands.js";

const arguments_ = process.argv.slice(2);
if (arguments_.length > 0) {
  try {
    console.log(await runCommand(arguments_));
  } catch (error) {
    console.error(String(error));
    process.exitCode = 1;
  }
}
