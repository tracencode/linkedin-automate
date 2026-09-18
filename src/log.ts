export function log(message: string) {
  const stamp = new Date().toISOString().replace("T", " ").replace("Z", "Z");
  console.log(`[${stamp}] ${message}`);
}

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
