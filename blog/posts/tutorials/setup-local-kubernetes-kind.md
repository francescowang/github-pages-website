KinD (Kubernetes in Docker) is one of the most efficient tools for local Kubernetes development. Unlike Minikube, which often requires a dedicated VM, KinD runs each cluster node as a Docker container, making it incredibly fast to spin up and tear down.

In this tutorial, we will build a production-like multi-node cluster and configure it for local ingress testing.

## Prerequisites

### What you need:
- **Docker:** A containerisation platform. On macOS, Docker Desktop wraps Docker in a lightweight VM so containers can run. When you run `docker run`, Docker creates and manages isolated environments.
- **kubectl:** The Kubernetes command-line client. Think of it as SSH for your cluster—it sends commands to the control plane and retrieves information.
- **kind:** A tool that spins up Kubernetes clusters using Docker containers as nodes. Instead of VMs, each "node" is just a container.

Install them with:
```sh
# Install kind
brew install kind

# Install kubectl (if not already installed)
brew install kubectl

# Verify Docker is running
docker ps
```

---

## 1. Defining a Multi-Node Topology

### What is a cluster topology?
A Kubernetes cluster has two types of nodes:
- **Control Plane:** Runs the Kubernetes API server and scheduler. This is the "brain" that decides where pods go and how to route traffic.
- **Worker Nodes:** Run your actual application containers (pods). They execute commands from the control plane.

By default, KinD creates a single-node cluster (control plane only). For a realistic setup, we'll define one control plane and two workers:

```sh
┌─────────────────────────────────────┐
│      Kubernetes Cluster             │
├─────────────────────────────────────┤
│  ┌──────────────────────────────┐   │
│  │   Control Plane (Node)       │   │
│  │  - API Server                │   │
│  │  - Scheduler                 │   │
│  │  - Ingress Ready Label       │   │
│  │  - Ports: 8080, 8443         │   │
│  └──────────────────────────────┘   │
│                                     │
│  ┌──────────────────┐               │
│  │   Worker Node 1  │               │
│  │  - Runs Pods     │               │
│  └──────────────────┘               │
│                                     │
│  ┌──────────────────┐               │
│  │   Worker Node 2  │               │
│  │  - Runs Pods     │               │
│  └──────────────────┘               │
└─────────────────────────────────────┘
```

All three nodes run as Docker containers on your Mac.

### Creating the configuration file

Create a file named `multi-node-config.yaml`:

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  kubeadmConfigPatches:
  - |
    kind: InitConfiguration
    nodeRegistration:
      kubeletExtraArgs:
        node-labels: "ingress-ready=true"
  extraPortMappings:
  - containerPort: 80
    hostPort: 8080
    protocol: TCP
  - containerPort: 443
    hostPort: 8443
    protocol: TCP
- role: worker
- role: worker
```

### Breaking down the YAML:

**`role: control-plane`**
- This node runs the Kubernetes API server and scheduler
- Only one control plane per cluster (in production, you'd have multiple for redundancy)

**`node-labels: "ingress-ready=true"`**
- This is a custom label we're adding to the control plane
- Later, the NGINX Ingress Controller will use this label to schedule itself on the control plane
- Labels are key-value pairs used to identify and select specific nodes

**`extraPortMappings`**
- Maps ports from inside the Kubernetes cluster to your Mac
- Container port 80 (inside the cluster) → Host port 8080 (your Mac)
- Container port 443 (inside the cluster) → Host port 8443 (your Mac)
- We use 8080/8443 instead of 80/443 because Docker Desktop on macOS doesn't reliably expose privileged ports (< 1024)

**`- role: worker` (repeated twice)**
- Creates two worker nodes
- Worker nodes run your application pods
- Three total nodes: 1 control plane + 2 workers = a realistic multi-node setup

### How port mappings work:

```sh
Your Mac (macOS)          Docker Desktop VM       Kubernetes Cluster
┌──────────────┐          ┌──────────────┐        ┌──────────────┐
│ localhost    │          │ Docker Daemon│        │ Control Plane│
│ :8080 ────────────────→ :8080 ────────────────→ :80 (HTTP)     │
│ :8443 ────────────────→ :8443 ────────────────→ :443 (HTTPS)   │
└──────────────┘          └──────────────┘        └──────────────┘
```

When you `curl localhost:8080`, the request travels: Mac → Docker VM → Kubernetes container port 80.

---

## 2. Creating the Cluster

### The `kind create` command

```sh
kind create cluster --name dev-cluster --config multi-node-config.yaml
```

**What this does:**
1. **Creates three Docker containers** (one control plane, two workers)
2. **Installs Kubernetes** on each container using `kubeadm` (Kubernetes' standard setup tool)
3. **Sets up networking** between the containers so they can communicate as a cluster
4. **Configures port forwarding** on the control plane for ports 8080/8443
5. **Updates your kubeconfig** file (`~/.kube/config`) so `kubectl` knows how to reach the cluster

**Behind the scenes:**
```sh
1. kind reads multi-node-config.yaml
                    ↓
2. Creates 3 Docker containers (images with kubeadm pre-installed)
                    ↓
3. Runs kubeadm init on control plane (starts API server, scheduler, etc.)
                    ↓
4. Runs kubeadm join on worker nodes (joins them to the cluster)
                    ↓
5. Sets up a docker network so containers can reach each other
                    ↓
6. Returns kubeconfig credentials to your Mac
```

### Verifying the cluster

Once finished (this takes 1-2 minutes), verify your nodes:

```sh
kubectl get nodes
```

You should see:

```sh
NAME                       STATUS   ROLES           AGE   VERSION
dev-cluster-control-plane  Ready    control-plane   2m    v1.XX.X
dev-cluster-worker         Ready    <none>          1m    v1.XX.X
dev-cluster-worker2        Ready    <none>          1m    v1.XX.X
```

Each row is a Docker container running on your Mac. The control plane has the `control-plane` role; workers have no special role.

Check that the ingress label is set:

```sh
kubectl get nodes -l ingress-ready=true
```

This should return only the control plane (it has the `ingress-ready=true` label we added).

---

## 3. Installing an Ingress Controller (NGINX)

### What is an Ingress Controller?

Your cluster is running, but there's no way for external traffic (from your Mac) to reach pods inside it yet. An **Ingress Controller** is a pod that:
1. **Listens for incoming traffic** on ports 80/443
2. **Reads Ingress rules** (we'll define these later) that say "if request is for X path, send to Y service"
3. **Routes traffic** to the correct service

Think of it as a reverse proxy or load balancer inside your cluster.

```sh
Your Mac              Cluster Boundary         Inside Cluster
┌────────┐           ┌────────────────────────────────────────┐
│ Browser│           │ ┌─────────────────────────────────┐    │
│ :8080  │──────────→│ │  Ingress Controller (NGINX)     │    │
└────────┘           │ │  - Listens on port 80           │    │
                     │ │  - Reads Ingress rules          │    │
                     │ │  - Routes to Services           │    │
                     │ └──────────┬──────────────────────┘    │
                     │            │                           │
                     │ ┌──────────▼──────────────────────┐    │
                     │ │     Service (hello-service)     │    │
                     │ │     - Abstract IP for pods      │    │
                     │ └──────────┬──────────────────────┘    │
                     │            │                           │
                     │ ┌──────────▼──────┐ ┌──────────────┐   │
                     │ │   Pod (nginx)   │ │ Pod (nginx)  │   │
                     │ │   Replica 1     │ │ Replica 2    │   │
                     │ └─────────────────┘ └──────────────┘   │
                     └────────────────────────────────────────┘
```

### Installing NGINX Ingress Controller

```sh
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```

**What this does:**
1. **Downloads a YAML manifest** from the official ingress-nginx repo
2. **Creates an `ingress-nginx` namespace** (a way to organise resources)
3. **Deploys the NGINX controller pod** in that namespace
4. **Creates a Service** that exposes the controller to the cluster
5. All of this is configured to work with KinD

**Behind the scenes:**
- The manifest defines a Deployment, which tells Kubernetes to run the NGINX pod
- The pod contains the NGINX binary, already compiled and ready to route traffic
- A ClusterIP service is created internally so other pods can reach it

Wait for the ingress controller to be ready:

```sh
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s
```

**Breaking this down:**
- `--namespace ingress-nginx`: Look in the `ingress-nginx` namespace
- `--for=condition=ready pod`: Wait until a pod is in the "Ready" state (fully running and healthy)
- `--selector=app.kubernetes.io/component=controller`: Only look at pods with this label
- `--timeout=90s`: Stop waiting if 90 seconds pass (fail safe)

This command blocks until the NGINX pod is running, so you know it's safe to deploy apps next.

---

## 4. Deploying a Test Application

Now we'll deploy three Kubernetes resources that work together: a **Deployment**, a **Service**, and an **Ingress**.

### Understanding the three resources

**Deployment** - Runs your application
- Tells Kubernetes: "Run 2 copies of the `nginxdemos/hello` image"
- If a pod crashes, Kubernetes automatically restarts it
- If you need 10 pods, you just change the number (no manual management)

**Service** - Provides a stable network address
- Kubernetes pods get IPs assigned dynamically; they're temporary
- A Service has a fixed name (`hello-service`) and IP
- It acts as a load balancer, forwarding traffic to all pods with label `app: hello`
- Other pods in the cluster can reach `http://hello-service` without knowing which machine the pod is on

**Ingress** - Routes external traffic to Services
- Tells the NGINX Ingress Controller: "Direct HTTP requests to `hello-service`"
- Without this, external traffic can't reach your Service
- You can have multiple Ingress rules pointing to different Services

```sh
External Request       Kubernetes Cluster
   (curl)            ┌─────────────────────────────────┐
      │              │                                 │
      └─────────────→│  Ingress Rule:                  │
                     │  "GET / → hello-service"        │
                     │                                 │
                     │  ┌─────────────────────────┐    │
                     │  │  Service (hello-service)│    │
                     │  │  - Stable IP: 10.0.0.1  │    │
                     │  └────────────┬────────────┘    │
                     │               │                 │
                     │  ┌────────────▼────┐            │
                     │  │  Pod (NGINX)    │            │
                     │  │  IP: 10.0.0.5   │            │
                     │  │  Port: 8080     │            │
                     │  └─────────────────┘            │
                     │                                 │
                     └─────────────────────────────────┘
```

### Create the test application YAML

Create a file named `test-app.yaml`:

```yaml
# test-app.yaml
apiVersion: v1
kind: Service
metadata:
  name: hello-service
spec:
  selector:
    app: hello
  ports:
  - port: 80
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hello-deployment
spec:
  replicas: 2
  selector:
    matchLabels:
      app: hello
  template:
    metadata:
      labels:
        app: hello
    spec:
      containers:
      - name: hello
        image: nginxdemos/hello
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: hello-ingress
spec:
  ingressClassName: nginx
  rules:
  - http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: hello-service
            port:
              number: 80
```

### Breaking down each resource

**Service:**
```yaml
selector:
  app: hello
```
- This says: "Forward traffic to all pods with label `app: hello`"
- The Deployment creates pods with this label, so the Service automatically finds them

**Deployment:**
```yaml
replicas: 2
```
- Runs 2 copies of the pod
- If one crashes, Kubernetes starts a replacement
- Distributes load across multiple pods

```yaml
image: nginxdemos/hello
```
- Uses a public image from Docker Hub
- This image runs NGINX with a simple "Hello from NGINX!" page

**Ingress:**
```yaml
ingressClassName: nginx
```
- Says: "Use the NGINX Ingress Controller we just installed"
- Other options exist (like Traefik, HAProxy), but we're using NGINX

```yaml
- path: /
  pathType: Prefix
```
- Matches all paths starting with `/` (i.e., everything)
- You could also add specific routes like `/api` or `/admin`

### Deploy the application

```sh
kubectl apply -f test-app.yaml
```

**What happens:**
1. Kubernetes reads the YAML file
2. Creates a Deployment named `hello-deployment` → Spins up 2 pods running NGINX
3. Creates a Service named `hello-service` → Assigns a stable IP (e.g., 10.0.0.1)
4. Creates an Ingress rule → NGINX controller reads it and configures routing

All three resources are created in the `default` namespace (the default space for resources).

Verify they were created:
```sh
kubectl get svc
kubectl get deploy
kubectl get ingress
kubectl get pods
```

---

## 5. Testing Your App

### Waiting for pods to be ready

Wait a few seconds for the deployment to create and start the pods:

```sh
kubectl get pods
```

You should see:
```sh
NAME                                 READY   STATUS    RESTARTS   AGE
hello-deployment-xxxx-xxxxx          1/1     Running   0          5s
hello-deployment-xxxx-yyyyy          1/1     Running   0          5s
```

Both pods should show `1/1 Ready`. If they show `0/1 ContainerCreating`, wait a few more seconds.

### Port-forwarding: Creating a tunnel

The NGINX Ingress Controller is listening on port 80 inside the cluster container, but your Mac can't directly access that. We need to create a tunnel using `kubectl port-forward`:

```sh
kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8080:80
```

**What this does:**

```sh
Your Mac Terminal        Docker Container        Kubernetes Cluster
┌──────────────┐         ┌──────────────────┐    ┌────────────────────┐
│ localhost    │         │  Docker Network  │    │ Ingress Controller │
│ :8080 ◄─────────────────► :80 (tunneled) ◄─────► Port 80            │
└──────────────┘         └──────────────────┘    └────────────────────┘
     ↑
  port-forward creates
  this tunnel
```

When you `curl localhost:8080`, kubectl intercepts the request and forwards it to the cluster's port 80.

**Breaking down the command:**
- `kubectl port-forward`: kubectl has a built-in tunneling feature
- `-n ingress-nginx`: Look in the `ingress-nginx` namespace
- `svc/ingress-nginx-controller`: Forward to the Service named `ingress-nginx-controller` (the NGINX pod's entry point)
- `8080:80`: Local port 8080 → Remote port 80

The command runs in the foreground and prints:
```sb
Forwarding from 127.0.0.1:8080 -> 80
```

This terminal is now blocked. Don't close it—open a new terminal for the next step.

### Testing the full request path

In a **new terminal**, test your app:

```sh
curl http://localhost:8080
```

**What happens behind the scenes:**

```sh
1. curl sends HTTP request to localhost:8080
                ↓
2. kubectl port-forward intercepts it
                ↓
3. Request travels through the Docker VM boundary
                ↓
4. Reaches Ingress Controller on cluster port 80
                ↓
5. Ingress Controller reads the rule: "/ → hello-service"
                ↓
6. Ingress Controller forwards to hello-service (10.0.0.1:80)
                ↓
7. Service load-balances to one of the 2 pods
                ↓
8. Pod's NGINX server returns "Hello from NGINX!"
                ↓
9. Response travels back through the port-forward tunnel
                ↓
10. curl displays the HTML page
```

You should see output like:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Hello from NGINX!</title>
    ...
</head>
<body>
    <h1>Hello from NGINX!</h1>
    ...
</body>
</html>
```

### Troubleshooting

If port-forward fails, check that the NGINX pod is running:

```sh
kubectl get pods -n ingress-nginx
```

If you see `0/1 Running`, wait a bit more or check logs:

```sh
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller
```

If you see connection refused when curling, make sure:
1. Port-forward command is still running (it should say "Forwarding from 127.0.0.1:8080 -> 80")
2. You're using `localhost:8080`, not a different port
3. The test app pods are in `Running` state (`kubectl get pods`)

---

## Next Steps

### Deploy your own application

Instead of the NGINX demo, try deploying your own app:

1. Build a Docker image: `docker build -t myapp:latest .`
2. Load it into KinD: `kind load docker-image myapp:latest --name dev-cluster`
3. Update your YAML to use `image: myapp:latest`
4. Deploy: `kubectl apply -f myapp.yaml`

**Why load the image?** By default, Kubernetes pulls images from Docker Hub. `kind load` puts your local image into the cluster's Docker, so no network needed.

### Add a custom domain

Instead of `localhost:8080`, you can use a domain like `hello.local`:

1. Edit `/etc/hosts`:
   ```sh
   sudo nano /etc/hosts
   ```

2. Add this line:
   ```sh
   127.0.0.1 hello.local
   ```

3. Save (Ctrl+X, then Y)

4. Now, with port-forward running, use:
   ```sh
   curl http://hello.local:8080
   ```

**How it works:** `/etc/hosts` is a file your Mac checks before DNS. It maps hostnames to IPs locally. Any request to `hello.local` gets sent to `127.0.0.1` (your Mac), then port-forward tunnels it to the cluster.

### Explore Ingress annotations

Ingress supports annotations for advanced features:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: hello-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
  - http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: api-service
            port:
              number: 3000
      - path: /web
        pathType: Prefix
        backend:
          service:
            name: web-service
            port:
              number: 80
```

This routes `/api` to one service and `/web` to another—all on the same domain.

## Cleanup

When you're done experimenting, delete the cluster:

```sh
kind delete cluster --name dev-cluster
```

**What happens:**
1. Deletes the three Docker containers (control plane + 2 workers)
2. Removes the cluster from your kubeconfig
3. Frees up disk space and resources

**Note:** This is safe—everything is local. You're not deleting anything in the cloud.

To list all your KinD clusters:

```sh
kind get clusters
```

To delete all clusters at once:
```sh
kind delete clusters --all
```

## Summary

You've just built a production-like Kubernetes cluster on your Mac. Here's what you learned:

**The Architecture:**
- **Docker:** Runs containers (KinD nodes are containers)
- **Kubernetes:** Orchestrates containers into a cluster
- **Ingress Controller:** Routes external traffic to internal services
- **Services:** Provide stable IPs for dynamic pods
- **Deployments:** Manage replicas and rolling updates

**The Traffic Flow:**

```sh
Your curl request
        ↓
localhost:8080 (your Mac)
        ↓
port-forward tunnel
        ↓
Docker VM boundary
        ↓
Ingress Controller (port 80)
        ↓
Service (hello-service)
        ↓
Pod (one of 2 NGINX replicas)
        ↓
Response travels back through the same path
```

**Key Takeaways:**
- KinD runs full Kubernetes clusters in Docker—perfect for learning and local development
- `kubectl port-forward` creates a tunnel; it's more reliable than port mappings on macOS
- Deployments manage pods, Services provide addresses, Ingress provides routing
- Every resource is a YAML file describing desired state—Kubernetes makes it so

You now understand how traffic flows from your laptop into a multi-node Kubernetes cluster. This is the hardest part of local Kubernetes setup—everything else is application-specific!
