'use client';

import { type FrameworkTrend, useComplianceTrends } from '@/hooks/use-overview';
import {
  Button,
  Card,
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  Text,
} from '@trycompai/design-system';
import { ChartLine } from '@trycompai/design-system/icons';
import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

const RANGES = [
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
  { days: 180, label: '6m' },
  { days: 365, label: '12m' },
] as const;

// Same-hue palette, so series also differ by dash pattern.
const COLORS = [
  'var(--chart-5)',
  'var(--chart-2)',
  'var(--chart-4)',
  'var(--chart-1)',
  'var(--chart-3)',
];
const DASHES = [undefined, '6 4', '2 3', '10 3 2 3', '4 2'];

const formatDay = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

/** One row per day with a `score_<n>` column per framework, for recharts. */
export function toChartRows(frameworks: FrameworkTrend[]) {
  const rows = new Map<string, Record<string, string | number>>();
  frameworks.forEach((framework, index) => {
    for (const point of framework.points) {
      const row = rows.get(point.date) ?? { date: point.date };
      row[`score_${index}`] = point.scorePercent;
      rows.set(point.date, row);
    }
  });
  return [...rows.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function ComplianceTrendCard() {
  const [days, setDays] = useState<number>(90);
  const { frameworks, isLoading, hasError, mutate } = useComplianceTrends({ days });

  const rows = useMemo(() => (frameworks ? toChartRows(frameworks) : []), [frameworks]);
  const config = useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        (frameworks ?? []).map((framework, index) => [
          `score_${index}`,
          { label: framework.frameworkName, color: COLORS[index % COLORS.length] },
        ]),
      ),
    [frameworks],
  );

  return (
    <Card
      title="Framework progress"
      description="Daily compliance score per framework"
      width="full"
      headerAction={
        <Tabs value={String(days)} onValueChange={(value) => setDays(Number(value))}>
          <TabsList variant="underline">
            {RANGES.map((range) => (
              <TabsTrigger key={range.days} value={String(range.days)}>
                {range.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
    >
      {isLoading && !frameworks ? (
        <Skeleton style={{ height: 240, width: '100%' }} />
      ) : hasError || !frameworks ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text size="sm" variant="muted">
            We couldn&apos;t load score history.
          </Text>
          <Button size="sm" variant="outline" onClick={() => mutate()}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-[240px] flex-col items-center justify-center gap-2 text-center">
          <ChartLine size={24} className="text-muted-foreground" />
          <Text size="sm" variant="muted">
            Score history starts with tonight&apos;s daily snapshot.
          </Text>
        </div>
      ) : (
        <div className="h-[240px] w-full" data-testid="compliance-trend-chart">
          <ChartContainer
            config={config}
            style={{ aspectRatio: 'auto', height: '100%', width: '100%' }}
          >
            <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDay}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent labelFormatter={(label) => formatDay(String(label))} />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              {frameworks.map((framework, index) => (
                <Line
                  key={framework.frameworkInstanceId}
                  dataKey={`score_${index}`}
                  name={`score_${index}`}
                  type="monotone"
                  stroke={`var(--color-score_${index})`}
                  strokeWidth={2}
                  strokeDasharray={DASHES[index % DASHES.length]}
                  dot={rows.length === 1}
                  connectNulls
                />
              ))}
            </LineChart>
          </ChartContainer>
        </div>
      )}
    </Card>
  );
}
