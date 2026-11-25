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

- `README.txt`, `index.csv` (one row per requirement, with the mapped controls' owners,
  applicability, justification, set_by and set_at), `Applicability summary.csv`, `native-artifacts.csv`.
- One folder per requirement. Not-applicable folders hold only `00-requirement.txt` and
  `NOT_APPLICABLE.txt`. Compensating-control requirements carry `CCW - <id>.pdf`.
- Policies at their last approved version only; unapproved ones are listed in the README.
- `00-requirement.txt` lists each mapped control with its owner (`Control.ownerId`).
- `Tasks/<task>/` in a requirement folder holds the task summary (description, status,
  assignee, approver, review frequency and dates), automation and
  Auto-evidence PDFs, and `attachments/` with the task's uploaded files. Every
  requirement folder is self-contained: a file mapped to several requirements is
  copied into each of them (README.txt describes `Vulnerability scans/` only when
  the export holds it).
- Left out: archived and not-relevant tasks, and retired document forms (`retiredTo`
  set, e.g. Network Diagram, RBAC Matrix, Infrastructure Inventory, meeting forms) with
  their old submissions. Hidden forms without `retiredTo` are still exported.
  A task's status is read at export time: a task marked not relevant after the audit
  period drops its in-period uploads too. The audit workspace uses the same mappings,
  so these tasks and forms are left out there as well. The per-task and org-wide
  exports also skip retired forms.
- Vulnerability scans are filtered by the audit period (`scannedAt`), like uploads,
  automation runs and document submissions, and load only for ISO 27001 / PCI DSS.
- `_Platform records/`: every register (risks, vendors, people, access reviews,
  privileged users, access roles, training, vendor reviews, risk reviews, treatment
  actions, findings, assets, vulnerabilities) the requester can read.
- Requirement folders get registers by mapped control template and by requirement id
  (`native-artifact-control-map.ts`). Rows that cite a requirement also land in that
  folder as `Registers/<register>-citing-this-requirement.csv`: findings by their
  description prefix ("PCI DSS 10.3.4; ISO 27001 A.8.15: …") and training completions
  by their module's `frameworkReference` (`requirement-citations.ts`).
- `Vendors/<name>/` and `Risk reviews/` (described in README.txt only when written),
  and for an audit export `audit-trail.csv` and `Requests/<id>/`.
- `Vulnerability scans/` (PCI DSS 11.3.1.x internal, 11.3.2.x ASV, 11.4.x pentest; ISO
  A.8.8 all kinds): `scans.csv` and each scan's attached report, with read access to the
  vulnerabilities register. A report already in the folder's `Documents/` (a pentest
  filed as a Penetration Test submission) is not copied again (`framework-evidence-scans.ts`).
