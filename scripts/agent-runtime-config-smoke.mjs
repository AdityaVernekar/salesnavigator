import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

const checks = [
  {
    name: "migration creates versioning tables",
    file: "supabase/migrations/005_agent_runtime_config_versioning.sql",
    includes: [
      "create table if not exists agent_config_versions",
      "create table if not exists tool_registry",
      "create table if not exists mcp_servers",
      "add column if not exists config_version_id",
    ],
  },
  {
    name: "pipeline workflow uses runtime builder",
    file: "src/mastra/workflows/sales-pipeline.ts",
    includes: [
      'import { buildRuntimeAgent }',
      'buildRuntimeAgent(mastra, "lead_gen")',
      "configVersionId",
      "toolsRejected",
    ],
  },
  {
    name: "follow-up workflow uses runtime builder",
    file: "src/mastra/workflows/follow-up.ts",
    includes: ['buildRuntimeAgent(mastra, "followup")'],
  },
  {
    name: "agent configs API supports activation",
    file: "src/app/api/agent-configs/route.ts",
    includes: ['action === "activate"', 'action === "rollback"'],
  },
  {
    name: "tool registry API exists",
    file: "src/app/api/tool-registry/route.ts",
    includes: ["registerMcpToolSchema", "register_cursor_mcp_json", "activate_tool"],
  },
];

async function run() {
  let failures = 0;
  for (const check of checks) {
    const fullPath = resolve(root, check.file);
    const content = await readFile(fullPath, "utf8");
    const missing = check.includes.filter((needle) => !content.includes(needle));
    if (missing.length) {
      failures += 1;
      console.error(`[FAIL] ${check.name}`);
      for (const needle of missing) {
        console.error(`  missing: ${needle}`);
      }
      continue;
    }
    console.log(`[OK] ${check.name}`);
  }

  if (failures > 0) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error("[FAIL] smoke runner crashed", error);
  process.exit(1);
});
