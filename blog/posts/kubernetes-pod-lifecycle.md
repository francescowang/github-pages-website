---
title: "Kubernetes Pod Lifecycle: From Pending to Terminated"
category: Kubernetes
date: 2026-04-24
tags: Kubernetes, Workloads, Pods, Infrastructure
summary: Understanding the various phases, conditions, and container states that define the life of a Kubernetes Pod.
---

# Kubernetes Pod Lifecycle: From Pending to Terminated

A Pod is the smallest deployable unit in Kubernetes. But it's not just "on" or "off"—it goes through a series of phases from the moment it is created until it is removed. Understanding this lifecycle is key to troubleshooting why your application might not be starting or why it's restarting unexpectedly.

## Pod Phases

The `phase` of a Pod is a high-level summary of where it is in its lifecycle.

```text
+-----------+       +-----------+       +-----------+
|  Pending  | ----> |  Running  | ----> | Succeeded |
+-----------+       +-----------+       +-----------+
      |                   |                   |
      |                   v                   |
      +--------------> [ Failed ] <-----------+
```

1.  **Pending:** The Pod has been accepted by the cluster, but one or more containers are not yet running (e.g., image is still downloading or Pod is waiting to be scheduled).
2.  **Running:** The Pod has been bound to a node, and all containers have been created. At least one container is still running, or is in the process of starting or restarting.
3.  **Succeeded:** All containers in the Pod have terminated successfully (exit code 0) and will not be restarted.
4.  **Failed:** All containers have terminated, and at least one container has terminated in failure (nonzero exit code).
5.  **Unknown:** For some reason the state of the Pod could not be obtained (usually a communication error with the Node).

## Container States

While the Pod has a phase, each container inside the Pod has its own **state**.

-   **Waiting:** The container is not yet running (e.g., `ImagePullBackOff`).
-   **Running:** The container is executing without issues.
-   **Terminated:** The container began execution and then either ran to completion or failed.

## Container Probes: Health Checks

Kubernetes uses **Probes** to decide what to do with a container:

-   **Liveness Probe:** "Are you alive?" If this fails, Kubernetes kills the container and restarts it based on the `restartPolicy`.
-   **Readiness Probe:** "Are you ready to take traffic?" If this fails, the Pod's IP address is removed from the Endpoints of all Services.
-   **Startup Probe:** "Have you finished starting up?" Disables liveness and readiness checks until the container is marked as started.

## Termination Process: The Graceful Exit

When you delete a Pod, Kubernetes tries to shut it down gracefully.

```text
1. Delete Command -> Pod marked as 'Terminating'
2. [preStop hook] executes (if defined)
3. SIGTERM signal sent to container (PID 1)
4. Kubernetes waits for 'terminationGracePeriodSeconds' (default 30s)
5. SIGKILL signal sent if container is still running
6. Pod removed from API server
```

## Conclusion

The Pod lifecycle is a state machine designed to keep your applications reliable. By using the right combination of probes and understanding the transition between phases, you can build systems that automatically recover from failures and shut down without losing data.

For a deeper dive into termination and restart policies, check out the [official Kubernetes Pod Lifecycle documentation](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/).
