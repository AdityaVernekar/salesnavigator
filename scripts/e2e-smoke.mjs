const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const checks = [
  "/api/campaigns",
  "/api/leads",
  "/api/inbox",
  "/api/gmail/accounts",
  "/api/agent-configs",
  "/api/tool-registry",
  "/api/mcp-servers",
];

async function run() {
  let failures = 0;

  for (const path of checks) {
    const url = `${baseUrl}${path}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        failures += 1;
        console.error(`[FAIL] ${url} -> ${res.status}`);
      } else {
        console.log(`[OK] ${url}`);
      }
    } catch (error) {
      failures += 1;
      console.error(`[FAIL] ${url} ->`, error.message);
    }
  }

  if (failures > 0) {
    process.exit(1);
  }
}

run();
