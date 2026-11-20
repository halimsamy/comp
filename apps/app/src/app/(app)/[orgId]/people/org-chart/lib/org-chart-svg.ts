/** Minimal node/edge shape shared by the live chart and saved snapshots. */
export interface ChartNode {
  id: string;
  position: { x: number; y: number };
  data?: { name?: unknown; title?: unknown };
}
export interface ChartEdge {
  source: string;
  target: string;
}

const NODE_W = 200;
const NODE_H = 64;
const PAD = 40;
const HEADER = 56;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function text(value: unknown, max: number): string {
  const s = typeof value === 'string' ? value : '';
  return escapeXml(s.length > max ? `${s.slice(0, max - 1)}…` : s);
}

/**
 * Renders the org chart as a standalone SVG (white background, dated header) so it
 * can be exported to PNG/PDF without a screenshot library.
 */
export function orgChartToSvg({
  nodes,
  edges,
  title,
  subtitle,
}: {
  nodes: ChartNode[];
  edges: ChartEdge[];
  /** Empty title = no header (the house PDF cover already names the chart). */
  title: string;
  subtitle: string;
}): { svg: string; width: number; height: number } {
  const header = title ? HEADER : 0;
  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  const minX = nodes.length ? Math.min(...xs) : 0;
  const minY = nodes.length ? Math.min(...ys) : 0;
  const chartWidth = (nodes.length ? Math.max(...xs) - minX : 0) + NODE_W + PAD * 2;
  // PDF (no header): the API fits the image to the 174 mm text width, so at least 870 px keeps
  // 14 px names near 8pt instead of enlarging a small chart past the house body text.
  const width = Math.max(title ? 480 : 870, chartWidth);
  const height = (nodes.length ? Math.max(...ys) - minY : 0) + NODE_H + PAD * 2 + header;
  const offsetX = (width - chartWidth) / 2 + PAD;
  const pos = new Map(
    nodes.map((n) => [n.id, { x: n.position.x - minX + offsetX, y: n.position.y - minY + PAD + header }]),
  );

  const lines = edges.flatMap((e) => {
    const from = pos.get(e.source);
    const to = pos.get(e.target);
    if (!from || !to) return [];
    const x1 = from.x + NODE_W / 2;
    const y1 = from.y + NODE_H;
    const x2 = to.x + NODE_W / 2;
    const y2 = to.y;
    const midY = (y1 + y2) / 2;
    return [
      `<path d="M${x1},${y1} V${midY} H${x2} V${y2}" fill="none" stroke="#94a3b8" stroke-width="1.5"/>`,
    ];
  });

  const boxes = nodes.map((n) => {
    const p = pos.get(n.id);
    if (!p) return '';
    return [
      `<rect x="${p.x}" y="${p.y}" width="${NODE_W}" height="${NODE_H}" rx="8" fill="#ffffff" stroke="#cbd5e1"/>`,
      `<text x="${p.x + 16}" y="${p.y + 27}" font-size="14" font-weight="600" fill="#0f172a">${text(n.data?.name, 26)}</text>`,
      `<text x="${p.x + 16}" y="${p.y + 47}" font-size="12" fill="#64748b">${text(n.data?.title, 30)}</text>`,
    ].join('');
  });

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    ...(title
      ? [
          `<text x="${PAD}" y="${PAD}" font-size="18" font-weight="600" fill="#0f172a">${text(title, 80)}</text>`,
          `<text x="${PAD}" y="${PAD + 20}" font-size="12" fill="#64748b">${text(subtitle, 120)}</text>`,
        ]
      : []),
    ...lines,
    ...boxes,
    '</svg>',
  ].join('');

  return { svg, width, height };
}
