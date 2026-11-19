# Evidence export

The framework evidence ZIP (`POST /v1/evidence-export/frameworks/:id`) is built by the
`export-framework-evidence` job into S3 and downloaded from a presigned URL (24 h). The
requester is also emailed the link.

## Storage and the S3 lifecycle rule

Each run writes its own object, `<organizationId>/exports/framework-evidence-<frameworkInstanceId>-<runId>.zip`,
so two exports (another period, another user's permissions) never overwrite each other's
download. The org-wide export uses the same `exports/` prefix.

Nothing deletes these objects in code. Configure this lifecycle rule on the attachments
bucket so they expire after 2 days (the download link lives 24 h):

```json
{
  "Rules": [
    {
      "ID": "expire-evidence-exports",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "Expiration": { "Days": 2 }
    }
  ]
}
```

S3 lifecycle filters only match a key prefix, and the org id comes first, so either
scope the rule with an object tag (`export=true`, set on upload) or move exports to a
dedicated bucket or a top-level `exports/<organizationId>/` prefix. Until one of those
is done, apply the rule with a `Filter.Prefix` per organization, e.g.
`{ "Prefix": "org_abc/exports/" }`.

## ZIP layout

- `README.txt`, `index.csv` (one row per requirement, with applicability, justification,
  set_by and set_at), `Applicability summary.csv`, `native-artifacts.csv`.
- One folder per requirement. Not-applicable folders hold only `00-requirement.txt` and
  `NOT_APPLICABLE.txt`. Compensating-control requirements carry `CCW - <id>.pdf`.
- Policies at their last approved version only; unapproved ones are listed in the README.
- `_Platform records/`: every register (risks, vendors, people, access reviews,
  privileged users, access roles, training, vendor reviews, risk reviews, treatment
  actions, findings, assets, vulnerabilities) the requester can read.
- `Vendors/<name>/`, `Risk reviews/`, and for an audit export `audit-trail.csv` and
  `Requests/<id>/`.
