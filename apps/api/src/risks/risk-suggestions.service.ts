import { anthropic } from '@ai-sdk/anthropic';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { db, Impact, Likelihood, RiskCategory } from '@db';
import { generateObject } from 'ai';
import { z } from 'zod';

const MODEL = anthropic('claude-opus-5-5');
const MAX_SUGGESTIONS = 8;

const suggestionSchema = z.object({
  suggestions: z
    .array(
      z.object({
        title: z.string().min(3).max(200),
        description: z.string().min(10).max(1500),
        category: z.nativeEnum(RiskCategory),
        likelihood: z.nativeEnum(Likelihood),
        impact: z.nativeEnum(Impact),
        treatmentStrategyDescription: z.string().max(1500),
        source: z.string().max(200).describe('The vendor, asset, integration or context fact this risk comes from'),
      }),
    )
    .max(MAX_SUGGESTIONS),
});

export type RiskSuggestion = z.infer<typeof suggestionSchema>['suggestions'][number];

/**
 * AI risk suggestions grounded in what the platform already knows about the
 * org: vendors, device inventory, connected integrations and onboarding
 * answers. Suggestions are returned, not saved: the user picks which to add.
 */
@Injectable()
export class RiskSuggestionsService {
  private readonly logger = new Logger(RiskSuggestionsService.name);

  async suggest(organizationId: string): Promise<RiskSuggestion[]> {
    const prompt = await this.buildPrompt(organizationId);
    try {
      const { object } = await generateObject({
        model: MODEL,
        schema: suggestionSchema,
        system:
          'You are an information security risk analyst for a payments company certified to ISO/IEC 27001:2022 and PCI DSS v4.0.1. Propose concrete, non-duplicate risk scenarios for the risk register. Each risk names its source, a realistic inherent likelihood and impact, and a short mitigation plan with actionable controls. Write plainly.',
        prompt,
      });
      return object.suggestions;
    } catch (error) {
      this.logger.error(`Risk suggestion generation failed for ${organizationId}`, error);
      throw new ServiceUnavailableException('Could not generate suggestions. Try again.');
    }
  }

  private async buildPrompt(organizationId: string): Promise<string> {
    const [org, risks, vendors, devices, connections, context] = await Promise.all([
      db.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, website: true },
      }),
      db.risk.findMany({ where: { organizationId }, select: { title: true } }),
      db.vendor.findMany({
        where: { organizationId },
        select: { name: true, category: true, description: true },
        take: 60,
      }),
      db.device.groupBy({
        by: ['platform'],
        where: { organizationId },
        _count: true,
      }),
      db.integrationConnection.findMany({
        where: { organizationId, status: 'active' },
        select: { provider: { select: { name: true, category: true } } },
      }),
      db.context.findMany({
        where: { organizationId },
        select: { question: true, answer: true },
        take: 20,
      }),
    ]);

    const lines = (items: string[]) => (items.length ? items.join('\n') : '(none)');
    return [
      `Organization: ${org?.name ?? 'Unknown'}${org?.website ? ` (${org.website})` : ''}`,
      `Onboarding answers:\n${lines(context.map((c) => `- ${c.question}: ${c.answer.slice(0, 300)}`))}`,
      `Vendors:\n${lines(vendors.map((v) => `- ${v.name} [${v.category}]: ${v.description.slice(0, 160)}`))}`,
      `Devices by platform:\n${lines(devices.map((d) => `- ${d.platform}: ${d._count}`))}`,
      `Connected integrations:\n${lines(connections.map((c) => `- ${c.provider.name} [${c.provider.category}]`))}`,
      `Risks already in the register (do not repeat these):\n${lines(risks.map((r) => `- ${r.title}`))}`,
      `Suggest up to ${MAX_SUGGESTIONS} new risks that come from the vendors, assets and integrations above. Prefer risks with PCI DSS or ISO 27001 relevance.`,
    ].join('\n\n');
  }
}
