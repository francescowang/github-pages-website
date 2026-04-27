This is Part 7 of a 10-part series on Kubernetes using Minikube. We deploy a second application and build a multi-service architecture.

---

## The Series

1. [What is Kubernetes?](/blog/view.html?slug=minikube-series-01-01-what-is-kubernetes&folder=tutorials)
2. [Setting Up Your Local Cluster](/blog/view.html?slug=minikube-series-01-02-setting-up-minikube&folder=tutorials)
3. [Your First Deployment](/blog/view.html?slug=minikube-series-01-03-first-deployment&folder=tutorials)
4. [Exposing Your App](/blog/view.html?slug=minikube-series-01-04-exposing-your-app&folder=tutorials)
5. [YAML and Declarative Configuration](/blog/view.html?slug=minikube-series-01-05-yaml-declarative-config&folder=tutorials)
6. [Scaling and Self-Healing](/blog/view.html?slug=minikube-series-01-06-scaling-and-self-healing&folder=tutorials)
7. **Multi-Service Architecture** ← you are here
8. [Service-to-Service Communication](/blog/view.html?slug=minikube-series-01-08-service-to-service-communication&folder=tutorials)
9. [Ingress and HTTP Routing](/blog/view.html?slug=minikube-series-01-09-ingress-http-routing&folder=tutorials)
10. [Production Readiness](/blog/view.html?slug=minikube-series-01-10-production-readiness&folder=tutorials)

---

## Introduction

So far, we've worked with a single application — one Deployment, one Service. But real-world systems are rarely just one app. They're composed of **multiple services** that each handle a specific responsibility: a frontend, an API, a database, a cache.

In this part, we'll deploy a second application alongside our echoserver and see how Kubernetes isolates them while letting them coexist on the same cluster. This is the beginning of **microservices architecture**.

---

## Prerequisites

- Minikube running
- Clean slate recommended:

```sh
kubectl delete all --all
```

---

## 1. What is a Microservices Architecture?

In a **monolithic** architecture, everything runs in one big application. In a **microservices** architecture, you split your system into small, independent services that communicate over the network:

```
Monolith                          Microservices
┌──────────────────────┐         ┌────────────┐  ┌────────────┐
│                      │         │  Frontend  │  │    API      │
│  Frontend            │         │  (nginx)   │  │ (echoserver)│
│  API                 │         └─────┬──────┘  └──────┬─────┘
│  Business Logic      │               │                │
│  Database Access     │         ┌─────┴──────┐  ┌──────┴─────┐
│                      │         │  Service A │  │  Service B │
└──────────────────────┘         └────────────┘  └────────────┘
```

**Why microservices?**
- **Independent scaling** — the frontend might need 10 replicas while the API only needs 3
- **Independent deployment** — update the API without touching the frontend
- **Fault isolation** — if the API crashes, the frontend can still serve cached pages
- **Technology flexibility** — each service can use different languages or frameworks

**Why not microservices?**
- More complexity — networking, debugging, and deployment all get harder
- Not worth it for small applications
- Requires good tooling — which is exactly what Kubernetes provides

Kubernetes was designed for microservices. Each service gets its own Deployment, its own Service, and its own scaling rules. Let's build this.

---

## 2. Deploying the First App: Echoserver (API)

Let's think of our echoserver as a simple API service. Create `~/k8s-tutorial/api.yaml`:

```yaml
# api.yaml — our "API" service
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  labels:
    app: api
    tier: backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
        tier: backend
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
  name: api
  labels:
    app: api
    tier: backend
spec:
  type: ClusterIP
  selector:
    app: api
  ports:
  - port: 8080
    targetPort: 8080
    protocol: TCP
```

### What's different from before?

**Meaningful names:** Instead of `hello-world`, we're using `api` — a name that describes the service's role.

**Extra labels:** We've added `tier: backend`. Labels can have multiple key-value pairs. This lets us organise resources by both application (`app: api`) and architectural tier (`tier: backend`).

**ClusterIP type:** Notice we're using `ClusterIP` instead of `NodePort`. This Service is only accessible from inside the cluster. The API shouldn't be directly exposed to the outside world — that's the frontend's job.

---

## 3. Deploying the Second App: Nginx (Frontend)

Now let's deploy NGINX as our "frontend." Create `~/k8s-tutorial/frontend.yaml`:

```yaml
# frontend.yaml — our "frontend" service
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  labels:
    app: frontend
    tier: frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
        tier: frontend
    spec:
      containers:
      - name: nginx
        image: nginx:alpine
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: frontend
  labels:
    app: frontend
    tier: frontend
spec:
  type: NodePort
  selector:
    app: frontend
  ports:
  - port: 80
    targetPort: 80
    protocol: TCP
```

### Key differences from the API

**Different image:** `nginx:alpine` — a minimal NGINX web server. The `:alpine` tag means it's built on Alpine Linux, making the image very small (~7MB vs ~140MB for the full NGINX image).

**Different port:** NGINX listens on port 80 by default, while echoserver listens on 8080.

**NodePort type:** The frontend is the public-facing service, so we expose it via NodePort. In production, this would be behind a load balancer.

---

## 4. Deploy Both Applications

```sh
kubectl apply -f ~/k8s-tutorial/api.yaml
kubectl apply -f ~/k8s-tutorial/frontend.yaml
```

Or apply the whole directory:

```sh
kubectl apply -f ~/k8s-tutorial/
```

### Verify everything is running

```sh
kubectl get all
```

```
NAME                            READY   STATUS    RESTARTS   AGE
pod/api-xxxxxxxxxx-aaaaa        1/1     Running   0          30s
pod/api-xxxxxxxxxx-bbbbb        1/1     Running   0          30s
pod/frontend-xxxxxxxxxx-ccccc   1/1     Running   0          30s
pod/frontend-xxxxxxxxxx-ddddd   1/1     Running   0          30s

NAME                 TYPE        CLUSTER-IP       PORT(S)        AGE
service/api          ClusterIP   10.96.xxx.xxx    8080/TCP       30s
service/frontend     NodePort    10.96.yyy.yyy    80:3XXXX/TCP   30s
service/kubernetes   ClusterIP   10.96.0.1        443/TCP        1h

NAME                       READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/api        2/2     2            2           30s
deployment.apps/frontend   2/2     2            2           30s
```

Four pods (2 per service), two Services, two Deployments. Each application is completely independent.

### Access the frontend

```sh
minikube service frontend --url
```

```sh
curl $(minikube service frontend --url)
```

You'll see the default NGINX welcome page. The frontend is accessible from your Mac. The API, being ClusterIP, is not directly accessible — only other pods can reach it.

---

## 5. Service Isolation

Each Service routes traffic only to pods matching its selector. Let's verify this:

```sh
kubectl describe service api
```

```
Selector:   app=api
Endpoints:  172.17.0.3:8080, 172.17.0.4:8080
```

```sh
kubectl describe service frontend
```

```
Selector:   app=frontend
Endpoints:  172.17.0.5:80, 172.17.0.6:80
```

Different selectors, different endpoints. The `api` Service only routes to `api` pods. The `frontend` Service only routes to `frontend` pods. They're completely isolated.

```
                      Kubernetes Cluster
                      ┌─────────────────────────────────────┐
                      │                                     │
  Your Mac            │  Service: frontend (NodePort)       │
  ┌────────┐          │  selector: app=frontend             │
  │ Browser│─────────→│  ┌──────┐  ┌──────┐                │
  └────────┘          │  │ nginx│  │ nginx│                │
                      │  │ Pod 1│  │ Pod 2│                │
                      │  └──────┘  └──────┘                │
                      │                                     │
                      │  Service: api (ClusterIP)           │
                      │  selector: app=api                  │
                      │  ┌──────────┐  ┌──────────┐        │
                      │  │echoserver│  │echoserver│        │
                      │  │  Pod 1   │  │  Pod 2   │        │
                      │  └──────────┘  └──────────┘        │
                      │                                     │
                      └─────────────────────────────────────┘
```

---

## 6. Using Labels to Organise Resources

We added `tier` labels to our resources. Let's use them.

### Filter by label

```sh
# Show only backend pods
kubectl get pods -l tier=backend
```

```
NAME                   READY   STATUS    RESTARTS   AGE
api-xxxxxxxxxx-aaaaa   1/1     Running   0          5m
api-xxxxxxxxxx-bbbbb   1/1     Running   0          5m
```

```sh
# Show only frontend pods
kubectl get pods -l tier=frontend
```

```
NAME                        READY   STATUS    RESTARTS   AGE
frontend-xxxxxxxxxx-ccccc   1/1     Running   0          5m
frontend-xxxxxxxxxx-ddddd   1/1     Running   0          5m
```

### Multiple label selectors

```sh
# Pods that are both "api" AND "backend"
kubectl get pods -l app=api,tier=backend
```

### Show all labels

```sh
kubectl get pods --show-labels
```

```
NAME                        READY   STATUS    LABELS
api-xxxxxxxxxx-aaaaa        1/1     Running   app=api,tier=backend,...
api-xxxxxxxxxx-bbbbb        1/1     Running   app=api,tier=backend,...
frontend-xxxxxxxxxx-ccccc   1/1     Running   app=frontend,tier=frontend,...
frontend-xxxxxxxxxx-ddddd   1/1     Running   app=frontend,tier=frontend,...
```

Labels are the primary way Kubernetes resources find and relate to each other. Use them liberally:

- `app` — which application (api, frontend, worker)
- `tier` — architectural layer (frontend, backend, database)
- `version` — application version (v1, v2, canary)
- `environment` — deployment environment (dev, staging, prod)

---

## 7. Scaling Services Independently

One of the key benefits of a multi-service architecture: each service scales independently.

Let's say the frontend is getting lots of traffic but the API is fine:

```sh
kubectl scale deployment frontend --replicas=4
```

```sh
kubectl get pods -l tier=frontend
```

```
NAME                        READY   STATUS    RESTARTS   AGE
frontend-xxxxxxxxxx-ccccc   1/1     Running   0          10m
frontend-xxxxxxxxxx-ddddd   1/1     Running   0          10m
frontend-xxxxxxxxxx-eeeee   1/1     Running   0          5s
frontend-xxxxxxxxxx-fffff   1/1     Running   0          5s
```

Four frontend pods, still two API pods. Each service has its own replica count, managed by its own Deployment.

```sh
kubectl get deployments
```

```
NAME       READY   UP-TO-DATE   AVAILABLE   AGE
api        2/2     2            2           10m
frontend   4/4     4            4           10m
```

Scale back down:

```sh
kubectl scale deployment frontend --replicas=2
```

---

## 8. Verifying Pod Isolation

Let's prove that the pods from each service are truly isolated. We'll exec into a frontend pod and check what we can see.

Find a frontend pod:

```sh
kubectl get pods -l app=frontend
```

Exec into it:

```sh
kubectl exec -it frontend-xxxxxxxxxx-ccccc -- /bin/sh
```

Now you're inside the NGINX container. Let's see what's running:

```sh
# What processes are running?
ps aux
```

You'll see only NGINX processes — nothing from the API. Each container is isolated at the process level.

```sh
# What's the container's hostname?
hostname
```

It'll show the pod name. Each pod has its own network identity.

```sh
# Can we reach the API service from inside the cluster?
wget -qO- http://api:8080
```

You should see the echoserver response. Even though the API Service is ClusterIP (not accessible from your Mac), it *is* accessible from other pods in the cluster. The DNS name `api` resolves to the API Service's ClusterIP.

Type `exit` to leave the container.

This is a preview of Part 8 — service-to-service communication using Kubernetes DNS.

---

## 9. Managing Multiple Applications

As your cluster grows, keeping track of everything gets harder. Here are some organisational strategies:

### Directory structure

```
k8s-tutorial/
├── api.yaml              # API deployment + service
├── frontend.yaml         # Frontend deployment + service
└── (future services)
```

### View everything at once

```sh
# All resources in the default namespace
kubectl get all

# Just deployments
kubectl get deployments

# Just services
kubectl get services

# Filter by tier
kubectl get all -l tier=backend
kubectl get all -l tier=frontend
```

### Delete by label

You can delete all resources matching a label:

```sh
# Delete everything with tier=backend
kubectl delete all -l tier=backend
```

This deletes the Deployment, ReplicaSet, pods, and Service for the API — all in one command. Much cleaner than deleting resources one by one.

---

## What Problem Did We Just Solve?

We deployed two independent applications on the same cluster and learned how Kubernetes keeps them separate:

1. **Separate Deployments** — each app scales and updates independently
2. **Separate Services** — each app has its own stable network identity
3. **Label-based organisation** — labels let us group, filter, and manage related resources
4. **Service isolation** — different selectors prevent traffic from crossing between services

This is the foundation of microservices on Kubernetes. Each service is a self-contained unit that can be developed, deployed, and scaled by a separate team.

### What would break in production?

- Our services can **talk to each other** (as we proved with `wget` from inside the frontend pod), but they're not actually configured to do so. In Part 8, we'll set up proper service-to-service communication.
- There's no **network policy** — every pod can reach every other pod. In production, you'd restrict which services can communicate with which using NetworkPolicies.
- We're using the **default namespace** for everything. In production, you'd separate services (or environments) into different namespaces for better isolation and access control.

---

## What's Next?

In **Part 8**, we'll make our services actually talk to each other. We'll configure the frontend to proxy requests to the API using Kubernetes DNS — the internal name resolution system that lets pods find each other by service name instead of IP address. This is where the microservices architecture truly comes alive.
