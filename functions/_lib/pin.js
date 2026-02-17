function toHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input) {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return toHex(digest);
}

export async function hashPin(salt, pin) {
  return sha256Hex(`${salt}:${pin}`);
}
