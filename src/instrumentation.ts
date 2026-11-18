export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { scheduleOperationalLogCleanup } = await import("./lib/operational-log");
    scheduleOperationalLogCleanup();
  }
}
