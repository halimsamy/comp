'use client';

import { jsPDF } from 'jspdf';
import { orgChartToSvg, type ChartEdge, type ChartNode } from './org-chart-svg';

function triggerDownload({ href, fileName }: { href: string; fileName: string }) {
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function svgToPngDataUrl({ svg, width, height }: { svg: string; width: number; height: number }) {
  const scale = 2; // crisp on retina and in print
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to render org chart'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not supported');
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportOrgChart({
  nodes,
  edges,
  name,
  date,
  format,
}: {
  nodes: ChartNode[];
  edges: ChartEdge[];
  name: string;
  date: Date;
  format: 'png' | 'pdf';
}) {
  const dateLabel = date.toISOString().slice(0, 10);
  const rendered = orgChartToSvg({ nodes, edges, title: name, subtitle: `As of ${dateLabel}` });
  const png = await svgToPngDataUrl(rendered);
  const baseName = `${name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-${dateLabel}`;

  if (format === 'png') {
    triggerDownload({ href: png, fileName: `${baseName}.png` });
    return;
  }

  const orientation = rendered.width >= rendered.height ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation, unit: 'pt', format: [rendered.width, rendered.height] });
  doc.addImage(png, 'PNG', 0, 0, rendered.width, rendered.height);
  doc.save(`${baseName}.pdf`);
}
