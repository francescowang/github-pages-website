---
title: "Kubernetes Dual-Stack: Bridging IPv4 and IPv6"
category: Kubernetes
date: 2026-04-24
tags: Kubernetes, Networking, Dual-Stack, Infrastructure
summary: Exploring how Kubernetes supports both IPv4 and IPv6 addresses simultaneously for Pods and Services.
---

# Kubernetes Dual-Stack: Bridging IPv4 and IPv6

As the world slowly moves away from the limited pool of IPv4 addresses, the need for IPv6 support in infrastructure has become critical. Kubernetes supports **IPv4/IPv6 dual-stack** networking, allowing you to assign both IPv4 and IPv6 addresses to Pods and Services.

## What is Dual-Stack?

In a dual-stack cluster, the networking stack is capable of handling both IP families at once. This means your application can communicate with both legacy IPv4 systems and modern IPv6-only environments.

```text
[ Dual-Stack Pod ]
+----------------------------+
|  Interface: eth0           |
|  IPv4: 10.244.1.5          |
|  IPv6: 2001:db8:1::5       |
+----------------------------+
       |             |
       v             v
[ IPv4 Network ] [ IPv6 Network ]
```

## Key Features

1.  **Dual-stack Pod networking:** Every Pod can get both an IPv4 and an IPv6 address.
2.  **Dual-stack Services:** Services can be configured to expose themselves on both IPv4 and IPv6.
3.  **Egress routing:** Kubernetes can route traffic to both IPv4 and IPv6 destinations outside the cluster.

## Configuring Services for Dual-Stack

When you define a Service in a dual-stack cluster, you use two key fields: `ipFamilyPolicy` and `ipFamilies`.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-dual-stack-service
spec:
  selector:
    app: MyApp
  ipFamilyPolicy: PreferDualStack
  ipFamilies:
  - IPv6
  - IPv4
  ports:
  - port: 80
    targetPort: 80
```

### ipFamilyPolicy options:
-   **SingleStack:** Only one IP family (uses the first family in `ipFamilies`).
-   **PreferDualStack:** Uses both families if the cluster is dual-stack; otherwise, falls back to a single stack.
-   **RequireDualStack:** Fails if the cluster doesn't support both IPv4 and IPv6.

## How it looks on the Wire

When a dual-stack Service is created, it gets two Cluster IPs—one for each family.

```text
[ Service: my-svc ]
+-----------------------------------+
| ClusterIPs:                       |
| - 10.96.0.10   (IPv4)             |
| - fd00:10:96::10 (IPv6)           |
+-----------------------------------+
       |                 |
       +------[ Pod ]----+
          (10.244.1.5)
          (fd00:244:1::5)
```

## Prerequisites

To use dual-stack, your environment must support it:
-   **Dual-stack Nodes:** The underlying OS and cloud provider must provide both IPv4 and IPv6 addresses to the nodes.
-   **Dual-stack CNI:** Your Network Plugin (like Cilium, Calico, or Azure CNI) must be configured to handle both families.
-   **Kubernetes Configuration:** The API server, Controller Manager, and Kubelet must be started with dual-stack flags (usually via `--service-cluster-ip-range` and `--pod-network-cidr`).

## Conclusion

IPv4/IPv6 dual-stack is no longer just a "nice-to-have" feature; it's a necessity for modern, global-scale infrastructure. By enabling both families, Kubernetes ensures your applications stay reachable as the internet transitions to the IPv6 future.

For more details on implementation, visit the [official Kubernetes Dual-Stack documentation](https://kubernetes.io/docs/concepts/services-networking/dual-stack/).
