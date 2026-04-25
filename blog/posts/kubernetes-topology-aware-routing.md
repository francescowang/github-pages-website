---
title: "Kubernetes Topology Aware Routing: Optimizing for Performance and Cost"
category: Kubernetes
date: 2026-04-24
tags: Kubernetes, Networking, Topology, Performance, Infrastructure
summary: Learn how Topology Aware Routing helps reduce cross-zone traffic and latency by preferring endpoints in the same zone.
---

# Kubernetes Topology Aware Routing: Optimizing for Performance and Cost

In large-scale cloud environments, clusters often span multiple **Availability Zones (AZs)**. While this provides high availability, it introduces a challenge: cross-zone network traffic is often slower and more expensive than traffic within the same zone.

**Topology Aware Routing** (formerly Topology Aware Hints) is a Kubernetes feature that tries to keep traffic within the same zone where it originated.

## The Problem: Random Distribution

By default, Kubernetes Services distribute traffic evenly across all Pods, regardless of where they are located. This leads to frequent cross-zone hops.

```text
Zone: A                     Zone: B
+-------------------+       +-------------------+
| [ Frontend Pod ]--+-------+--> [ Backend Pod ]| (Cross-zone: High Latency/Cost)
|                   |       |                   |
| [ Backend Pod ] <---------+---[ Frontend Pod ]| (Cross-zone: High Latency/Cost)
+-------------------+       +-------------------+
```

## The Solution: Topology Hints

When Topology Aware Routing is enabled, the control plane adds "hints" to **EndpointSlices**. These hints tell components like `kube-proxy` which endpoints should be preferred based on the zone of the originating traffic.

```text
Zone: A                     Zone: B
+-------------------+       +-------------------+
| [ Frontend Pod ]  |       | [ Frontend Pod ]  |
|       |           |       |       |           |
|       v           |       |       v           |
| [ Backend Pod ]   |       | [ Backend Pod ]   | (Same-zone: Low Latency/No Cost)
+-------------------+       +-------------------+
```

## How to Enable It

You enable this feature on a per-Service basis by adding an annotation:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-service
  annotations:
    service.kubernetes.io/topology-mode: Auto
spec:
  selector:
    app: my-app
  ports:
    - protocol: TCP
      port: 80
      targetPort: 80
```

## How it Works Under the Hood

1.  **EndpointSlice Controller:** Monitors the distribution of Pods across zones.
2.  **Hint Generation:** If there are enough Pods in each zone to handle the expected traffic proportionally, the controller adds `topologyHints` to the EndpointSlice entries.
3.  **kube-proxy:** Uses these hints to filter which endpoints it uses for routing traffic from a specific node.

## Safeguards and "Overload"

Kubernetes is smart about this. If one zone doesn't have enough healthy Pods to handle its share of the traffic, the controller will stop providing hints. This ensures that "keeping it local" doesn't lead to crashing the few Pods that are in that zone.

## Why Use It?

-   **Reduced Latency:** Faster response times for your users by avoiding the physical distance between data centers.
-   **Cost Savings:** Most cloud providers charge for data transfer between zones. Reducing this "east-west" traffic can significantly lower your cloud bill.
-   **Reliability:** In the event of a partial zone failure, traffic is more naturally contained within healthy zones.

## Conclusion

Topology Aware Routing is a powerful tool for optimizing production clusters. By making the network "zone-aware," you can achieve a more efficient, performant, and cost-effective architecture.

For a deeper dive into the technical requirements and constraints, check out the [official Kubernetes Topology Aware Routing documentation](https://kubernetes.io/docs/concepts/services-networking/topology-aware-routing/).
