import type { AssetEnvironment, AssetType } from '@db';

/**
 * Maps a check result's `resourceType` to an inventory category, or null when
 * the row is not an asset (users, org-level settings, policy states, alarms…).
 * Order matters: the first matching pattern wins.
 */
const TYPE_PATTERNS: Array<[RegExp, AssetType]> = [
  [
    /(^|[-_])(repo|repository)$|ecr|container-registry|codecommit/i,
    'repository',
  ],
  [/lambda|function|step-?function|serverless/i, 'serverless'],
  [/eks|aks|gke|kubernetes|ecs|container|fargate/i, 'container'],
  [
    /rds|sql|postgres|mysql|dynamo|cosmos|redshift|neptune|elasticache|opensearch|database|db-?instance|db-?cluster/i,
    'database',
  ],
  [/s3|bucket|storage|efs|file-?system|backup-?vault/i, 'storage'],
  [
    /kms|key-?vault|secret|ssm-?parameter|certificate|access-?key/i,
    'key_secret',
  ],
  [
    /sqs|sns|queue|topic|kinesis|msk|stream|event-?bridge|pub-?sub/i,
    'messaging',
  ],
  [
    /vpc|subnet|security-?group|nsg|firewall|waf|load-?balancer|elb|cloudfront|route-?53|network|gateway|transfer-?server/i,
    'network',
  ],
  [
    /ec2|instance|virtual-?machine|\bvm\b|compute|emr|sagemaker|beanstalk|app-?service|autoscal/i,
    'compute',
  ],
  [
    /^(aws-?account|gcp-project|azure-subscription|subscription)$/i,
    'cloud_account',
  ],
  [/^(vercel|deployment)$/i, 'application'],
];

/** Settings / identity / control-plane rows that are never assets. */
const NOT_AN_ASSET =
  /^(user|organization|org|workspace|settings|integration|test|check|config|system|issues|resource|unknown|policy|policy-state|role-definition|azure-role-definition|activity-log-alert|diagnostic-settings|security-assessment|security-alert)$|environment-separation|iam|cloudtrail|cloudwatch|config-?recorder|guard-?duty|macie|inspector|shield|security-?hub|alarm|backup-?plan|cognito/i;

export function classifyResourceType(resourceType: string): AssetType | null {
  if (!resourceType || NOT_AN_ASSET.test(resourceType)) return null;
  const hit = TYPE_PATTERNS.find(([pattern]) => pattern.test(resourceType));
  return hit ? hit[1] : null;
}

const ENV_TOKENS: Array<[Set<string>, AssetEnvironment]> = [
  [new Set(['staging', 'stage', 'stg', 'preprod', 'uat']), 'staging'],
  [new Set(['dev', 'develop', 'development', 'sandbox', 'sbx']), 'development'],
  [new Set(['test', 'testing', 'qa']), 'test'],
  [new Set(['prod', 'production', 'prd', 'live']), 'production'],
];

/**
 * Best-effort environment from a resource name, token-exact ("myapp-prod"
 * is production, "product-api" is not). Non-prod tokens win over prod so
 * "non-prod"/"pre-prod" never classify as production. Unknown otherwise.
 */
export function classifyEnvironment(name: string): AssetEnvironment {
  const tokens = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (tokens.includes('non') || tokens.includes('nonprod')) return 'unknown';
  if (tokens.includes('pre')) return 'staging';
  const hit = ENV_TOKENS.find(([set]) => tokens.some((t) => set.has(t)));
  return hit ? hit[1] : 'unknown';
}

/** A readable name for an ARN / path-like resource id ("arn:…:bucket/x" → "x"). */
export function displayNameFromResourceId(resourceId: string): string {
  const tail = resourceId.split(/[/:]/).filter(Boolean).pop();
  return tail && tail.length > 0 ? tail : resourceId;
}
