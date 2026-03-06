export interface Env {
  APP_URL: string;
  CRON_SECRET: string;
}

async function trigger(env: Env) {
  const response = await fetch(`${env.APP_URL}/api/cron/lead-gen`, {
    method: "POST",
    headers: { "x-cron-secret": env.CRON_SECRET },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to trigger /api/cron/lead-gen: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ""}`,
    );
  }
}

const worker = {
  async scheduled(_event: unknown, env: Env) {
    await trigger(env);
  },
  async fetch(_request: Request, env: Env) {
    await trigger(env);
    return new Response("ok");
  },
};

export default worker;
