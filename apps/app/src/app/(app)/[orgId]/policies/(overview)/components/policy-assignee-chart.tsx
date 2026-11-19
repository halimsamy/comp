'use client';

import * as React from 'react';

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@trycompai/ui/chart';
import { Card, HStack, Text } from '@trycompai/design-system';
import { UserMultiple } from '@trycompai/design-system/icons';
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { UNASSIGNED_ID, type AssigneeData } from '../lib/compute-overview';

interface PolicyAssigneeChartProps {
  data?: AssigneeData[] | null;
}

const BAR_COLOR = 'var(--primary)';
const UNASSIGNED_COLOR = 'var(--warning)';
const MAX_BARS = 5;

export function PolicyAssigneeChart({ data }: PolicyAssigneeChartProps) {
  // Unassigned first (it is the gap to close), then owners by policy count.
  const sortedData = React.useMemo(() => {
    if (!data || data.length === 0) return [];
    const unassigned = data.filter((d) => d.id === UNASSIGNED_ID);
    const owners = data.filter((d) => d.id !== UNASSIGNED_ID).sort((a, b) => b.total - a.total);
    return [...unassigned, ...owners].slice(0, MAX_BARS);
  }, [data]);

  const totalAssignees = data?.filter((d) => d.id !== UNASSIGNED_ID).length ?? 0;
  const unassignedCount = data?.find((d) => d.id === UNASSIGNED_ID)?.total ?? 0;

  if (!data || data.length === 0) {
    return (
      <Card title="Policies by Owner" width="full" size="sm" spacing="tight">
        <div className="flex h-[120px] flex-col items-center justify-center gap-2">
          <UserMultiple size={20} className="text-muted-foreground opacity-30" />
          <Text size="xs" variant="muted">
            No active policies
          </Text>
        </div>
        <div className="border-t border-border pt-3 mt-3">
          <HStack justify="end" align="center">
            <Text size="xs" variant="muted">
              0 owners
            </Text>
          </HStack>
        </div>
      </Card>
    );
  }

  const chartData = sortedData.map((item) => ({
    name: item.name.split(' ')[0], // First name only for cleaner display
    fullName: item.name,
    total: item.total,
    fill: item.id === UNASSIGNED_ID ? UNASSIGNED_COLOR : BAR_COLOR,
  }));

  const chartConfig = {
    total: {
      label: 'Policies',
      color: BAR_COLOR,
    },
  } satisfies ChartConfig;

  // Fixed height to match Policy Status chart, with scrolling for many assignees
  const barHeight = 24;
  const chartHeight = sortedData.length * barHeight;
  const containerHeight = 120; // Match Policy Status chart height
  const actualChartHeight = Math.max(chartHeight, containerHeight);

  const showingLimited = data.length > MAX_BARS;

  return (
    <Card title="Policies by Owner" width="full" size="sm" spacing="tight">
      <div className="flex items-center px-2 h-[120px] overflow-y-auto">
        <ChartContainer
          config={chartConfig}
          className="w-full"
          style={{ height: actualChartHeight }}
        >
          <ResponsiveContainer width="100%" height={actualChartHeight}>
            <BarChart
              data={chartData}
              layout="vertical"
              barSize={16}
              margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
            >
              <XAxis type="number" hide />
              <YAxis
                dataKey="name"
                type="category"
                tickLine={false}
                tickMargin={8}
                axisLine={false}
                fontSize={12}
                stroke="hsl(var(--muted-foreground))"
                width={60}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(value, name, props) => (
                      <span>
                        {props.payload.fullName}: {value} policies
                      </span>
                    )}
                  />
                }
              />
              <Bar dataKey="total" radius={[0, 4, 4, 0]} animationDuration={600}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
                <LabelList
                  dataKey="total"
                  position="right"
                  fontSize={11}
                  fill="hsl(var(--muted-foreground))"
                  offset={8}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
      <div className="border-t border-border pt-3 mt-3">
        <HStack justify="between" align="center">
          <Text size="xs" variant={unassignedCount > 0 ? 'warning' : 'muted'}>
            {unassignedCount > 0 ? `${unassignedCount} without an owner` : 'Every policy has an owner'}
          </Text>
          <Text size="xs" variant="muted">
            {showingLimited ? `Top ${MAX_BARS} of ${data.length}` : `${totalAssignees} owners`}
          </Text>
        </HStack>
      </div>
    </Card>
  );
}
