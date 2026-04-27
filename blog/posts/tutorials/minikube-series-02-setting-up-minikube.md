This is Part 2 of a 10-part series on Kubernetes using Minikube. We install the tools and get a working cluster on your Mac.

---

## The Series

1. [What is Kubernetes?](/blog/view.html?slug=minikube-series-01-what-is-kubernetes&folder=tutorials)
2. **Setting Up Your Local Cluster** ← you are here
3. [Your First Deployment](/blog/view.html?slug=minikube-series-03-first-deployment&folder=tutorials)
4. [Exposing Your App](/blog/view.html?slug=minikube-series-04-exposing-your-app&folder=tutorials)
5. [YAML and Declarative Configuration](/blog/view.html?slug=minikube-series-05-yaml-declarative-config&folder=tutorials)
6. [Scaling and Self-Healing](/blog/view.html?slug=minikube-series-06-scaling-and-self-healing&folder=tutorials)
7. [Multi-Service Architecture](/blog/view.html?slug=minikube-series-07-multi-service-architecture&folder=tutorials)
8. [Service-to-Service Communication](/blog/view.html?slug=minikube-series-08-service-to-service-communication&folder=tutorials)
9. [Ingress and HTTP Routing](/blog/view.html?slug=minikube-series-09-ingress-http-routing&folder=tutorials)
10. [Production Readiness](/blog/view.html?slug=minikube-series-10-production-readiness&folder=tutorials)

---

## Introduction

In Part 1, we built a mental model of what Kubernetes is and why it exists. Now it's time to make it real. By the end of this tutorial, you'll have a running Kubernetes cluster on your Mac — entirely local, no cloud account needed.

We'll use **Minikube**, a tool purpose-built for running Kubernetes locally. It creates a single-node cluster inside a Docker container (or a lightweight VM), giving you a fully functional Kubernetes environment to learn with.

---

## Prerequisites

You need a Mac with:
- **macOS 12 (Monterey) or later** (Intel or Apple Silicon both work)
- **Homebrew** installed — if not, install it from [brew.sh](https://brew.sh)
- **Docker Desktop** installed and running — download from [docker.com](https://www.docker.com/products/docker-desktop)

### Verify Docker is running

Open your terminal and run:

```sh
docker ps
```

If Docker is running, you'll see an empty table (or a list of containers). If you see an error like "Cannot connect to the Docker daemon," open Docker Desktop and wait for it to start.

---

## 1. Installing the Tools

We need two things: **Minikube** (creates the cluster) and **kubectl** (talks to the cluster).

### Install Minikube

```sh
brew install minikube
```

Verify the installation:

```sh
minikube version
```

You should see something like:

```
minikube version: v1.34.0
```

### What is Minikube?

Minikube runs a single-node Kubernetes cluster on your local machine. "Single-node" means the control plane and worker run on the same machine — unlike production where they'd be separate.

Think of it like a flight simulator. A real airport has separate terminals, a control tower, and runways. Minikube puts everything into one building. It's not how you'd run an airport for real passengers, but it's perfect for learning how everything works.

```
Your Mac
┌─────────────────────────────────────────────┐
│  Docker Desktop                             │
│  ┌───────────────────────────────────────┐  │
│  │  Minikube Node (Docker Container)     │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │  Control Plane                  │  │  │
│  │  │  (API Server, Scheduler, etcd)  │  │  │
│  │  ├─────────────────────────────────┤  │  │
│  │  │  Worker                         │  │  │
│  │  │  (kubelet, your pods run here)  │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  kubectl ──────────────────→ API Server     │
└─────────────────────────────────────────────┘
```

Everything runs inside a single Docker container on your Mac. Minikube handles all the complexity of setting up Kubernetes inside that container.

### Install kubectl

```sh
brew install kubectl
```

Verify:

```sh
kubectl version --client
```

You should see output showing the client version. (Ignore any "connection refused" warnings — we haven't started the cluster yet.)

### What is kubectl?

`kubectl` (pronounced "kube-control" or "kube-cuddle" — the community can't agree) is the command-line tool for interacting with Kubernetes. Every time you want to deploy an app, check status, or inspect your cluster, you'll use `kubectl`.

It communicates with the **API Server** inside your cluster. Think of it as a remote control — you press buttons, and the cluster responds.

The pattern for most `kubectl` commands is:

```
kubectl <verb> <resource> [options]
```

For example:
- `kubectl get pods` — list all pods
- `kubectl describe node minikube` — show details about a node
- `kubectl delete deployment my-app` — remove a deployment

---

## 2. Starting Your Cluster

Now let's create the cluster:

```sh
minikube start --driver=docker
```

### What this does

This single command triggers a chain of events:

```
1. Minikube checks Docker is available
                ↓
2. Downloads a Kubernetes node image (first time only)
                ↓
3. Creates a Docker container named "minikube"
                ↓
4. Installs Kubernetes inside that container
                ↓
5. Starts the control plane components:
   - API Server
   - Scheduler
   - Controller Manager
   - etcd
                ↓
6. Configures kubectl to point at this cluster
                ↓
7. Cluster is ready
```

**`--driver=docker`** tells Minikube to use Docker as the virtualisation layer. On macOS, this is the most reliable option. Minikube supports other drivers (VirtualBox, HyperKit, QEMU), but Docker integrates best with Docker Desktop.

The first start takes a few minutes because Minikube needs to download the Kubernetes node image (~400MB). Subsequent starts are much faster because the image is cached.

You'll see output like:

```
😄  minikube v1.34.0 on Darwin (arm64)
✨  Using the docker driver based on user configuration
📌  Using Docker Desktop driver with root privileges
👍  Starting "minikube" primary control-plane node in "minikube" cluster
🚜  Pulling base image v0.0.45 ...
🔥  Creating docker container (CPUs=2, Memory=4096MB) ...
🐳  Preparing Kubernetes v1.31.0 on Docker 27.2.0 ...
🔎  Verifying Kubernetes components...
🌟  Enabled addons: storage-provisioner, default-storageclass
🏄  Done! kubectl is now configured to use "minikube" cluster
```

---

## 3. Verifying Your Cluster

### Check the node

```sh
kubectl get nodes
```

You should see:

```
NAME       STATUS   ROLES           AGE   VERSION
minikube   Ready    control-plane   1m    v1.31.0
```

**Breaking this down:**
- **NAME:** `minikube` — the name of our single node
- **STATUS:** `Ready` — the node is healthy and can accept pods
- **ROLES:** `control-plane` — this node runs both the control plane and workloads (because it's a single-node cluster)
- **AGE:** How long since the node joined the cluster
- **VERSION:** The Kubernetes version running on this node

### Explore the cluster info

```sh
kubectl cluster-info
```

This shows you where the API server is running:

```
Kubernetes control plane is running at https://127.0.0.1:XXXXX
CoreDNS is running at https://127.0.0.1:XXXXX/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy
```

**CoreDNS** is the built-in DNS service for Kubernetes. It allows pods to find each other by name instead of IP address. We'll see this in action in Part 8.

### Look at the Docker container

Since we used the Docker driver, our Kubernetes node is actually a Docker container:

```sh
docker ps --filter "name=minikube"
```

You'll see something like:

```
CONTAINER ID   IMAGE                    STATUS    PORTS                         NAMES
abc123def456   gcr.io/k8s-minikube/..   Up 5m     127.0.0.1:XXXXX->8443/tcp    minikube
```

This confirms that the entire Kubernetes cluster is running inside a single Docker container. The port mapping (e.g., `127.0.0.1:XXXXX->8443/tcp`) is how `kubectl` on your Mac reaches the API server inside the container.

---

## 4. Understanding What's Already Running

Even though we haven't deployed anything yet, Kubernetes has its own system pods running. Let's look:

```sh
kubectl get pods --all-namespaces
```

You'll see something like:

```
NAMESPACE     NAME                               READY   STATUS    RESTARTS   AGE
kube-system   coredns-xxxxxxxxxx-xxxxx           1/1     Running   0          5m
kube-system   etcd-minikube                      1/1     Running   0          5m
kube-system   kube-apiserver-minikube            1/1     Running   0          5m
kube-system   kube-controller-manager-minikube   1/1     Running   0          5m
kube-system   kube-proxy-xxxxx                   1/1     Running   0          5m
kube-system   kube-scheduler-minikube            1/1     Running   0          5m
kube-system   storage-provisioner                1/1     Running   0          5m
```

**These are the Kubernetes control plane components** from Part 1, running as pods inside the cluster. Let's match them:

| Pod | Role | What it does |
|-----|------|-------------|
| `kube-apiserver` | API Server | Handles all API requests (from `kubectl`, from other components) |
| `kube-scheduler` | Scheduler | Decides which node runs new pods |
| `kube-controller-manager` | Controller Manager | Watches for state drift and corrects it |
| `etcd` | State store | Stores all cluster data (configuration, state) |
| `coredns` | DNS | Lets pods find each other by name |
| `kube-proxy` | Network proxy | Manages network rules for pod-to-pod communication |
| `storage-provisioner` | Storage | Minikube addon for local persistent storage |

**`--all-namespaces`** shows pods in every namespace. These system pods live in the `kube-system` namespace — a reserved space for Kubernetes internals. Your application pods will go in the `default` namespace (unless you specify otherwise).

### What are namespaces?

Namespaces are a way to divide a cluster into virtual sub-clusters. They're like folders on your computer — they organise resources and prevent name collisions.

```sh
kubectl get namespaces
```

```
NAME              STATUS   AGE
default           Active   5m
kube-node-lease   Active   5m
kube-public       Active   5m
kube-system       Active   5m
```

- **default** — where your stuff goes unless you say otherwise
- **kube-system** — Kubernetes internals (don't touch)
- **kube-public** — readable by everyone (rarely used)
- **kube-node-lease** — node heartbeats (internal bookkeeping)

For this series, we'll use the `default` namespace.

---

## 5. The Minikube Dashboard (Optional)

Minikube ships with a web-based dashboard that gives you a visual overview of your cluster:

```sh
minikube dashboard
```

This opens your browser with a graphical interface showing nodes, pods, deployments, and more. It's useful for visual learners and quick checks, but everything we do in this series can be done with `kubectl` on the command line.

Press `Ctrl+C` in your terminal to stop the dashboard when you're done.

---

## 6. Essential Minikube Commands

Here are the commands you'll use throughout this series:

### Cluster lifecycle

```sh
# Start the cluster
minikube start --driver=docker

# Stop the cluster (preserves state)
minikube stop

# Delete the cluster entirely
minikube delete

# Check cluster status
minikube status
```

**`minikube stop`** pauses the cluster. Your deployments, services, and configuration are preserved. When you `minikube start` again, everything comes back exactly as you left it. Think of it as putting your computer to sleep rather than shutting it down.

**`minikube delete`** destroys everything — the node, all pods, all configuration. Use this when you want a clean slate.

### Useful information

```sh
# Show Minikube IP address
minikube ip

# SSH into the Minikube node (for debugging)
minikube ssh

# Check Minikube logs
minikube logs
```

**`minikube ip`** returns the IP address of the Minikube node. This is useful later when we need to access services. Since we're using the Docker driver, this will typically be `192.168.49.2` or similar.

**`minikube ssh`** drops you into a shell inside the Minikube Docker container. You'd use this to debug low-level issues — inspecting the filesystem, checking processes, etc. Type `exit` to leave.

---

## 7. Troubleshooting

### "minikube start" hangs or fails

**Docker not running:**
```sh
docker ps
# If you see "Cannot connect to the Docker daemon"
# → Open Docker Desktop and wait for it to start
```

**Not enough resources:**
Minikube needs at least 2 CPUs and 2GB of RAM. Docker Desktop may have lower limits. Check: Docker Desktop → Settings → Resources → set CPUs ≥ 2 and Memory ≥ 4GB.

**Stale state:**
If things go wrong and you want a fresh start:
```sh
minikube delete
minikube start --driver=docker
```

### kubectl can't connect

If `kubectl get nodes` returns "The connection to the server was refused":

```sh
# Check if Minikube is running
minikube status

# If it says "Stopped", start it
minikube start --driver=docker
```

### Port conflicts

If you see errors about ports being in use, another process might be using the ports Minikube needs. Check with:

```sh
lsof -i :8443
```

---

## What Problem Did We Just Solve?

We now have a **fully functional Kubernetes cluster** running on your Mac. Specifically:

- A **single-node cluster** running inside Docker
- The **control plane** (API server, scheduler, controller manager, etcd) is running
- **kubectl** is configured to talk to it
- We can deploy applications to it (which we'll do next)

This is equivalent to having a Kubernetes cluster in the cloud — but completely free, completely local, and completely under your control.

### What would break in production?

Our local cluster is great for learning, but it differs from production in important ways:

- **Single node** — production clusters have multiple nodes for redundancy. If our one node goes down, everything goes down.
- **No persistent storage** — when you delete the cluster, all data is gone. Production clusters use networked storage that survives node failures.
- **No high availability** — production runs multiple copies of the control plane. We have one.
- **No real networking** — production clusters are accessible from the internet. Ours is only accessible from your Mac.

None of this matters for learning. The Kubernetes APIs and concepts are identical.

---

## What's Next?

Your cluster is running but empty. In **Part 3**, we'll deploy your first application — a simple web server that responds with "Hello World." You'll learn about **Pods** and **Deployments**, the core building blocks of everything you run on Kubernetes.
