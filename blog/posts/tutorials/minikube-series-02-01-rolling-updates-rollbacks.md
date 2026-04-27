This is Part 1 of Series 2 — a 10-part intermediate Kubernetes series using Minikube. We explore how Kubernetes replaces your application without downtime and how to undo mistakes.

---

## The Series

This is **Series 2** — building on the foundations from [Series 1](/blog/view.html?slug=minikube-series-01-01-what-is-kubernetes&folder=tutorials). Each part goes deeper into the machinery behind Kubernetes.

1. **Rolling Updates and Rollbacks** ← you are here
2. [Namespaces and Resource Quotas](/blog/view.html?slug=minikube-series-02-02-namespaces-resource-quotas&folder=tutorials)
3. [Secrets and Configuration](/blog/view.html?slug=minikube-series-02-03-secrets-and-configuration&folder=tutorials)
4. [Persistent Storage](/blog/view.html?slug=minikube-series-02-04-persistent-storage&folder=tutorials)
5. [Networking from the Inside](/blog/view.html?slug=minikube-series-02-05-networking-internals&folder=tutorials)
6. [Jobs, CronJobs, and Batch Work](/blog/view.html?slug=minikube-series-02-06-jobs-cronjobs-batch&folder=tutorials)
7. [StatefulSets and Databases](/blog/view.html?slug=minikube-series-02-07-statefulsets-databases&folder=tutorials)
8. [Helm and Chart Packaging](/blog/view.html?slug=minikube-series-02-08-helm-chart-packaging&folder=tutorials)
9. [RBAC and Security](/blog/view.html?slug=minikube-series-02-09-rbac-security&folder=tutorials)
10. [Debugging Like an SRE](/blog/view.html?slug=minikube-series-02-10-debugging-like-an-sre&folder=tutorials)

---

## Introduction

In Series 1 Part 6, we scaled our application and watched Kubernetes replace crashed pods. We briefly mentioned that Deployments perform "rolling updates" — but we never explored what that actually means.

How does Kubernetes replace your application without downtime? What happens to the old pods while new ones are starting? What if the new version is broken — can you undo it? And how does any of this actually work under the hood?

This part answers all of those questions. By the end, you'll understand the full mechanics of a rollout — from ReplicaSet creation to pod-by-pod replacement — and you'll be able to roll back a broken release in seconds.

---

## Prerequisites

- Minikube running: `minikube start --driver=docker`
- Clean namespace:

```sh
kubectl delete all --all
```

---

## 1. The Deployment-ReplicaSet Relationship

In Series 1 Part 3, we saw the resource hierarchy: Deployment → ReplicaSet → Pod. We said the Deployment manages pods. That's true, but it's imprecise. The Deployment doesn't manage pods directly — it manages **ReplicaSets**, and each ReplicaSet manages a set of pods.

Here's why this matters: **every change to the pod template creates a new ReplicaSet.**

```
First deploy (v1):
  Deployment
  └── ReplicaSet-A (image: echoserver:1.10)
      ├── Pod-1
      ├── Pod-2
      └── Pod-3

After updating image to v2:
  Deployment
  ├── ReplicaSet-A (image: echoserver:1.10)  ← scaling down
  │   ├── Pod-1  (terminating)
  │   └── Pod-2  (still running)
  │
  └── ReplicaSet-B (image: nginx:alpine)     ← scaling up
      ├── Pod-4  (running)
      └── Pod-5  (starting)
```

The old ReplicaSet isn't deleted — it's scaled to zero. Kubernetes keeps it around so you can roll back. This is a deliberate design decision that makes rollbacks nearly instantaneous.

### Let's see it in practice

Create `~/k8s-tutorial-2/deployment.yaml`:

```sh
mkdir -p ~/k8s-tutorial-2 && cd ~/k8s-tutorial-2
```

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: nginx
        image: nginx:1.24
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  type: NodePort
  selector:
    app: web
  ports:
  - port: 80
    targetPort: 80
```

```sh
kubectl apply -f deployment.yaml
```

Wait for all pods to be ready:

```sh
kubectl get pods --watch
```

Now check the ReplicaSets:

```sh
kubectl get replicasets
```

```
NAME             DESIRED   CURRENT   READY   AGE
web-5d4f4b7b8c   3         3         3       30s
```

One ReplicaSet, managing 3 pods. The hash `5d4f4b7b8c` is derived from the pod template — if the template changes, the hash changes, and a new ReplicaSet is created.

---

## 2. Triggering a Rolling Update

A rolling update is triggered when you change the **pod template** in a Deployment. This includes:

- Changing the container image
- Changing environment variables
- Changing volume mounts
- Changing resource requests/limits
- Changing the pod's labels (inside the template)

Things that do **NOT** trigger a rollout:

- Changing `replicas` (that's just scaling)
- Changing the Deployment's own labels or annotations (outside the template)

### Updating the image

Let's update NGINX from 1.24 to 1.25. First, open a watch in a separate terminal:

```sh
kubectl get pods --watch
```

Now trigger the update:

```sh
kubectl set image deployment/web nginx=nginx:1.25
```

In your watch terminal, you'll see something like this unfold over a few seconds:

```
NAME                   READY   STATUS              RESTARTS   AGE
web-5d4f4b7b8c-aaaaa   1/1     Running             0          5m
web-5d4f4b7b8c-bbbbb   1/1     Running             0          5m
web-5d4f4b7b8c-ccccc   1/1     Running             0          5m
web-7f8d9e6a2b-ddddd   0/1     ContainerCreating   0          2s
web-7f8d9e6a2b-ddddd   1/1     Running             0          5s
web-5d4f4b7b8c-aaaaa   1/1     Terminating         0          5m
web-7f8d9e6a2b-eeeee   0/1     ContainerCreating   0          1s
web-7f8d9e6a2b-eeeee   1/1     Running             0          4s
web-5d4f4b7b8c-bbbbb   1/1     Terminating         0          5m
web-7f8d9e6a2b-fffff   0/1     ContainerCreating   0          1s
web-7f8d9e6a2b-fffff   1/1     Running             0          3s
web-5d4f4b7b8c-ccccc   1/1     Terminating         0          5m
```

### What just happened — step by step

```
Step 1: Kubernetes creates a NEW ReplicaSet (web-7f8d9e6a2b)
        with the updated image (nginx:1.25)

Step 2: New ReplicaSet scales up by 1 pod (web-ddddd)
        Old ReplicaSet still has 3 pods
        Total: 4 pods (1 new + 3 old)

Step 3: New pod passes readiness check
        Old ReplicaSet scales down by 1 (web-aaaaa terminating)
        Total: 3 pods (1 new + 2 old)

Step 4: Another new pod created, another old pod terminated
        Total: 3 pods (2 new + 1 old)

Step 5: Final new pod created, final old pod terminated
        Total: 3 pods (3 new + 0 old)

Result: All pods now running nginx:1.25
```

At no point were there fewer than 2 running pods. Users never saw downtime.

### Check the ReplicaSets now

```sh
kubectl get replicasets
```

```
NAME             DESIRED   CURRENT   READY   AGE
web-5d4f4b7b8c   0         0         0       6m    ← old (nginx:1.24)
web-7f8d9e6a2b   3         3         3       1m    ← new (nginx:1.25)
```

The old ReplicaSet still exists, scaled to zero. This is your rollback safety net.

---

## 3. Controlling the Rollout Speed

The rolling update behaviour is controlled by two parameters: **maxSurge** and **maxUnavailable**. These determine how aggressively Kubernetes replaces pods.

### maxSurge

How many **extra** pods can exist beyond the desired replica count during the update.

- `maxSurge: 1` — at most 1 extra pod (4 total if replicas=3)
- `maxSurge: 50%` — at most 50% extra pods (5 total if replicas=3, rounded up)

Higher maxSurge = faster rollout (more new pods created at once), but uses more resources temporarily.

### maxUnavailable

How many pods can be **unavailable** during the update.

- `maxUnavailable: 0` — all 3 pods must be available at all times (safest, slowest)
- `maxUnavailable: 1` — at most 1 pod can be down (2 always available)
- `maxUnavailable: 50%` — at most 50% can be down

Higher maxUnavailable = faster rollout, but more capacity lost during the transition.

### The defaults

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 25%
    maxUnavailable: 25%
```

With 3 replicas, 25% rounds to 1 for both values. So the default behaviour is: at most 4 pods total (3 + 1 surge), at most 1 unavailable.

### Configuring the strategy

Update `deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: nginx
        image: nginx:1.25
        ports:
        - containerPort: 80
```

**`maxUnavailable: 0`** means Kubernetes will never terminate an old pod until a new one is ready. This is the **safest** strategy — zero capacity loss — but the slowest because each new pod must pass its readiness check before the next replacement begins.

```
maxSurge: 1, maxUnavailable: 0 (safe, slow):

Time →
Old pods:  [███] [███] [███]
                              [██▓] ← terminating after new pod ready
                                    [██▓]
                                          [██▓]
New pods:       [░██] ← starts, waits for ready
                     [░██]
                          [░██]

Always 3 available pods. Never fewer.
```

```
maxSurge: 3, maxUnavailable: 1 (fast, risky):

Time →
Old pods:  [███] [███] [███]
           [██▓] [██▓]         ← 2 terminated immediately
New pods:  [░██] [░██] [░██]   ← 3 created at once

Faster, but briefly only 1 old pod serving traffic.
```

### Apply and test

```sh
kubectl apply -f deployment.yaml
```

Trigger a new rollout by changing the image:

```sh
kubectl set image deployment/web nginx=nginx:1.26 && kubectl rollout status deployment/web
```

`kubectl rollout status` blocks and shows progress:

```
Waiting for deployment "web" rollout to finish: 1 out of 3 new replicas have been updated...
Waiting for deployment "web" rollout to finish: 2 out of 3 new replicas have been updated...
deployment "web" successfully rolled out
```

---

## 4. The Recreate Strategy

Sometimes a rolling update isn't appropriate. If your app can't run two versions simultaneously (e.g., it holds an exclusive database lock, or two versions would conflict), you need the **Recreate** strategy:

```yaml
strategy:
  type: Recreate
```

With Recreate, Kubernetes:
1. Kills **all** old pods at once
2. Waits for them to terminate
3. Creates all new pods

```
Recreate strategy:

Time →
Old pods:  [███] [███] [███]
           [▓▓▓] [▓▓▓] [▓▓▓]  ← all terminated
                                   (gap — no pods running!)
New pods:                      [░██] [░██] [░██]
```

**There is downtime.** This is deliberate. Use Recreate only when you truly need a clean cut — no overlap between old and new.

### When to use each

| Strategy | Downtime | Use when |
|----------|----------|----------|
| **RollingUpdate** | None | Most applications (the default) |
| **Recreate** | Yes | Apps that can't run two versions at once, database schema migrations, single-instance apps |

---

## 5. Rollback History

Every rollout creates a new revision in the Deployment's history. Let's look at it:

```sh
kubectl rollout history deployment/web
```

```
REVISION  CHANGE-CAUSE
1         <none>
2         <none>
3         <none>
```

The CHANGE-CAUSE is empty because we didn't annotate our changes. Let's fix that for future rollouts:

```sh
kubectl annotate deployment/web kubernetes.io/change-cause="Update to nginx:1.26"
```

Now the history shows:

```
REVISION  CHANGE-CAUSE
1         <none>
2         <none>
3         Update to nginx:1.26
```

### Inspecting a specific revision

```sh
kubectl rollout history deployment/web --revision=1
```

This shows the full pod template for that revision — the image, environment variables, volumes, everything. It's the complete snapshot of what was running.

### How many revisions are kept?

Controlled by `revisionHistoryLimit` in the Deployment spec:

```yaml
spec:
  revisionHistoryLimit: 10   # Default is 10
```

Kubernetes keeps this many old ReplicaSets (scaled to zero). Beyond this limit, old ReplicaSets are garbage-collected.

---

## 6. Rolling Back

Let's deploy a deliberately broken version:

```sh
kubectl set image deployment/web nginx=nginx:99.99.99
```

This image doesn't exist. Watch what happens:

```sh
kubectl get pods --watch
```

```
NAME                   READY   STATUS             RESTARTS   AGE
web-7f8d9e6a2b-aaaaa   1/1     Running            0          5m
web-7f8d9e6a2b-bbbbb   1/1     Running            0          5m
web-7f8d9e6a2b-ccccc   1/1     Running            0          5m
web-9a1b2c3d4e-ddddd   0/1     ImagePullBackOff   0          30s
```

The new pod can't start because the image doesn't exist. But notice: the **old pods are still running**. Because we set `maxUnavailable: 0`, Kubernetes won't terminate old pods until new ones are ready. The broken version is stuck — but the old version is still serving traffic.

Check the rollout status:

```sh
kubectl rollout status deployment/web
```

```
Waiting for deployment "web" rollout to finish: 1 out of 3 new replicas have been updated...
```

It's stuck. Press `Ctrl+C`.

### Rolling back to the previous version

```sh
kubectl rollout undo deployment/web
```

```
deployment.apps/web rolled back
```

Watch the pods:

```sh
kubectl get pods
```

The broken pod is gone. The old pods are still running. What actually happened?

```sh
kubectl get replicasets
```

```
NAME             DESIRED   CURRENT   READY   AGE
web-5d4f4b7b8c   0         0         0       15m   ← revision 1 (nginx:1.24)
web-7f8d9e6a2b   3         3         3       10m   ← revision 3 (nginx:1.26) ← active again
web-9a1b2c3d4e   0         0         0       2m    ← revision 4 (nginx:99.99.99) ← broken
```

The rollback didn't "reverse" anything. It told the Deployment: "use the pod template from the previous revision." Since that old ReplicaSet already exists (with its pods still running), the switch is nearly instant.

### Rolling back to a specific revision

```sh
kubectl rollout undo deployment/web --to-revision=1
```

This goes all the way back to revision 1 (nginx:1.24). The old ReplicaSet for revision 1 scales back up, and the current one scales down.

### Rollback under the hood

A rollback is not a special operation. It's just another rollout that happens to use an old template:

```
Rollback = "Copy the pod template from revision N,
            create a new revision with it,
            trigger a normal rolling update"

It reuses the existing (scaled-to-zero) ReplicaSet,
so the image is already cached on the node — making
the rollback almost instant.
```

---

## 7. Simulating Blue/Green and Canary Deployments

Kubernetes doesn't have built-in blue/green or canary strategies, but you can achieve them with what we've already learned: labels and Services.

### Blue/Green deployment

The idea: run the new version alongside the old, then switch all traffic at once.

```yaml
# blue-deployment.yaml (current production)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-blue
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
      version: blue
  template:
    metadata:
      labels:
        app: web
        version: blue
    spec:
      containers:
      - name: nginx
        image: nginx:1.24
        ports:
        - containerPort: 80
```

```yaml
# green-deployment.yaml (new version)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-green
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
      version: green
  template:
    metadata:
      labels:
        app: web
        version: green
    spec:
      containers:
      - name: nginx
        image: nginx:1.26
        ports:
        - containerPort: 80
```

```yaml
# service.yaml — points at blue
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
    version: blue    # ← change to "green" to switch
  ports:
  - port: 80
    targetPort: 80
```

To switch traffic: change the Service selector from `version: blue` to `version: green` and apply. All traffic switches instantly. To roll back: switch back to `blue`.

```
Blue/Green:

Service selector: version=blue
  ┌─────────────────┐        ┌─────────────────┐
  │ web-blue (v1.24)│ ←──── │    Service       │
  │ 3 pods, active  │        │   version: blue  │
  └─────────────────┘        └─────────────────┘
  ┌─────────────────┐
  │ web-green (v1.26)│       (no traffic)
  │ 3 pods, idle    │
  └─────────────────┘

After switching selector to version=green:
  ┌─────────────────┐
  │ web-blue (v1.24)│       (no traffic)
  │ 3 pods, idle    │
  └─────────────────┘
  ┌─────────────────┐        ┌─────────────────┐
  │ web-green (v1.26)│←──── │    Service       │
  │ 3 pods, active  │        │  version: green  │
  └─────────────────┘        └─────────────────┘
```

### Canary deployment

The idea: send a small percentage of traffic to the new version. If it works, scale it up; if it breaks, remove it.

The trick is to make the Service selector match **both** versions:

```yaml
# Service — matches any pod with app=web (no version filter)
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web     # ← matches both blue AND green pods
  ports:
  - port: 80
    targetPort: 80
```

Deploy the "canary" with just 1 replica:

```yaml
# canary-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-canary
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web
      version: canary
  template:
    metadata:
      labels:
        app: web
        version: canary
    spec:
      containers:
      - name: nginx
        image: nginx:1.26
        ports:
        - containerPort: 80
```

Now the Service load-balances across 4 pods: 3 old + 1 canary. Roughly 25% of traffic hits the new version. If it works, scale the canary up and the old version down. If it breaks, delete the canary Deployment.

```
Canary:

Service selector: app=web
  ┌─────────────────┐
  │ web-blue (v1.24)│ ←── 75% traffic (3 pods)
  │ 3 pods          │
  └─────────────────┘
  ┌─────────────────┐
  │ web-canary(v1.26)│←── 25% traffic (1 pod)
  │ 1 pod           │
  └─────────────────┘
```

This is a simplified version — production canary deployments use service meshes (Istio, Linkerd) for precise traffic splitting. But this pattern works and requires nothing beyond core Kubernetes.

---

## 8. Monitoring Rollouts

Here are the commands you'll use to track deployments:

### Rollout status

```sh
# Watch rollout progress (blocks until complete or failed)
kubectl rollout status deployment/web

# Check if a rollout is stuck
kubectl rollout status deployment/web --timeout=60s
```

### Pause and resume

If you want to pause a rollout mid-way (e.g., to inspect the new pods before continuing):

```sh
# Pause — stops the rollout where it is
kubectl rollout pause deployment/web

# Check current state (some new, some old)
kubectl get pods -o wide

# Resume — continues the rollout
kubectl rollout resume deployment/web
```

This is useful for manual canary-style validation during a rolling update.

### Viewing what changed

```sh
# See the diff between current and a revision
kubectl rollout history deployment/web --revision=2
kubectl rollout history deployment/web --revision=3
```

Compare the two outputs to see what changed between revisions.

---

## What Problem Did We Just Solve?

We learned how Kubernetes manages change safely:

1. **Rolling updates** replace pods one at a time — no downtime
2. **maxSurge and maxUnavailable** control the speed vs safety trade-off
3. **ReplicaSet history** provides instant rollbacks
4. **Recreate** strategy handles the rare case where overlap isn't possible
5. **Blue/Green and Canary** patterns work with just labels and Services

The key insight: **a rollout is just two ReplicaSets scaling in opposite directions.** Old scales down, new scales up. If the new one fails, the old one is still there, ready to scale back up.

### What would break in production?

- Our canary deployment splits traffic by pod count, not by percentage. In production, you'd want **weighted traffic splitting** (90/10, then 80/20, etc.) — this requires a service mesh or Ingress controller with traffic splitting support.
- We're not running **automated rollback on probe failure**. If the new version fails readiness probes, the rollout stalls but doesn't automatically undo. You can configure `progressDeadlineSeconds` to detect stalled rollouts.
- Our rollout history shows `<none>` for CHANGE-CAUSE. In production CI/CD, every deployment should be annotated with the commit hash, PR number, or ticket that triggered it.

---

## What's Next?

In **Part 2**, we'll tackle **Namespaces and Resource Quotas** — how to divide your cluster into isolated sections for different teams or environments, and how to prevent one team's workload from starving another.
