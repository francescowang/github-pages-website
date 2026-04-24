---
title: Secure Kubernetes and Cloud Foundations
category: Cloud Security
date: 2026-04-24
summary: A practical baseline for securing clusters and cloud primitives before you start layering on more advanced policy controls.
---

# Secure Kubernetes and Cloud Foundations

A practical baseline for securing clusters and cloud primitives before you start layering on more advanced policy controls.

## Why baseline security matters

Security posture improves fastest when the first controls are boring and enforced everywhere. The goal is not to install every tool in the CNCF landscape. The goal is to make insecure defaults difficult to ship.

## Start with identity and boundaries

- Use workload identity instead of long-lived static credentials.
- Separate cluster-admin activity from delivery pipeline permissions.
- Keep cloud IAM roles narrow and tied to a real workload boundary.

## Enforce the minimum admission rules

Admission policy is where platform teams stop debating conventions and start enforcing them. Even a small baseline makes a real difference: no privileged containers, no writable root filesystem by default, and no public ingress without an explicit review path.

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: disallow-privileged
spec:
  validationFailureAction: Enforce
```

## Log what matters

Audit logs, identity changes, and control plane events should land in one place where they can be queried quickly during an incident. If the evidence is fragmented, the control is weaker than it looks on paper.
