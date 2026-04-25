---
title: "Kubernetes DNS: How Services and Pods Find Each Other"
category: Kubernetes
date: 2026-04-24
tags: Kubernetes, Networking, DNS, Infrastructure
summary: A deep dive into the cluster's internal phonebook—understanding how DNS names are assigned to Services and Pods.
---

# Kubernetes DNS: How Services and Pods Find Each Other

In a Kubernetes cluster, you don't want to hardcode IP addresses. Pods are ephemeral, and Service IPs (while stable) are still just numbers. To make communication reliable and human-readable, Kubernetes provides a built-in DNS service (usually **CoreDNS**).

## The Internal Phonebook

Whenever you create a Service, Kubernetes automatically assigns it a DNS name. This allows Pods to talk to Services using names like `my-db` instead of `10.96.0.10`.

```text
[ Pod A ] -- "Where is 'my-svc'?" --> [ CoreDNS ]
                                         |
[ Pod A ] <--- "It's at 10.96.45.2" ------+
    |
    +-----> [ Service: my-svc ] (10.96.45.2)
```

## Service DNS Records

The format for a Service's fully qualified domain name (FQDN) is:
`<service-name>.<namespace>.svc.cluster.local`

### 1. Normal Services
A standard Service gets an `A` or `AAAA` record that points to its **ClusterIP**.

### 2. Headless Services
If you set `clusterIP: None`, the DNS query returns the list of **Pod IPs** directly, rather than a single Service IP. This is useful for stateful applications like databases where you might need to connect to a specific instance.

```text
Query: "db-headless.prod.svc.cluster.local"

Response:
- 10.244.1.5 (Pod 0)
- 10.244.2.8 (Pod 1)
- 10.244.1.9 (Pod 2)
```

## Pod DNS Records

Pods also get DNS records, though they are less commonly used directly. The format is usually based on the Pod's IP address:
`<ip-with-dashes>.<namespace>.pod.cluster.local`

Example: `10-244-1-5.default.pod.cluster.local`

## DNS Search Paths: The "Short Name" Magic

Why can you just type `curl my-svc` instead of the full FQDN? Kubernetes configures the `/etc/resolv.conf` inside every Pod with a set of **search paths**.

```text
# Example /etc/resolv.conf inside a Pod
search my-ns.svc.cluster.local svc.cluster.local cluster.local
nameserver 10.96.0.10
options ndots:5
```

When you look up `my-svc`, the resolver tries:
1. `my-svc.my-ns.svc.cluster.local` (Found!)
2. `my-svc.svc.cluster.local`
3. `my-svc.cluster.local`

## Troubleshooting DNS

If a Pod can't find a Service, the first step is usually to check if CoreDNS is running:
`kubectl get pods -n kube-system -l k8s-app=kube-dns`

Or use a temporary "debug" Pod to run a manual lookup:
`kubectl run nslookup --image=busybox:1.28 -it --restart=Never -- nslookup my-svc`

## Summary

Kubernetes DNS is the glue that makes microservices manageable. By providing predictable, namespace-scoped names for every Service, it abstracts away the complexity of networking and allows your applications to stay connected as the cluster scales.

For more technical details on DNS records, visit the [official Kubernetes DNS documentation](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/).
