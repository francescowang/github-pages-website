This is Part 2 of Series 2 — a 10-part intermediate Kubernetes series using Minikube. We organise a cluster for multiple teams and environments using Namespaces and Resource Quotas.

---

## The Series

1. [Rolling Updates and Rollbacks](/blog/view.html?slug=minikube-series-02-01-rolling-updates-rollbacks&folder=tutorials)
2. **Namespaces and Resource Quotas** ← you are here
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

In Series 1, we threw everything into the `default` namespace. That works when you're the only person using the cluster. But in practice, clusters are shared — multiple teams, multiple environments (dev, staging, production), multiple projects. Without boundaries, one team's runaway Deployment can consume all the cluster's CPU and memory, starving everyone else.

**Namespaces** divide a cluster into virtual sections. **Resource Quotas** put hard limits on what each section can consume. **LimitRanges** set defaults for pods that don't specify their own limits. Together, they're how you make a shared cluster safe.

---

## Prerequisites

- Minikube running: `minikube start --driver=docker`
- Enable metrics-server (we'll need it to observe resource usage):

```sh
minikube addons enable metrics-server
```

---

## 1. Namespaces In Depth

In Series 1 Part 2, we briefly saw namespaces when we listed the system pods in `kube-system`. Now let's understand them fully.

### What namespaces isolate

Namespaces provide **name scoping**. You can have a Service called `api` in the `dev` namespace and another Service called `api` in the `staging` namespace — they don't conflict. Without namespaces, you'd need globally unique names like `dev-api` and `staging-api`.

Namespaces also provide a boundary for:
- **Resource quotas** — limit CPU/memory per namespace
- **RBAC policies** — give a team access to their namespace only (Part 9)
- **Network policies** — restrict pod communication by namespace (Part 5)

### What namespaces do NOT isolate

Namespaces are **not** a security boundary on their own. They don't:
- Isolate the network (pods in different namespaces can talk to each other by default)
- Isolate nodes (pods from any namespace can be scheduled on any node)
- Provide full multi-tenancy (you need RBAC, NetworkPolicies, and more for that)

Think of namespaces as folders on a shared computer. They organise your files and prevent name collisions, but they don't stop someone from browsing into your folder unless you set explicit permissions.

### Creating namespaces

```sh
kubectl create namespace dev
kubectl create namespace staging
```

Or with YAML (better for version control):

```yaml
# namespaces.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: dev
  labels:
    environment: development
---
apiVersion: v1
kind: Namespace
metadata:
  name: staging
  labels:
    environment: staging
```

```sh
kubectl apply -f namespaces.yaml
```

Verify:

```sh
kubectl get namespaces
```

```
NAME              STATUS   AGE
default           Active   1h
dev               Active   10s
kube-node-lease   Active   1h
kube-public       Active   1h
kube-system       Active   1h
staging           Active   10s
```

### Deploying into a specific namespace

Add `--namespace` (or `-n`) to any kubectl command:

```sh
kubectl apply -f deployment.yaml --namespace=dev
```

Or specify it in the YAML itself:

```yaml
metadata:
  name: api
  namespace: dev    # ← deployed into the dev namespace
```

### Setting a default namespace

Typing `-n dev` on every command gets tedious. Set a default:

```sh
kubectl config set-context --current --namespace=dev
```

Now all commands without an explicit `-n` flag target the `dev` namespace. Verify:

```sh
kubectl config view --minify | grep namespace
```

```
namespace: dev
```

**Important:** Remember to switch back when you want the default namespace:

```sh
kubectl config set-context --current --namespace=default
```

### Listing resources across namespaces

```sh
# All pods across all namespaces
kubectl get pods --all-namespaces

# Shorthand
kubectl get pods -A
```

---

## 2. Deploying to Multiple Namespaces

Let's deploy the same application into both `dev` and `staging` — with different configurations.

Create `~/k8s-tutorial-2/dev-app.yaml`:

```yaml
# dev-app.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: dev
  labels:
    app: api
    environment: dev
spec:
  replicas: 1
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
        environment: dev
    spec:
      containers:
      - name: echoserver
        image: registry.k8s.io/echoserver:1.10
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: "50m"
            memory: "64Mi"
          limits:
            cpu: "100m"
            memory: "128Mi"
---
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: dev
spec:
  type: ClusterIP
  selector:
    app: api
  ports:
  - port: 8080
    targetPort: 8080
```

Create `~/k8s-tutorial-2/staging-app.yaml`:

```yaml
# staging-app.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: staging
  labels:
    app: api
    environment: staging
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
        environment: staging
    spec:
      containers:
      - name: echoserver
        image: registry.k8s.io/echoserver:1.10
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: "100m"
            memory: "128Mi"
          limits:
            cpu: "250m"
            memory: "256Mi"
---
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: staging
spec:
  type: ClusterIP
  selector:
    app: api
  ports:
  - port: 8080
    targetPort: 8080
```

Deploy both:

```sh
kubectl apply -f ~/k8s-tutorial-2/dev-app.yaml
kubectl apply -f ~/k8s-tutorial-2/staging-app.yaml
```

Now verify:

```sh
kubectl get deployments -A
```

```
NAMESPACE     NAME   READY   UP-TO-DATE   AVAILABLE   AGE
dev           api    1/1     1            1           30s
staging       api    2/2     2            2           30s
```

Same name `api`, different namespaces, different configurations. The `dev` environment runs 1 replica with minimal resources. The `staging` environment runs 2 replicas with more resources.

### Cross-namespace DNS

Pods can still reach services in other namespaces — using the full DNS name:

```
Within the same namespace:     api
From a different namespace:    api.dev.svc.cluster.local
                               api.staging.svc.cluster.local
```

Let's verify. Run a temporary pod in the `dev` namespace and reach the `staging` API:

```sh
kubectl run dns-test -n dev --image=busybox --rm -it --restart=Never -- wget -qO- http://api.staging.svc.cluster.local:8080
```

You'll see the echoserver response from the staging namespace. Namespaces isolate names, not network access (we'll address that with Network Policies in Part 5).

---

## 3. Resource Quotas

Resource Quotas put hard limits on what a namespace can consume. Think of them as a budget — the namespace can't spend more than its allocation.

### Creating a Resource Quota

Create `~/k8s-tutorial-2/dev-quota.yaml`:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: dev-quota
  namespace: dev
spec:
  hard:
    requests.cpu: "500m"
    requests.memory: "512Mi"
    limits.cpu: "1"
    limits.memory: "1Gi"
    pods: "5"
    services: "3"
    configmaps: "5"
    secrets: "5"
```

```sh
kubectl apply -f ~/k8s-tutorial-2/dev-quota.yaml
```

### Breaking this down

| Quota | Meaning |
|-------|---------|
| `requests.cpu: "500m"` | Total CPU requests across all pods in this namespace cannot exceed 500 millicores |
| `requests.memory: "512Mi"` | Total memory requests cannot exceed 512Mi |
| `limits.cpu: "1"` | Total CPU limits cannot exceed 1 core |
| `limits.memory: "1Gi"` | Total memory limits cannot exceed 1Gi |
| `pods: "5"` | Maximum 5 pods in this namespace |
| `services: "3"` | Maximum 3 Services |
| `configmaps: "5"` | Maximum 5 ConfigMaps |
| `secrets: "5"` | Maximum 5 Secrets |

### Viewing quota usage

```sh
kubectl describe resourcequota dev-quota -n dev
```

```
Name:            dev-quota
Namespace:       dev
Resource         Used    Hard
--------         ----    ----
configmaps       1       5
limits.cpu       100m    1
limits.memory    128Mi   1Gi
pods             1       5
requests.cpu     50m     500m
requests.memory  64Mi    512Mi
secrets          1       5
services         1       3
```

The `Used` column shows current consumption. The `Hard` column shows the limit. You can immediately see how much budget remains.

### What happens when you exceed a quota?

Let's try. Scale the dev deployment to 10 replicas:

```sh
kubectl scale deployment api -n dev --replicas=10
```

Check the deployment:

```sh
kubectl get deployment api -n dev
```

```
NAME   READY   UP-TO-DATE   AVAILABLE   AGE
api    5/10    5            5           5m
```

Only 5 of 10 requested replicas are running — the quota allows a maximum of 5 pods. The ReplicaSet will keep trying to create more, but the API server rejects them.

Check the events to see the error:

```sh
kubectl get events -n dev --sort-by='.lastTimestamp'
```

```
Warning  FailedCreate  ReplicaSet/api-xxx  Error creating: pods "api-xxx" is
forbidden: exceeded quota: dev-quota, requested: pods=1, used: pods=5, limited: pods=5
```

Kubernetes is very explicit: it tells you which quota was exceeded, how much was requested, how much is used, and what the limit is.

Scale back down:

```sh
kubectl scale deployment api -n dev --replicas=1
```

### A critical behaviour: quotas require resource specs

When a ResourceQuota with CPU/memory limits is applied to a namespace, **every pod in that namespace must specify resource requests and limits**. If a pod doesn't, it's rejected.

Try deploying a pod without resource specs:

```sh
kubectl run test-pod -n dev --image=nginx
```

```
Error from server (Forbidden): pods "test-pod" is forbidden: failed quota: dev-quota:
must specify limits.cpu, limits.memory, requests.cpu, requests.memory
```

This is intentional — without resource specs, Kubernetes can't track quota usage. The solution is either to always specify resources in your manifests, or to use a **LimitRange** (next section) to set defaults.

---

## 4. LimitRanges

A LimitRange sets **default** resource requests and limits for containers in a namespace. It also enforces minimum and maximum values.

Create `~/k8s-tutorial-2/dev-limitrange.yaml`:

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: dev-limits
  namespace: dev
spec:
  limits:
  - type: Container
    default:
      cpu: "100m"
      memory: "128Mi"
    defaultRequest:
      cpu: "50m"
      memory: "64Mi"
    min:
      cpu: "25m"
      memory: "32Mi"
    max:
      cpu: "500m"
      memory: "512Mi"
```

```sh
kubectl apply -f ~/k8s-tutorial-2/dev-limitrange.yaml
```

### Breaking this down

| Field | Meaning |
|-------|---------|
| `default` | If a container doesn't specify `limits`, these are applied automatically |
| `defaultRequest` | If a container doesn't specify `requests`, these are applied automatically |
| `min` | No container can request less than this |
| `max` | No container can have limits higher than this |

### How it works

```
Pod spec says:             LimitRange applies:         Pod gets:
─────────────────          ──────────────────          ──────────

No resources specified  →  default + defaultRequest  → cpu: 50m/100m
                                                       mem: 64Mi/128Mi

requests.cpu: "200m"    →  Only limits defaulted     → cpu: 200m/100m
limits not specified                                    (request > limit
                                                        → error)

requests.cpu: "10m"     →  Below min (25m)           → REJECTED
```

Now the pod we tried earlier will work:

```sh
kubectl run test-pod -n dev --image=nginx
```

```
pod/test-pod created
```

Verify the defaults were applied:

```sh
kubectl describe pod test-pod -n dev | grep -A 4 "Limits\|Requests"
```

```
    Limits:
      cpu:     100m
      memory:  128Mi
    Requests:
      cpu:     50m
      memory:  64Mi
```

The LimitRange injected the defaults. The pod creator didn't need to specify anything.

Clean up:

```sh
kubectl delete pod test-pod -n dev
```

### LimitRange vs ResourceQuota

These two work together:

```
LimitRange (per container):
  "Each container gets at least 25m CPU and at most 500m CPU"
  → Controls individual containers

ResourceQuota (per namespace):
  "The entire namespace can use at most 1 CPU and 5 pods total"
  → Controls the aggregate
```

An analogy: a company's travel policy might say "each employee can spend up to £200 per night on a hotel" (LimitRange), while the department budget says "the team's total travel spend can't exceed £10,000 per quarter" (ResourceQuota).

---

## 5. Practical Exercise: Multi-Environment Setup

Let's build a complete multi-environment setup that you might use in a real project.

### Set up the staging namespace with its own quotas

Create `~/k8s-tutorial-2/staging-quota.yaml`:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: staging-quota
  namespace: staging
spec:
  hard:
    requests.cpu: "1"
    requests.memory: "1Gi"
    limits.cpu: "2"
    limits.memory: "2Gi"
    pods: "10"
    services: "5"
---
apiVersion: v1
kind: LimitRange
metadata:
  name: staging-limits
  namespace: staging
spec:
  limits:
  - type: Container
    default:
      cpu: "200m"
      memory: "256Mi"
    defaultRequest:
      cpu: "100m"
      memory: "128Mi"
    min:
      cpu: "50m"
      memory: "64Mi"
    max:
      cpu: "1"
      memory: "1Gi"
```

```sh
kubectl apply -f ~/k8s-tutorial-2/staging-quota.yaml
```

### Compare the environments

```sh
echo "=== DEV ===" && kubectl describe resourcequota dev-quota -n dev
echo "=== STAGING ===" && kubectl describe resourcequota staging-quota -n staging
```

Dev has tighter limits (learning, experimentation). Staging has more room (closer to production conditions). This is a common pattern — environments get progressively more resources as they move closer to production.

### Testing quota enforcement across environments

Try scaling staging to 15 replicas:

```sh
kubectl scale deployment api -n staging --replicas=15
```

```sh
kubectl get deployment api -n staging
```

```
NAME   READY    UP-TO-DATE   AVAILABLE   AGE
api    10/15    10           10          10m
```

Capped at 10 pods — the quota limit. The events will show the rejection reason.

Scale back:

```sh
kubectl scale deployment api -n staging --replicas=2
```

---

## 6. Namespace Lifecycle

### Deleting a namespace

Deleting a namespace deletes **everything** inside it — all pods, services, deployments, ConfigMaps, secrets, quotas, everything:

```sh
# DON'T RUN THIS (just showing the command)
# kubectl delete namespace dev
```

This is powerful and dangerous. In production, protect important namespaces with RBAC (Part 9) so that only administrators can delete them.

### Namespace naming conventions

Common patterns:

| Pattern | Example | Use case |
|---------|---------|----------|
| Environment | `dev`, `staging`, `prod` | Separating deployment stages |
| Team | `team-payments`, `team-auth` | Multi-team clusters |
| Project | `project-website`, `project-api` | Multi-project clusters |
| Combined | `payments-prod`, `auth-staging` | Team + environment |

Choose a convention and stick to it. Inconsistent naming creates confusion fast.

---

## 7. Useful Commands

```sh
# List all namespaces with labels
kubectl get namespaces --show-labels

# Get resource usage for a namespace
kubectl describe resourcequota -n dev

# Get limit ranges for a namespace
kubectl describe limitrange -n dev

# List all resources in a namespace
kubectl get all -n staging

# Get pods across all namespaces, sorted by namespace
kubectl get pods -A --sort-by='.metadata.namespace'
```

---

## Cleanup

For the next tutorials, let's clean up but keep the namespaces:

```sh
kubectl delete all --all -n dev
kubectl delete all --all -n staging
kubectl config set-context --current --namespace=default
```

---

## What Problem Did We Just Solve?

We learned how to divide a cluster into manageable, bounded sections:

1. **Namespaces** provide name isolation and a boundary for policies
2. **Resource Quotas** cap the total resources a namespace can consume — preventing one team from starving another
3. **LimitRanges** set defaults and constraints for individual containers — catching pods that forget to specify resources
4. **Cross-namespace DNS** still works — namespaces isolate names, not network access

The combination of all three gives you a cluster where teams can work independently, within defined boundaries, without risk of resource conflicts.

### What would break in production?

- Namespaces alone aren't a security boundary. Pods in different namespaces can still communicate freely. You need **Network Policies** (Part 5) to restrict traffic between namespaces.
- We haven't set up **RBAC** — anyone with cluster access can create resources in any namespace. Part 9 addresses this.
- In production, you'd typically use **Kustomize** or **Helm** (Part 8) to deploy the same application to multiple namespaces with environment-specific overrides, rather than maintaining separate YAML files per namespace.

---

## What's Next?

In **Part 3**, we'll tackle **Secrets and Configuration** — how to properly manage sensitive data like passwords and API keys, how ConfigMaps behave when updated, and the security implications you need to understand before deploying to a real cluster.
