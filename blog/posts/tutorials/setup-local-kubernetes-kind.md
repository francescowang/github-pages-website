# Hands-on: Setting up a Local Cluster with KinD

KinD (Kubernetes in Docker) is one of the most efficient tools for local Kubernetes development. Unlike Minikube, which often requires a dedicated VM, KinD runs each cluster node as a Docker container, making it incredibly fast to spin up and tear down.

In this tutorial, we will build a production-like multi-node cluster and configure it for local ingress testing.

## Prerequisites
- **Docker:** Ensure the Docker daemon is running.
- **kubectl:** The Kubernetes command-line tool.
- **kind:** Installed via `brew install kind` (macOS) or your package manager of choice.

---

## 1. Defining a Multi-Node Topology
By default, KinD creates a single-node cluster. For a more realistic environment, we should define a control plane and multiple workers.

Create a file named `multi-node-config.yaml`:

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  # Port mappings for Ingress (HTTP/HTTPS)
  kubeadmConfigPatches:
  - |
    kind: InitConfiguration
    nodeRegistration:
      kubeletExtraArgs:
        node-labels: "ingress-ready=true"
  extraPortMappings:
  - containerPort: 80
    hostPort: 80
    protocol: TCP
  - containerPort: 443
    hostPort: 443
    protocol: TCP
- role: worker
- role: worker
```

### Why the extra port mappings?
We are mapping host ports 80/443 to the control-plane container so that we can access services via `localhost` once an Ingress controller is installed.

---

## 2. Creating the Cluster
Use the `--config` flag to apply your topology:

```bash
kind create cluster --name dev-cluster --config multi-node-config.yaml
```

Once finished, verify that you have three "nodes" (which are actually Docker containers):

```bash
kubectl get nodes
```

---

## 3. Installing an Ingress Controller (NGINX)
A cluster isn't very useful without a way to route traffic. Let's deploy the NGINX Ingress Controller specifically configured for KinD:

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```

Wait for the ingress pods to be ready:
```bash
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s
```

---

## 4. Deploying a Test Application
Let's verify everything works by deploying a simple web server and an Ingress resource.

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

Apply the manifests:
```bash
kubectl apply -f test-app.yaml
```

---

## 5. Verification
Wait a few seconds for the pods to start, then run:

```bash
curl http://localhost
```

If you see the NGINX "Hello" page, you have successfully set up a multi-node Kubernetes cluster with working Ingress!

## Cleanup
When you're done, tearing down the environment is a single command:

```bash
kind delete cluster --name dev-cluster
```

## Summary
KinD is the "SRE's Swiss Army Knife" for local testing. In under 5 minutes, we simulated a multi-node environment, handled port-forwarding, and configured an L7 load balancer.
