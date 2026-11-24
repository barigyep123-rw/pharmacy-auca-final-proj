export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { initDb } = await import("./lib/db");
  await initDb();
  const { scanIfDue } = await import("./lib/reorder");
  const run = () => {
    void scanIfDue().catch(() => undefined);
  };
  run();
  setInterval(run, 60 * 60 * 1000).unref?.();
}
