This is Part 4 of a 10-part series on Kubernetes using Minikube. We learn about Services and make our app accessible from outside the cluster.

---

## The Series

1. [What is Kubernetes?](/blog/view.html?slug=minikube-series-01-what-is-kubernetes&folder=tutorials)
2. [Setting Up Your Local Cluster](/blog/view.html?slug=minikube-series-02-setting-up-minikube&folder=tutorials)
3. [Your First Deployment](/blog/view.html?slug=minikube-series-03-first-deployment&folder=tutorials)
4. **Exposing Your App** ← you are here
5. [YAML and Declarative Configuration](/blog/view.html?slug=minikube-series-05-yaml-declarative-config&folder=tutorials)
6. [Scaling and Self-Healing](/blog/view.html?slug=minikube-series-06-scaling-and-self-healing&folder=tutorials)
7. [Multi-Service Architecture](/blog/view.html?slug=minikube-series-07-multi-service-architecture&folder=tutorials)
8. [Service-to-Service Communication](/blog/view.html?slug=minikube-series-08-service-to-service-communication&folder=tutorials)
9. [Ingress and HTTP Routing](/blog/view.html?slug=minikube-series-09-ingress-http-routing&folder=tutorials)
10. [Production Readiness](/blog/view.html?slug=minikube-series-10-production-readiness&folder=tutorials)

---

## Introduction

In Part 3, we deployed an application — but it's trapped inside the cluster. If you tried to open it in your browser right now, you'd get nothing. The pod has an internal IP address that only other pods can reach.

This is where **Services** come in. A Service gives your pods a stable network identity and — crucially — can expose them to the outside world. By the end of this part, you'll be able to access your app from your Mac's browser.

---

## Prerequisites

- Minikube running with the `hello-world` deployment from Part 3
- If you need to recreate it:

```sh
minikube start --driver=docker
kubectl create deployment hello-world --image=registry.k8s.io/echoserver:1.10
```

---

## 1. The Networking Problem

Let's see why we can't just access our pod directly:

```sh
kubectl get pods -o wide
```

```
NAME                           READY   STATUS    RESTARTS   AGE   IP           NODE
hello-world-xxxxxxxxxx-xxxxx   1/1     Running   0          10m   172.17.0.3   minikube
```

The pod has IP `172.17.0.3`. This is an **internal cluster IP** — it only exists inside Kubernetes' virtual network. Your Mac has no route to this network.

But even if you could reach it, there's a bigger problem: **pod IPs are ephemeral**. Remember in Part 3 when we deleted a pod and a new one appeared? The new pod gets a *different* IP. Any client relying on the old IP would break.

```
Before pod restart:          After pod restart:
┌──────────────┐             ┌──────────────┐
│ Pod (v1)     │             │ Pod (v2)     │
│ IP: 172.17.0.3│            │ IP: 172.17.0.5│  ← different!
└──────────────┘             └──────────────┘
```

We need something with a **stable address** that always knows where the current pods are. That's a Service.

---

## 2. What is a Service?

A **Service** is a stable network abstraction that sits in front of one or more pods. It has a fixed IP address and DNS name that never change, even as the pods behind it come and go.

Think of it like a company's main reception desk. Employees (pods) might change offices, go on holiday, or leave entirely — but the reception desk's phone number (Service IP) never changes. When you call reception, they route you to the right person.

```
Clients                Service               Pods
┌────────┐         ┌──────────────┐      ┌──────────────┐
│ Request│────────→│ hello-world  │─────→│ Pod A        │
└────────┘         │ IP: 10.96.x │      │ 172.17.0.3   │
                   │ Port: 8080  │      └──────────────┘
                   │             │      ┌──────────────┐
                   │             │─────→│ Pod B        │
                   │             │      │ 172.17.0.5   │
                   └──────────────┘      └──────────────┘
                   Stable address        Ephemeral addresses
```

### How does a Service find its pods?

Services use **label selectors**. When we created the deployment with `kubectl create deployment hello-world`, Kubernetes automatically added the label `app=hello-world` to every pod. A Service targeting `app=hello-world` will find all pods with that label.

Let's verify the labels on our pod:

```sh
kubectl get pods --show-labels
```

```
NAME                           READY   STATUS    LABELS
hello-world-xxxxxxxxxx-xxxxx   1/1     Running   app=hello-world,pod-template-hash=xxxxxxxxxx
```

There it is — `app=hello-world`. The Service will use this label to discover pods.

---

## 3. Service Types

Kubernetes has several Service types. Here are the ones that matter:

| Type | What it does | Accessible from |
|------|-------------|----------------|
| **ClusterIP** | Internal-only IP | Inside the cluster only |
| **NodePort** | Opens a port on every node | Your Mac (via the node's IP) |
| **LoadBalancer** | Provisions an external load balancer | The internet (cloud only) |

For local development with Minikube, we'll use **NodePort**. It opens a port on the Minikube node that forwards traffic to your pods.

```
Your Mac                  Minikube Node                Cluster Network
┌──────────────┐         ┌──────────────────────┐     ┌──────────────┐
│              │         │                      │     │              │
│  Browser     │────────→│  NodePort (30XXX)    │────→│  Service     │────→ Pod
│  :30XXX      │         │  on every node       │     │  (ClusterIP) │
│              │         │                      │     │              │
└──────────────┘         └──────────────────────┘     └──────────────┘
```

**ClusterIP** is the default — it gives the Service an internal-only address. Other pods can reach it, but nothing outside the cluster can.

**NodePort** builds on top of ClusterIP. It opens a port (in the range 30000–32767) on the node itself, making it accessible from outside.

**LoadBalancer** is what you'd use in the cloud (AWS, GCP, Azure). It provisions a real load balancer with a public IP. On Minikube, this doesn't work natively — we'd need the `minikube tunnel` command (more on this later).

---

## 4. Creating a NodePort Service

Let's expose our deployment:

```sh
kubectl expose deployment hello-world --type=NodePort --port=8080
```

**Breaking this down:**
- `kubectl expose` — create a Service for an existing resource
- `deployment hello-world` — target the hello-world Deployment
- `--type=NodePort` — make it accessible from outside the cluster
- `--port=8080` — the port the Service listens on internally (the echoserver listens on port 8080)

### Verify the Service was created

```sh
kubectl get services
```

```
NAME          TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)          AGE
hello-world   NodePort    10.96.xxx.xxx   <none>        8080:3XXXX/TCP   5s
kubernetes    ClusterIP   10.96.0.1       <none>        443/TCP          30m
```

**Breaking this down:**

- **CLUSTER-IP (10.96.xxx.xxx)** — the stable internal IP assigned to this Service. Other pods can reach the Service at this IP.
- **PORT(S) (8080:3XXXX/TCP)** — two ports. `8080` is the internal Service port. `3XXXX` is the NodePort — the port opened on the Minikube node that maps to the Service.
- **kubernetes** — a built-in Service that exposes the API server. It's always there.

The NodePort (e.g., `31234`) is randomly assigned from the range 30000–32767. Yours will be different from mine.

---

## 5. Accessing Your App

Now the exciting part — actually reaching your app from your Mac.

### Using minikube service

Minikube has a helpful command that opens the Service in your browser:

```sh
minikube service hello-world
```

This does two things:
1. Looks up the Minikube node's IP and the Service's NodePort
2. Opens `http://<minikube-ip>:<node-port>` in your browser

You should see the echoserver response — a page showing details about your HTTP request (headers, method, URI, etc.).

### Manual access

If you prefer to construct the URL yourself:

```sh
# Get the URL
minikube service hello-world --url
```

This prints something like:
```
http://192.168.49.2:31234
```

You can then `curl` it:

```sh
curl $(minikube service hello-world --url)
```

You'll see output like:

```
Hostname: hello-world-xxxxxxxxxx-xxxxx

Pod Information:
    -no pod information available-

Server values:
    server_version=nginx: 1.13.3

Request Information:
    client_address=172.17.0.1
    method=GET
    real path=/
    ...
```

The **Hostname** field shows the pod name that handled your request. This becomes very useful when we have multiple replicas in Part 6 — you'll see different pod names as the Service load-balances between them.

### How the request flows

```
1. Your browser sends request to 192.168.49.2:31234
                    ↓
2. The Minikube node receives it on port 31234 (NodePort)
                    ↓
3. kube-proxy on the node forwards it to the Service
   (ClusterIP 10.96.xxx.xxx:8080)
                    ↓
4. The Service looks up pods with label app=hello-world
                    ↓
5. The Service forwards the request to a pod's IP:port
   (172.17.0.3:8080)
                    ↓
6. The echoserver container handles the request
                    ↓
7. Response travels back the same path
```

---

## 6. An Alternative: kubectl port-forward

There's another way to access pods and services — **port-forwarding**. This creates a direct tunnel from your Mac to a resource in the cluster:

```sh
kubectl port-forward service/hello-world 9090:8080
```

**What this does:**
- Creates a tunnel: your Mac's port `9090` → Service's port `8080`
- Only works while the command is running
- No NodePort needed

In a separate terminal:
```sh
curl http://localhost:9090
```

**When to use which:**

| Method | How it works | When to use |
|--------|-------------|-------------|
| **NodePort** | Opens a port on the node | Persistent access, multiple users |
| **port-forward** | Creates a temporary tunnel | Quick debugging, one-off access |
| **minikube service** | Shortcut for NodePort URL | Convenience when using Minikube |

Port-forward is useful for quick tests but isn't how you'd expose services in production. NodePort is closer to the real thing, and Ingress (Part 9) is even closer.

Press `Ctrl+C` to stop the port-forward.

---

## 7. Inspecting the Service

Let's look at our Service in detail:

```sh
kubectl describe service hello-world
```

Key sections:

```
Name:                     hello-world
Type:                     NodePort
IP:                       10.96.xxx.xxx
Port:                     <unset>  8080/TCP
TargetPort:               8080/TCP
NodePort:                 <unset>  3XXXX/TCP
Endpoints:                172.17.0.3:8080
Selector:                 app=hello-world
```

**Endpoints** is the most important field. It lists the actual pod IPs that the Service routes to. Right now there's one endpoint because we have one pod. When we scale to multiple replicas in Part 6, more endpoints will appear here.

**Selector** shows the label selector — `app=hello-world`. The Service continuously watches for pods matching this label and updates its endpoint list automatically.

### Labels and selectors: the glue

This is a core Kubernetes pattern worth understanding deeply. Resources are connected not by explicit references, but by **labels and selectors**:

```
Deployment                    Service
┌────────────────────┐       ┌────────────────────┐
│ template:          │       │ selector:          │
│   labels:          │       │   app: hello-world │
│     app: hello-world│      └─────────┬──────────┘
└─────────┬──────────┘                 │
          │                            │
          │ creates pods with          │ finds pods with
          │ label app=hello-world      │ label app=hello-world
          ↓                            ↓
     ┌──────────────────────────────────────┐
     │  Pod (labels: app=hello-world)       │
     │  ← both the Deployment AND Service   │
     │     find this pod via its labels     │
     └──────────────────────────────────────┘
```

The Deployment and Service don't know about each other directly. They both independently find the same pods using labels. This loose coupling is powerful — you can create a Service before or after the Deployment, and they'll connect automatically.

---

## 8. Cleanup (Optional)

If you want a clean slate before Part 5:

```sh
kubectl delete service hello-world
kubectl delete deployment hello-world
```

Or keep everything running — Part 5 will rebuild from scratch using YAML files.

---

## What Problem Did We Just Solve?

We solved two problems:

1. **Stable addressing** — pods have ephemeral IPs that change on every restart. A Service provides a fixed IP and DNS name that always routes to the current pods.
2. **External access** — pods live inside the cluster's internal network. A NodePort Service opens a port on the node, making the app accessible from your Mac.

### What would break in production?

- **NodePort** is not how you'd expose apps in production. The port range (30000–32767) is awkward, and you'd need to know the node's IP. In production, you'd use a **LoadBalancer** Service (in the cloud) or an **Ingress** (which we'll set up in Part 9).
- We're accessing the app via an IP address. Real users need a domain name and proper HTTP routing — also solved by Ingress.
- With only one pod, there's no **load balancing** happening yet. We'll fix that when we scale in Part 6.

---

## What's Next?

So far, we've been using `kubectl` commands to create everything. This works for quick experiments, but it has a problem: **commands are ephemeral**. If you delete your cluster and start again, you'd need to remember every command you ran.

In **Part 5**, we'll switch to **YAML files** — the real way to define Kubernetes resources. This is the most important transition in the series: from "running commands" to "writing infrastructure as code."
