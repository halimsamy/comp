'use client';

import * as React from 'react';
import { Label, Pie, PieChart } from 'recharts';

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@trycompai/ui/chart';
import { Card, HStack, Stack, Text } from '@trycompai/design-system';
import { Information } from '@trycompai/design-system/icons';
import {
  POLICY_STAGE_COLORS,
  POLICY_STAGE_LABELS,
  type PolicyLifecycleStage,
} from '../../lib/policy-stage';
import type { PoliciesOverview } from '../lib/compute-overview';

interface PolicyStatusChartProps {
  data?: PoliciesOverview | null;
}

const LEGEND: { key: PolicyLifecycleStage | 'archived'; name: string }[] = [
  { key: 'published', name: POLICY_STAGE_LABELS.published },
  { key: 'pending_approval', name: POLICY_STAGE_LABELS.pending_approval },
  { key: 'review_due', name: POLICY_STAGE_LABELS.review_due },
  { key: 'draft', name: POLICY_STAGE_LABELS.draft },
  { key: 'archived', name: 'Archived' },
];

export function PolicyStatusChart({ data }: PolicyStatusChartProps) {
  // All statuses for the legend (always show all)
  const allStatuses = React.useMemo(() => {
    if (!data) return [];
    return LEGEND.map(({ key, name }) => ({
      key,
      name,
      value: data.byStage[key],
      fill: POLICY_STAGE_COLORS[key],
    }));
  }, [data]);

  // Only non-zero values for the pie chart
  const chartData = React.useMemo(() => {
    return allStatuses.filter((item) => item.value > 0);
  }, [allStatuses]);

  if (!data) {
    return (
      <Card title="Policy by Status" width="full" size="sm" spacing="tight">
        <div className="flex h-[120px] flex-col items-center justify-center gap-2">
          <Information size={20} className="text-muted-foreground opacity-30" />
          <Text size="xs" variant="muted">
            No policy data available
          </Text>
        </div>
      </Card>
    );
  }

  const chartConfig = {
    value: {
      label: 'Count',
    },
  } satisfies ChartConfig;

  return (
    <Card title="Policy by Status" width="full" size="sm" spacing="tight">
      <div className="flex h-[120px] items-center justify-center px-4">
        <HStack gap="lg" align="center">
          {/* Donut Chart */}
          <ChartContainer config={chartConfig} className="h-[100px] w-[100px] shrink-0">
            <PieChart width={100} height={100}>
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={34}
                outerRadius={46}
                paddingAngle={3}
                strokeWidth={2}
                stroke="hsl(var(--background))"
                cursor="pointer"
                animationDuration={500}
                animationBegin={100}
              >
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={viewBox.cy}
                            className="fill-foreground text-lg font-bold"
                          >
                            {data.totalPolicies}
                          </tspan>
                        </text>
                      );
                    }
                    return null;
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>

          {/* Legend with counts */}
          <Stack gap="xs">
            {allStatuses.map((status) => (
              <HStack key={status.key} gap="sm" align="center">
                <div
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: status.fill }}
                />
                <Text size="xs" variant="muted">
                  {status.name}
                </Text>
                <Text size="xs" weight="medium">
                  {status.value}
                </Text>
              </HStack>
            ))}
          </Stack>
        </HStack>
      </div>
      <div className="border-t border-border pt-3 mt-3">
        <HStack justify="end" align="center">
          <Text size="xs" variant="muted">
            {data.totalPolicies} total
          </Text>
        </HStack>
      </div>
    </Card>
  );
}
