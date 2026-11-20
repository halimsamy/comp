import { describe, expect, it } from 'vitest';
import { orgChartToSvg } from './org-chart-svg';

describe('orgChartToSvg', () => {
  const nodes = [
    { id: 'a', position: { x: 100, y: 50 }, data: { name: 'Ada <CEO>', title: 'Chief Executive' } },
    { id: 'b', position: { x: 0, y: 200 }, data: { name: 'Bob', title: 'CTO' } },
  ];

  it('draws every node and edge, escaping text', () => {
    const { svg, width, height } = orgChartToSvg({
      nodes,
      edges: [{ source: 'a', target: 'b' }, { source: 'a', target: 'missing' }],
      title: 'Org chart',
      subtitle: 'As of 2026-11-18',
    });
    expect(svg.match(/<rect x=/g)).toHaveLength(2);
    expect(svg.match(/<path /g)).toHaveLength(1);
    expect(svg).toContain('Ada &lt;CEO&gt;');
    expect(svg).toContain('As of 2026-11-18');
    expect(width).toBeGreaterThanOrEqual(480);
    expect(height).toBeGreaterThan(200);
  });

  it('pads a small PDF chart (no header) to 870 px and centres it', () => {
    const { svg, width } = orgChartToSvg({ nodes, edges: [], title: '', subtitle: '' });
    expect(width).toBe(870);
    // chart is 100 + 200 + 2 * 40 = 380 px wide, so it starts (870 - 380) / 2 + 40 = 285 px in
    expect(svg).toContain('<rect x="285" y="190"');
  });

  it('handles an empty chart', () => {
    const { svg } = orgChartToSvg({ nodes: [], edges: [], title: 'Empty', subtitle: '' });
    expect(svg.startsWith('<svg')).toBe(true);
  });
});
