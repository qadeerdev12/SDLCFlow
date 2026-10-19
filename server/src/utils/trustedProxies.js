import { isIP } from 'node:net';

// Only explicit proxy addresses/subnets are allowed, never blanket trust or
// hop counts: shorter network paths can otherwise allow forged client IPs.
export function trustedProxies(value = process.env.TRUSTED_PROXY_CIDRS || '') {
  if (!value.trim()) return false;
  const entries = value.split(',').map((entry) => entry.trim());
  for (const entry of entries) {
    const [address, prefix, extra] = entry.split('/');
    const family = isIP(address);
    const max = family === 4 ? 32 : 128;
    if (!family || extra !== undefined || (prefix !== undefined &&
        (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > max))) {
      throw new Error('TRUSTED_PROXY_CIDRS must contain explicit proxy IP addresses or non-zero CIDR ranges.');
    }
  }
  return entries;
}
