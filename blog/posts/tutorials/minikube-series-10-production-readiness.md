This is Part 10 of a 10-part series on Kubernetes using Minikube. We add production-readiness features: health checks, resource limits, and observability.

---

## The Series

1. [What is Kubernetes?](/blog/view.html?slug=minikube-series-01-what-is-kubernetes&folder=tutorials)
2. [Setting Up Your Local Cluster](/blog/view.html?slug=minikube-series-02-setting-up-minikube&folder=tutorials)
3. [Your First Deployment](/blog/view.html?slug=minikube-series-03-first-deployment&folder=tutorials)
4. [Exposing Your App](/blog/view.html?slug=minikube-series-04-exposing-your-app&folder=tutorials)
5. [YAML and Declarative Configuration](/blog/view.html?slug=minikube-series-05-yaml-declarative-config&folder=tutorials)
6. [Scaling and Self-Healing](/blog/view.html?slug=minikube-series-06-scaling-and-self-healing&folder=tutorials)
7. [Multi-Service Architecture](/blog/view.html?slug=minikube-series-07-multi-service-architecture&folder=tutorials)
8. [Service-to-Service Communication](/blog/view.html?slug=minikube-series-08-service-to-service-communication&folder=tutorials)
9. [Ingress and HTTP Routing](/blog/view.html?slug=minikube-series-09-ingress-http-routing&folder=tutorials)
10. **Production Readiness** ← you are here

---

## Introduction

Over the past nine parts, we've built a multi-service platform with scaling, self-healing, DNS-based communication, and HTTP routing. It looks impressive — but it's still missing features that production systems depend on.

In this final part, we'll add three critical features:

- **Health checks (probes)** — so Kubernetes knows when your app is actually healthy, not just "running"
- **Resource limits** — so one misbehaving app can't starve the entire cluster
- **Observability** — so you can understand what's happening inside your cluster

These are what separate a working demo from a trustworthy system.

---

## Prerequisites

- Minikube running with the setup from Parts 7–9
- If starting fresh:

```sh
minikube start --driver=docker
minikube addons enable ingress
minikube addons enable metrics-server
```

---

## 1. Health Checks: Probes

### The problem

In Part 6, we saw Kubernetes restart crashed pods. But "crashed" means the process exited. What about an app that's still running but broken? An HTTP server that returns 500 errors, a worker stuck in an infinite loop, an app that lost its database connection — the container is running, but it's useless.

Kubernetes can't know this without help. That's where **probes** come in.

### Three types of probes

| Probe | Question it answers | What happens on failure |
|-------|-------------------|----------------------|
| **Liveness** | "Is the app alive?" | Kubernetes restarts the container |
| **Readiness** | "Is the app ready for traffic?" | Kubernetes removes it from the Service endpoints |
| **Startup** | "Has the app finished starting?" | Kubernetes waits before running other probes |

### An analogy

Think of a restaurant:

- **Liveness probe:** "Is the chef conscious?" If not, replace the chef (restart the container).
- **Readiness probe:** "Is the kitchen ready to take orders?" If not, stop sending customers (remove from Service endpoints) until it is.
- **Startup probe:** "Has the kitchen finished its prep?" Don't start checking liveness or readiness until prep is complete.

### Adding probes to our API

Update `~/k8s-tutorial/api.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  labels:
    app: api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
      - name: echoserver
        image: registry.k8s.io/echoserver:1.10
        ports:
        - containerPort: 8080
        livenessProbe:
          httpGet:
            path: /
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /
            port: 8080
          initialDelaySeconds: 3
          periodSeconds: 5
          failureThreshold: 2
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
spec:
  type: ClusterIP
  selector:
    app: api
  ports:
  - port: 8080
    targetPort: 8080
```

### Breaking down the probes

**Liveness probe:**

```yaml
livenessProbe:
  httpGet:
    path: /
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 3
```

- **httpGet:** Send an HTTP GET request to `localhost:8080/` inside the container
- **initialDelaySeconds: 5** — wait 5 seconds after the container starts before the first check (gives the app time to boot)
- **periodSeconds: 10** — check every 10 seconds
- **failureThreshold: 3** — after 3 consecutive failures, restart the container

If the endpoint returns an HTTP status code between 200–399, the probe passes. Any other code (or a timeout) is a failure.

**Readiness probe:**

```yaml
readinessProbe:
  httpGet:
    path: /
    port: 8080
  initialDelaySeconds: 3
  periodSeconds: 5
  failureThreshold: 2
```

Same mechanism, but different consequences:
- Liveness failure → container is **restarted**
- Readiness failure → pod is **removed from Service endpoints** (no traffic is sent to it)

We check readiness more frequently (every 5s vs 10s) and fail faster (2 failures vs 3) because removing a pod from traffic is less disruptive than restarting it.

### The probe lifecycle

```
Container starts
     │
     │ ── initialDelaySeconds (wait for app to boot) ──
     │
     ↓
┌────────────────────────────────────────────────────┐
│  Readiness probe starts (every 5s)                 │
│  • Pass → Pod added to Service endpoints           │
│  • Fail → Pod removed from Service endpoints       │
│                                                    │
│  Liveness probe starts (every 10s)                 │
│  • Pass → Nothing happens                          │
│  • Fail (3x) → Container restarted                 │
└────────────────────────────────────────────────────┘
```

### Other probe types

Besides `httpGet`, Kubernetes supports:

**TCP check** — just tests if the port is open:
```yaml
livenessProbe:
  tcpSocket:
    port: 8080
```

**Command execution** — runs a command inside the container:
```yaml
livenessProbe:
  exec:
    command:
    - cat
    - /tmp/healthy
```

The command probe is useful for non-HTTP services (databases, workers, etc.).

---

## 2. Resource Limits

### The problem

Without limits, a single pod can consume all the CPU and memory on a node, starving every other pod. In a shared cluster, this is catastrophic.

### Requests vs Limits

Kubernetes has two resource controls:

| Control | What it means | When it matters |
|---------|-------------|----------------|
| **Requests** | "I need at least this much" | Scheduling — the scheduler uses this to find a node with enough room |
| **Limits** | "I must never exceed this much" | Runtime — the container is throttled (CPU) or killed (memory) if it exceeds this |

```yaml
resources:
  requests:
    cpu: "100m"
    memory: "128Mi"
  limits:
    cpu: "250m"
    memory: "256Mi"
```

### Understanding CPU units

CPU is measured in **millicores** (m):
- `1000m` = 1 full CPU core
- `500m` = half a CPU core
- `100m` = 10% of a CPU core

Our API requests 100m (10% of a core) and is limited to 250m (25% of a core).

**What happens if the app exceeds the CPU limit?** It gets **throttled** — Kubernetes slows it down. The app doesn't crash; it just runs slower. This is a soft limit.

### Understanding memory units

Memory is measured in bytes with standard suffixes:
- `Mi` = mebibytes (1 Mi = 1,048,576 bytes)
- `Gi` = gibibytes

Our API requests 128Mi and is limited to 256Mi.

**What happens if the app exceeds the memory limit?** It gets **killed** (OOMKilled — Out Of Memory Killed). Kubernetes then restarts it. This is a hard limit — there's no way to "throttle" memory usage.

```
CPU limit exceeded:           Memory limit exceeded:
┌─────────────────────┐       ┌─────────────────────┐
│ App uses 300m CPU   │       │ App uses 300Mi RAM   │
│ Limit: 250m         │       │ Limit: 256Mi         │
│                     │       │                     │
│ Result: Throttled   │       │ Result: OOMKilled   │
│ App runs slower     │       │ Container restarts  │
│ No crash            │       │                     │
└─────────────────────┘       └─────────────────────┘
```

### An analogy

Think of requests and limits like renting an office:

- **Request:** "I need at least 50 square metres" — the estate agent won't offer smaller spaces
- **Limit:** "I'm not allowed more than 100 square metres" — if you try to expand beyond that, you're blocked

The scheduler uses requests to find a suitable node. Limits enforce boundaries at runtime.

---

## 3. Adding Resources to the Frontend

Update `~/k8s-tutorial/frontend.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  labels:
    app: frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: nginx
        image: nginx:alpine
        ports:
        - containerPort: 80
        livenessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 10
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 3
          periodSeconds: 5
          failureThreshold: 2
        resources:
          requests:
            cpu: "50m"
            memory: "64Mi"
          limits:
            cpu: "200m"
            memory: "128Mi"
---
apiVersion: v1
kind: Service
metadata:
  name: frontend
spec:
  type: ClusterIP
  selector:
    app: frontend
  ports:
  - port: 80
    targetPort: 80
```

The frontend gets lower resource limits because NGINX serving static files needs very little CPU and memory.

---

## 4. Deploy and Verify

Apply everything:

```sh
kubectl apply -f ~/k8s-tutorial/api.yaml
kubectl apply -f ~/k8s-tutorial/frontend.yaml
```

### Verify probes are configured

```sh
kubectl describe deployment api
```

Look for the `Liveness` and `Readiness` sections in the container spec. They'll show the probe configuration.

### Watch probes in action

```sh
kubectl get pods --watch
```

You should see pods go from `0/1` to `1/1` — the `1/1` in the READY column means the readiness probe is passing. If you see a pod stuck at `0/1`, the readiness probe is failing.

### Check resource allocation

```sh
kubectl describe node minikube
```

Scroll to the "Allocated resources" section:

```
Allocated resources:
  Resource           Requests     Limits
  --------           --------     ------
  cpu                550m (27%)   1050m (52%)
  memory             640Mi (16%) 1024Mi (26%)
```

This shows the total resources requested and limited by all pods on the node. The scheduler uses these numbers to decide if a new pod fits.

### Check resource usage (actual)

```sh
kubectl top pods
```

```
NAME                        CPU(cores)   MEMORY(bytes)
api-xxxxxxxxxx-aaaaa        1m           15Mi
api-xxxxxxxxxx-bbbbb        1m           14Mi
frontend-xxxxxxxxxx-ccccc   1m           5Mi
frontend-xxxxxxxxxx-ddddd   1m           5Mi
```

Actual usage is well below our limits — that's normal for idle services. The limits protect against spikes.

---

## 5. Simulating Probe Failures

Let's see what happens when probes fail. We'll exec into a pod and break the health check endpoint.

### Testing liveness probe failure

Find an API pod:

```sh
kubectl get pods -l app=api
```

Exec into it and kill the NGINX process (which serves the health check endpoint):

```sh
kubectl exec -it api-xxxxxxxxxx-aaaaa -- /bin/sh -c "nginx -s stop"
```

Now watch the pods:

```sh
kubectl get pods --watch
```

Within 30 seconds (initialDelay + 3 failures × 10s period), you'll see:

```
api-xxxxxxxxxx-aaaaa   1/1     Running   0          5m
api-xxxxxxxxxx-aaaaa   0/1     Running   1          5m     ← restart count increased
api-xxxxxxxxxx-aaaaa   1/1     Running   1          5m     ← back to healthy
```

Kubernetes detected the liveness probe failure and restarted the container. The **RESTARTS** column incremented from 0 to 1.

### Checking probe events

```sh
kubectl describe pod api-xxxxxxxxxx-aaaaa
```

In the Events section:

```
Events:
  Warning  Unhealthy  30s   kubelet  Liveness probe failed: dial tcp 172.17.0.3:8080: connect: connection refused
  Normal   Killing    10s   kubelet  Container echoserver failed liveness probe, will be restarted
```

This is invaluable for debugging. If your app keeps restarting, the events will tell you exactly which probe failed and why.

---

## 6. Observability: Understanding Your Cluster

Observability means being able to answer the question: **"What is happening inside my system right now?"** In production, you can't SSH into every pod. You need tools.

### The three pillars of observability

```
┌─────────────────────────────────────────────────────┐
│                 Observability                       │
│                                                     │
│  ┌─────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │   Logs      │  │  Metrics   │  │   Traces     │  │
│  │             │  │            │  │              │  │
│  │ "What       │  │ "How much  │  │ "Where did   │  │
│  │  happened?" │  │  of what?" │  │  time go?"   │  │
│  │             │  │            │  │              │  │
│  │ kubectl logs│  │ kubectl top│  │ (Jaeger,     │  │
│  │ (stdout)    │  │ (metrics-  │  │  Zipkin)     │  │
│  │             │  │  server)   │  │              │  │
│  └─────────────┘  └────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────┘
```

We'll focus on logs and metrics — the two you can use right now with Minikube.

### Logs

Kubernetes captures anything containers write to stdout/stderr:

```sh
# Logs from a specific pod
kubectl logs api-xxxxxxxxxx-aaaaa

# Logs from all pods in a deployment
kubectl logs deployment/api

# Follow logs in real time
kubectl logs -f deployment/api

# Logs from the previous container (after a restart)
kubectl logs api-xxxxxxxxxx-aaaaa --previous

# Logs from the last 5 minutes
kubectl logs deployment/api --since=5m

# Logs from all pods with a specific label
kubectl logs -l app=api
```

**`--previous`** is especially useful after a crash — it shows the logs from the container that just died, which often reveals the cause.

### Metrics

With the metrics-server addon enabled:

```sh
# Pod resource usage
kubectl top pods

# Node resource usage
kubectl top node

# Sort by CPU usage
kubectl top pods --sort-by=cpu

# Sort by memory usage
kubectl top pods --sort-by=memory
```

### Events

Cluster-wide event log:

```sh
# All events, sorted by time
kubectl get events --sort-by='.lastTimestamp'

# Events for a specific resource
kubectl get events --field-selector involvedObject.name=api

# Only warnings
kubectl get events --field-selector type=Warning
```

Events show scheduling decisions, probe failures, image pulls, OOM kills — everything that happened in the cluster. They're the first place to look when something goes wrong.

---

## 7. Debugging Workflow

When something goes wrong, follow this systematic approach:

```
Problem: App not working
           │
           ↓
Step 1: kubectl get pods
        → Are pods running? Check STATUS column
           │
           ├── STATUS: CrashLoopBackOff
           │   → kubectl logs <pod> --previous
           │   → App is crashing on startup
           │
           ├── STATUS: ImagePullBackOff
           │   → kubectl describe pod <pod>
           │   → Wrong image name or registry auth issue
           │
           ├── STATUS: Pending
           │   → kubectl describe pod <pod>
           │   → Check events: not enough resources? Node issues?
           │
           └── STATUS: Running but READY: 0/1
               → Readiness probe failing
               → kubectl describe pod <pod> → check Events
           │
           ↓
Step 2: kubectl describe pod <pod>
        → Check Events section for clues
           │
           ↓
Step 3: kubectl logs <pod>
        → Check application logs for errors
           │
           ↓
Step 4: kubectl exec -it <pod> -- /bin/sh
        → Get inside the container to investigate
        → Check files, environment, connectivity
           │
           ↓
Step 5: kubectl get events --sort-by='.lastTimestamp'
        → Check cluster-wide events for patterns
```

### Common issues and fixes

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Pod stuck in `Pending` | Not enough resources on node | Reduce resource requests or add more nodes |
| Pod in `CrashLoopBackOff` | App crashes on startup | Check logs with `--previous` flag |
| Pod `Running` but `0/1 Ready` | Readiness probe failing | Check probe path/port, check app health |
| Pod keeps restarting | Liveness probe failing | Check probe configuration, increase timeouts |
| `OOMKilled` in events | App exceeds memory limit | Increase memory limit or fix memory leak |
| Service has no endpoints | Selector doesn't match pod labels | Compare `kubectl describe svc` selector with pod labels |

---

## 8. Putting It All Together

Let's see our final architecture:

```
Your Mac
   │
   │  curl http://$(minikube ip)/api
   ↓
┌───────────────────────────────────────────────────────────────┐
│  Minikube Cluster                                            │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Ingress Controller (NGINX)                          │    │
│  │  • Routes / → frontend, /api → api                   │    │
│  └────────┬──────────────────────┬──────────────────────┘    │
│           │                      │                           │
│           ↓                      ↓                           │
│  ┌────────────────┐     ┌────────────────┐                   │
│  │ Service:       │     │ Service:       │                   │
│  │ frontend       │     │ api            │                   │
│  │ (ClusterIP)    │     │ (ClusterIP)    │                   │
│  └───┬────────┬───┘     └───┬────────┬───┘                   │
│      ↓        ↓             ↓        ↓                       │
│  ┌───────┐┌───────┐   ┌───────┐┌───────┐                    │
│  │ nginx ││ nginx │   │ echo  ││ echo  │                    │
│  │ Pod 1 ││ Pod 2 │   │ Pod 1 ││ Pod 2 │                    │
│  │       ││       │   │       ││       │                    │
│  │ CPU:  ││ CPU:  │   │ CPU:  ││ CPU:  │                    │
│  │ 50m-  ││ 50m-  │   │ 100m- ││ 100m- │                    │
│  │ 200m  ││ 200m  │   │ 250m  ││ 250m  │                    │
│  │       ││       │   │       ││       │                    │
│  │ Mem:  ││ Mem:  │   │ Mem:  ││ Mem:  │                    │
│  │ 64Mi- ││ 64Mi- │   │ 128Mi-││ 128Mi-│                    │
│  │ 128Mi ││ 128Mi │   │ 256Mi ││ 256Mi │                    │
│  │       ││       │   │       ││       │                    │
│  │ Live: ││ Live: │   │ Live: ││ Live: │                    │
│  │  ✓    ││  ✓    │   │  ✓    ││  ✓    │                    │
│  │ Ready:││ Ready:│   │ Ready:││ Ready:│                    │
│  │  ✓    ││  ✓    │   │  ✓    ││  ✓    │                    │
│  └───────┘└───────┘   └───────┘└───────┘                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  CoreDNS — resolves "api" → Service ClusterIP       │    │
│  │  Metrics Server — collects CPU/memory data          │    │
│  └──────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────┘
```

Every pod has:
- Health checks (liveness and readiness probes)
- Resource boundaries (requests and limits)
- Automatic load balancing (via Services)
- Self-healing (via Deployments and ReplicaSets)
- HTTP routing (via Ingress)
- DNS-based service discovery (via CoreDNS)

---

## 9. Cleanup: Tearing Everything Down

When you're finished with the entire series:

```sh
# Delete all application resources
kubectl delete all --all
kubectl delete configmap --all
kubectl delete ingress --all

# Delete the Minikube cluster entirely
minikube delete
```

This removes everything — the Docker container, all Kubernetes resources, all configuration. To start over, just `minikube start --driver=docker`.

---

## What We've Built Across 10 Parts

Let's look back at the journey:

| Part | What we learned | Key concept |
|------|---------------|------------|
| 1 | What Kubernetes is and why it exists | Containers and orchestration |
| 2 | Setting up Minikube | Nodes, control plane, kubectl |
| 3 | Deploying an app | Pods and Deployments |
| 4 | Making it accessible | Services and NodePort |
| 5 | Infrastructure as code | YAML manifests and declarative configuration |
| 6 | Running multiple copies | Scaling, ReplicaSets, and self-healing |
| 7 | Multiple applications | Labels, selectors, and service isolation |
| 8 | Connecting services | DNS, ConfigMaps, and reverse proxying |
| 9 | Proper HTTP routing | Ingress controllers and routing rules |
| 10 | Production hardening | Probes, resource limits, and observability |

### What you now understand

- **Containers** package applications; **Kubernetes** orchestrates them
- **Pods** are the smallest unit; **Deployments** manage them
- **Services** provide stable networking; **Ingress** provides HTTP routing
- **YAML manifests** are how you declare desired state
- **Labels and selectors** are how resources find each other
- **Probes** tell Kubernetes if your app is actually healthy
- **Resource limits** prevent one app from starving others
- **kubectl** is your primary interface for everything

### Where to go from here

This series gave you the foundations. Here's what to explore next:

**Immediate next steps:**
- **Namespaces** — organise resources by team or environment
- **Secrets** — store sensitive data (passwords, API keys) securely
- **Persistent Volumes** — attach storage that survives pod restarts
- **Helm** — a package manager for Kubernetes (think of it as `brew` for clusters)

**Intermediate topics:**
- **Horizontal Pod Autoscaler** — automatically scale based on load
- **Rolling updates and rollbacks** — deploy new versions with zero downtime
- **Network Policies** — firewall rules between pods
- **RBAC** — role-based access control for cluster users

**Advanced topics:**
- **Service meshes** (Istio, Linkerd) — advanced networking, mTLS, observability
- **Custom Resource Definitions (CRDs)** — extend Kubernetes with your own resource types
- **Operators** — automate complex application lifecycle management
- **GitOps** (ArgoCD, Flux) — deploy by committing to git

You now have the mental model to understand all of these topics. Each one builds on the concepts you've already learned — pods, services, labels, declarative configuration, and the control loop pattern.

The most important thing you've learned isn't any specific command or YAML snippet. It's the **declarative mindset**: describe what you want, let the system figure out how to get there, and trust it to keep things right. That's the core of Kubernetes, and it applies to everything you'll learn next.
