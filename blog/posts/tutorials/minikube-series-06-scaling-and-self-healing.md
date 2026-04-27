This is Part 6 of a 10-part series on Kubernetes using Minikube. We scale our app to multiple replicas and watch Kubernetes heal itself.

---

## The Series

1. [What is Kubernetes?](/blog/view.html?slug=minikube-series-01-what-is-kubernetes&folder=tutorials)
2. [Setting Up Your Local Cluster](/blog/view.html?slug=minikube-series-02-setting-up-minikube&folder=tutorials)
3. [Your First Deployment](/blog/view.html?slug=minikube-series-03-first-deployment&folder=tutorials)
4. [Exposing Your App](/blog/view.html?slug=minikube-series-04-exposing-your-app&folder=tutorials)
5. [YAML and Declarative Configuration](/blog/view.html?slug=minikube-series-05-yaml-declarative-config&folder=tutorials)
6. **Scaling and Self-Healing** ← you are here
7. [Multi-Service Architecture](/blog/view.html?slug=minikube-series-07-multi-service-architecture&folder=tutorials)
8. [Service-to-Service Communication](/blog/view.html?slug=minikube-series-08-service-to-service-communication&folder=tutorials)
9. [Ingress and HTTP Routing](/blog/view.html?slug=minikube-series-09-ingress-http-routing&folder=tutorials)
10. [Production Readiness](/blog/view.html?slug=minikube-series-10-production-readiness&folder=tutorials)

---

## Introduction

So far, we've been running a single pod. In the real world, that's risky — if it crashes, your users see downtime until Kubernetes restarts it. The solution is to run **multiple replicas** of your application. Kubernetes distributes traffic across them and automatically replaces any that fail.

This part covers two of Kubernetes' most powerful features: **scaling** (running multiple copies) and **self-healing** (automatic recovery). These are the features that make people say "Kubernetes is magic" — but by the end of this tutorial, you'll understand exactly how it works.

---

## Prerequisites

- Minikube running
- Apply the manifests from Part 5 (or recreate them):

Create `~/k8s-tutorial/hello-world.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hello-world
  labels:
    app: hello-world
spec:
  replicas: 1
  selector:
    matchLabels:
      app: hello-world
  template:
    metadata:
      labels:
        app: hello-world
    spec:
      containers:
      - name: echoserver
        image: registry.k8s.io/echoserver:1.10
        ports:
        - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: hello-world
spec:
  type: NodePort
  selector:
    app: hello-world
  ports:
  - port: 8080
    targetPort: 8080
    protocol: TCP
```

```sh
kubectl apply -f ~/k8s-tutorial/hello-world.yaml
```

---

## 1. Understanding ReplicaSets

Before we scale, let's understand the mechanism. In Part 3, we saw this hierarchy:

```
Deployment → ReplicaSet → Pod
```

The **ReplicaSet** is the component that actually manages replicas. Its only job is to ensure a specific number of identical pods are running at all times.

```sh
kubectl get replicaset
```

```
NAME                     DESIRED   CURRENT   READY   AGE
hello-world-xxxxxxxxxx   1         1         1       2m
```

- **DESIRED:** How many pods the ReplicaSet wants (set by the Deployment)
- **CURRENT:** How many pods currently exist
- **READY:** How many pods are ready to serve traffic

The ReplicaSet runs a simple control loop:

```
┌──────────────────────────────────────┐
│        ReplicaSet Control Loop       │
│                                      │
│  1. Count running pods               │
│  2. Compare to desired count         │
│  3. If too few → create pods         │
│     If too many → delete pods        │
│  4. Repeat                           │
└──────────────────────────────────────┘
```

You rarely interact with ReplicaSets directly — the Deployment manages them. But understanding they exist helps you reason about what's happening when you scale.

---

## 2. Scaling Up

### Using kubectl scale (imperative)

The quickest way to scale:

```sh
kubectl scale deployment hello-world --replicas=3
```

Watch the pods come up:

```sh
kubectl get pods --watch
```

```
NAME                           READY   STATUS              RESTARTS   AGE
hello-world-xxxxxxxxxx-aaaaa   1/1     Running             0          5m
hello-world-xxxxxxxxxx-bbbbb   0/1     ContainerCreating   0          2s
hello-world-xxxxxxxxxx-ccccc   0/1     ContainerCreating   0          2s
hello-world-xxxxxxxxxx-bbbbb   1/1     Running             0          5s
hello-world-xxxxxxxxxx-ccccc   1/1     Running             0          6s
```

Press `Ctrl+C` to stop watching.

You now have 3 identical pods running the same application. Kubernetes will keep all 3 running — if any fails, it's replaced.

### Using YAML (declarative — the right way)

Edit `hello-world.yaml` and change `replicas: 1` to `replicas: 3`, then:

```sh
kubectl apply -f ~/k8s-tutorial/hello-world.yaml
```

Same result, but now your desired state is captured in the file. If you ever need to recreate the cluster, the file already says "3 replicas."

---

## 3. Load Balancing in Action

Now that we have 3 pods, the Service automatically distributes traffic between them. Let's see this happening.

First, get the service URL:

```sh
minikube service hello-world --url
```

Now send several requests:

```sh
for i in $(seq 1 6); do
  curl -s $(minikube service hello-world --url) | grep "Hostname"
done
```

You should see different pod names:

```
Hostname: hello-world-xxxxxxxxxx-aaaaa
Hostname: hello-world-xxxxxxxxxx-ccccc
Hostname: hello-world-xxxxxxxxxx-bbbbb
Hostname: hello-world-xxxxxxxxxx-aaaaa
Hostname: hello-world-xxxxxxxxxx-ccccc
Hostname: hello-world-xxxxxxxxxx-bbbbb
```

Each request is handled by a different pod. The Service is **load balancing** — distributing requests across all available pods.

```
                    Service (hello-world)
                    ┌──────────────────┐
                    │                  │
Request 1 ────────→ │  ──→ Pod A       │
Request 2 ────────→ │  ──→ Pod B       │
Request 3 ────────→ │  ──→ Pod C       │
Request 4 ────────→ │  ──→ Pod A       │
Request 5 ────────→ │  ──→ Pod B       │
Request 6 ────────→ │  ──→ Pod C       │
                    │                  │
                    └──────────────────┘
```

### How does the Service know about all 3 pods?

Remember from Part 4: the Service uses a **label selector** (`app: hello-world`) to find its pods. Let's verify:

```sh
kubectl describe service hello-world
```

Look at the **Endpoints** field:

```
Endpoints: 172.17.0.3:8080, 172.17.0.4:8080, 172.17.0.5:8080
```

Three endpoints — one for each pod. The Service watches for pods matching its selector and automatically updates this list when pods are added or removed.

---

## 4. Self-Healing: Killing a Pod

This is the part that impresses people. Let's deliberately kill a pod and watch Kubernetes replace it.

### Set up a watch

In one terminal, watch pods in real time:

```sh
kubectl get pods --watch
```

### Kill a pod

In a **second terminal**, find and delete a pod:

```sh
kubectl get pods
```

Pick any pod name and delete it:

```sh
kubectl delete pod hello-world-xxxxxxxxxx-aaaaa
```

### Watch the recovery

In your watch terminal, you'll see:

```
NAME                           READY   STATUS        RESTARTS   AGE
hello-world-xxxxxxxxxx-aaaaa   1/1     Terminating   0          10m
hello-world-xxxxxxxxxx-bbbbb   1/1     Running       0          10m
hello-world-xxxxxxxxxx-ccccc   1/1     Running       0          10m
hello-world-xxxxxxxxxx-ddddd   0/1     Pending       0          1s
hello-world-xxxxxxxxxx-ddddd   0/1     ContainerCreating   0    2s
hello-world-xxxxxxxxxx-ddddd   1/1     Running       0          4s
hello-world-xxxxxxxxxx-aaaaa   0/1     Terminating   0          10m
hello-world-xxxxxxxxxx-aaaaa   0/1     Terminating   0          10m
```

**What happened:**

1. Pod `aaaaa` enters `Terminating` state
2. The ReplicaSet detects only 2 pods running (desired: 3)
3. A new pod `ddddd` is immediately created
4. Within seconds, the new pod is `Running`
5. Old pod `aaaaa` finishes terminating
6. We're back to 3 healthy pods

The whole process takes a few seconds. Your users would barely notice — the Service was still routing traffic to the other 2 healthy pods while the replacement was starting.

```
Timeline:
──────────────────────────────────────────────────→ time

Pod A:  [████████████████████▓▓▓▓]          ▓ = terminating
Pod B:  [████████████████████████████████]
Pod C:  [████████████████████████████████]
Pod D:                       [░░████████████████]  ░ = starting
                             ↑
                       pod A deleted,
                       pod D created
```

### What triggers self-healing?

Self-healing isn't just for deleted pods. Kubernetes will intervene when:

- A pod is **deleted** (as we just tested)
- A pod **crashes** (exits with an error)
- A node **fails** (all pods on that node are rescheduled to healthy nodes)
- A pod's **health check fails** (we'll add health checks in Part 10)

---

## 5. Scaling Down

Scaling down is just as easy. Let's go from 3 to 2:

Edit `hello-world.yaml`:
```yaml
spec:
  replicas: 2
```

```sh
kubectl apply -f ~/k8s-tutorial/hello-world.yaml
```

Kubernetes will terminate one pod. It chooses which pod to remove based on several factors (age, resource usage, distribution across nodes).

Check:

```sh
kubectl get pods
```

Two pods remaining.

### Scaling to zero

You can even scale to zero:

```sh
kubectl scale deployment hello-world --replicas=0
```

```sh
kubectl get pods
```

```
No resources found in default namespace.
```

All pods are gone. The Deployment and Service still exist, but there's nothing running. This is useful for temporarily stopping an application without deleting its configuration.

Scale back up:

```sh
kubectl scale deployment hello-world --replicas=3
```

Three new pods appear within seconds.

---

## 6. How Rolling Updates Work (Preview)

When you change something in the pod template (like the container image), the Deployment performs a **rolling update** — replacing pods one at a time to avoid downtime:

```
Rolling Update (3 replicas, updating from v1 to v2):

Step 1: Create 1 new pod (v2), keep 3 old (v1)
  v1: [██] [██] [██]
  v2: [░░]              ← starting

Step 2: New pod ready, terminate 1 old pod
  v1: [██] [██] [▓▓]    ← terminating
  v2: [██]              ← ready

Step 3: Create another v2, terminate another v1
  v1: [██] [▓▓]
  v2: [██] [░░]

Step 4: Continue until all pods are v2
  v1: (none)
  v2: [██] [██] [██]    ← all updated
```

At no point are zero pods running. Traffic continues to flow through healthy pods throughout the update. We'll explore this more in later parts, but this is why Deployments manage ReplicaSets — each update creates a new ReplicaSet while scaling down the old one.

You can see the rollout status:

```sh
kubectl rollout status deployment hello-world
```

And the rollout history:

```sh
kubectl rollout history deployment hello-world
```

---

## 7. Monitoring Your Deployment

Here are some useful commands for understanding the state of your scaled deployment:

### Resource usage

```sh
kubectl top pods
```

**Note:** This requires the metrics-server addon. Enable it on Minikube:

```sh
minikube addons enable metrics-server
```

Wait a minute for it to start collecting data, then:

```sh
kubectl top pods
```

```
NAME                           CPU(cores)   MEMORY(bytes)
hello-world-xxxxxxxxxx-aaaaa   1m           10Mi
hello-world-xxxxxxxxxx-bbbbb   1m           10Mi
hello-world-xxxxxxxxxx-ccccc   1m           10Mi
```

- **CPU** is measured in **millicores** (m). 1000m = 1 full CPU core. Our pods use almost nothing.
- **Memory** is in mebibytes (Mi). 10Mi is tiny.

This information becomes critical when setting resource limits (Part 10).

### Events

```sh
kubectl get events --sort-by='.lastTimestamp'
```

This shows a chronological log of everything that happened in the cluster — pod creations, deletions, scheduling decisions, errors. Very useful for debugging.

---

## 8. Experiment: Chaos Testing

Let's push things further. What happens if we delete all pods at once?

```sh
kubectl delete pods --all
```

Immediately watch:

```sh
kubectl get pods --watch
```

All 3 pods enter `Terminating`, and 3 new pods are immediately created. The Deployment's desired state is "3 replicas," so 3 new ones must exist. Kubernetes doesn't panic — it just does the maths.

What about something more extreme? Let's try to delete the ReplicaSet:

```sh
kubectl get replicaset
```

```sh
kubectl delete replicaset hello-world-xxxxxxxxxx
```

Watch what happens:

```sh
kubectl get replicaset
```

The Deployment created a **new ReplicaSet**, which in turn created new pods. The Deployment is the top-level controller — it won't let its ReplicaSet stay deleted.

This is the hierarchy of self-healing:

```
Level 3: Deployment
  ↓ "I need a ReplicaSet" → recreates if deleted
Level 2: ReplicaSet
  ↓ "I need 3 Pods" → recreates if deleted
Level 1: Pod
  ↓ "I need 1 Container" → restarts if crashed
```

The only way to truly stop everything is to delete the Deployment itself.

---

## What Problem Did We Just Solve?

We solved the reliability problem:

1. **Scaling** — running multiple replicas so no single pod is a single point of failure
2. **Self-healing** — Kubernetes automatically replaces failed pods without human intervention
3. **Load balancing** — Services distribute traffic across all healthy replicas

These three features together mean your application can handle pod failures, node failures, and traffic spikes without manual intervention. This is the core value proposition of Kubernetes.

### What would break in production?

- We're scaling **manually**. In production, you'd use a **Horizontal Pod Autoscaler (HPA)** that automatically adjusts replica count based on CPU usage, memory, or custom metrics.
- All our pods are on a **single node** (Minikube). In production, replicas would be spread across multiple nodes so that a node failure doesn't take all replicas down.
- We have no **Pod Disruption Budget (PDB)** — which tells Kubernetes the minimum number of pods that must stay running during voluntary disruptions (like node upgrades).

---

## What's Next?

We've been working with a single application. In **Part 7**, we'll deploy a **second application** alongside the first, creating a multi-service architecture. This is where we start building something that looks like a real microservices platform.
