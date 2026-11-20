export function tr(src: string, args?: readonly unknown[]): string {
  if (!args || args.length === 0) return src;
  return src.replace(/\{(\d+)\}/g, (m, i: string) => (Number(i) < args.length ? String(args[Number(i)]) : m));
}
