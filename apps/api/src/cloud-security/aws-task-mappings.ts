/**
 * Maps AWS service adapter IDs to framework task template IDs.
 *
 * When ALL findings for every scanned service of a task pass, the task is
 * auto-satisfied with the scan results attached: AUTOMATED tasks go to
 * 'done', MANUAL tasks go to 'in_review' (a person finishes them).
 *
 * Only pass → done/in_review. Never mark tasks as failed from scan data.
 */
export const AWS_SERVICE_TASK_MAPPINGS: Record<string, string[]> = {
  // IAM → Employee Access, RBAC (Access Review Log is evidence-only, below)
  'iam-analyzer': [
    'frk_tt_68406ca292d9fffb264991b9',
    'frk_tt_68e80544d9734e0402cfa807',
  ],
  // KMS, S3, RDS, DynamoDB → Encryption at Rest
  kms: ['frk_tt_68e52b26bf0e656af9e4e9c3'],
  s3: ['frk_tt_68e52b26bf0e656af9e4e9c3'],
  rds: ['frk_tt_68e52b26bf0e656af9e4e9c3', 'frk_tt_68e52b26b166e2c0a0d11956'],
  // CloudTrail, CloudWatch → Monitoring & Alerting
  cloudtrail: ['frk_tt_68406af04a4acb93083413b9'],
  cloudwatch: ['frk_tt_68406af04a4acb93083413b9'],
  // Secrets Manager → Secure Secrets
  'secrets-manager': ['frk_tt_68407ae5274a64092c305104'],
  // ELB, ACM, CloudFront → TLS / HTTPS
  elb: ['frk_tt_68406f411fe27e47a0d6d5f3'],
  acm: ['frk_tt_68406f411fe27e47a0d6d5f3'],
  cloudfront: ['frk_tt_68406f411fe27e47a0d6d5f3'],
  // EC2/VPC → Monitoring (firewall rules feed NSC Review, evidence-only below)
  'ec2-vpc': ['frk_tt_68406af04a4acb93083413b9'],
  // Shield → App Availability
  shield: ['frk_tt_68406d2e86acc048d1774ea6'],
  // Backup, RDS, DynamoDB → Backup logs
  backup: ['frk_tt_68e52b26b166e2c0a0d11956'],
  dynamodb: [
    'frk_tt_68e52b26bf0e656af9e4e9c3',
    'frk_tt_68e52b26b166e2c0a0d11956',
  ],
  // Config → Hardening Baseline & Configuration Compliance Report
  config: ['frk_tt_b89e695de179654f0b885698'],
  // Inspector → Vulnerability Scan & Patch Remediation Report
  inspector: ['frk_tt_0a031fa912c0a87587d39115'],
  // Lambda → Secure Code
  lambda: ['frk_tt_68406e353df3bc002994acef'],
  // ECS/EKS → Separation of Environments, Monitoring
  'ecs-eks': [
    'frk_tt_68e52a484cad0014de7a628f',
    'frk_tt_68406af04a4acb93083413b9',
  ],
  // Cognito → Employee Access
  cognito: ['frk_tt_68406ca292d9fffb264991b9'],
};

/**
 * Evidence-only links: the scan results are attached to the task, but the
 * task status never changes. A scan is input to these tasks, not proof that
 * the human activity (an access review, handling incidents) happened.
 */
export const AWS_SERVICE_EVIDENCE_ONLY_MAPPINGS: Record<string, string[]> = {
  // IAM → Access Review Log
  'iam-analyzer': ['frk_tt_68e805457c2dcc784e72e3cc'],
  // GuardDuty → Incident Response
  guardduty: ['frk_tt_68406b4f40c87c12ae0479ce'],
  // CloudTrail, CloudWatch → Detection & Log Review Pack (needs a human log review)
  cloudtrail: ['frk_tt_d04535046e66e84d10b92068'],
  cloudwatch: ['frk_tt_d04535046e66e84d10b92068'],
  // EC2/VPC, WAF, Network Firewall → NSC Review (Production Firewall was merged
  // into it; the rule-set justification is a human review)
  'ec2-vpc': ['frk_tt_9d21cfa9d3ba3a694587c610'],
  waf: ['frk_tt_9d21cfa9d3ba3a694587c610'],
  'network-firewall': ['frk_tt_9d21cfa9d3ba3a694587c610'],
};

/** checkId of the per-task evidence run. Not a `*-security-scan` id, so the
 * Cloud Tests views never read it as a scan, and task status derivation
 * (task-schedule, disconnect re-evaluation) ignores it: it is not a check. */
export const AWS_TASK_EVIDENCE_CHECK_ID = 'aws-task-evidence';
