# Kubernetes Pod QoS Classes: Understanding Resource Priority

When you define a Pod in Kubernetes, you specify how much CPU and Memory it needs using **Requests** and **Limits**. Kubernetes uses these values not just for scheduling, but also to categorize Pods into three **Quality of Service (QoS)** classes. These classes determine which Pods get killed first when a Node runs out of resources.

## The Three QoS Classes

Kubernetes assigns these classes automatically based on the resource settings of the containers in the Pod.

### 1. Guaranteed
This is the highest priority class. A Pod is Guaranteed if:
-   Every container in the Pod has a memory limit and a memory request.
-   The memory limit matches the memory request for every container.
-   Every container has a CPU limit and a CPU request.
-   The CPU limit matches the CPU request for every container.

### 2. Burstable
A Pod is Burstable if it doesn't meet the criteria for Guaranteed, but at least one container has a memory or CPU request. These Pods are allowed to "burst" up to their limits if the node has spare capacity.

### 3. BestEffort
This is the lowest priority class. A Pod is BestEffort if none of its containers have any resource requests or limits defined.

## The Eviction Hierarchy

When a Node is under memory or disk pressure, the `kubelet` must reclaim resources. It does this by "evicting" (killing) Pods based on their QoS class and resource usage.

```text
[ Node Resource Pressure ]
          |
          v
[ 1. EVICT: BestEffort ]   <-- "The first to go"
          |
          v
[ 2. EVICT: Burstable ]    <-- "Evicted if usage > request"
          |
          v
[ 3. EVICT: Guaranteed ]   <-- "Only as a last resort"
```

## How It Works in Practice

Think of it like an airplane's seating classes:

-   **Guaranteed (First Class):** You have a confirmed seat and priority service. You are only bumped if the plane itself is in trouble.
-   **Burstable (Business/Premium):** You have a seat, but you might be moved or restricted if the cabin gets too crowded.
-   **BestEffort (Standby):** You only get on the plane if there is extra space. You are the first one removed if a higher-paying passenger shows up.

## Why This Matters

1.  **Stability:** For critical workloads (like databases), you should strive for the `Guaranteed` class to ensure they aren't evicted during minor spikes.
2.  **Efficiency:** Use `BestEffort` for non-critical, background tasks (like log cleanup or data scraping) to fill up spare gaps in your cluster without affecting important apps.
3.  **Troubleshooting:** If you see Pods being killed with a `Reason: Evicted`, check their QoS class. You might need to set or increase their resource requests.

## Conclusion

QoS classes are a fundamental part of how Kubernetes manages shared resources. By carefully setting your requests and limits, you can control the "survivability" of your applications and ensure that your most important services have the resources they need to stay online.

For more technical details on how the OOM (Out Of Memory) score is calculated for each class, check out the [official Kubernetes Pod QoS documentation](https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/).
