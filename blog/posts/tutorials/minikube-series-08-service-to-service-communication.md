This is Part 8 of a 10-part series on Kubernetes using Minikube. We configure services to talk to each other using Kubernetes DNS.

---

## The Series

1. [What is Kubernetes?](/blog/view.html?slug=minikube-series-01-what-is-kubernetes&folder=tutorials)
2. [Setting Up Your Local Cluster](/blog/view.html?slug=minikube-series-02-setting-up-minikube&folder=tutorials)
3. [Your First Deployment](/blog/view.html?slug=minikube-series-03-first-deployment&folder=tutorials)
4. [Exposing Your App](/blog/view.html?slug=minikube-series-04-exposing-your-app&folder=tutorials)
5. [YAML and Declarative Configuration](/blog/view.html?slug=minikube-series-05-yaml-declarative-config&folder=tutorials)
6. [Scaling and Self-Healing](/blog/view.html?slug=minikube-series-06-scaling-and-self-healing&folder=tutorials)
7. [Multi-Service Architecture](/blog/view.html?slug=minikube-series-07-multi-service-architecture&folder=tutorials)
8. **Service-to-Service Communication** ← you are here
9. [Ingress and HTTP Routing](/blog/view.html?slug=minikube-series-09-ingress-http-routing&folder=tutorials)
10. [Production Readiness](/blog/view.html?slug=minikube-series-10-production-readiness&folder=tutorials)

---

## Introduction

In Part 7, we deployed two independent services — a frontend and an API — and proved they could reach each other from inside the cluster. But we didn't actually *configure* them to work together. The frontend just served its default NGINX page.

In this part, we'll configure the NGINX frontend to **proxy requests to the API service** using Kubernetes DNS. This is the moment where our separate services become a connected system — and it's the pattern most people mean when they talk about microservices.

---

## Prerequisites

- Minikube running
- Clean slate:

```sh
kubectl delete all --all
```

---

## 1. How Kubernetes DNS Works

Every Service in Kubernetes gets a DNS name automatically. When you create a Service called `api`, any pod in the cluster can reach it using just the name `api`.

### The DNS format

```
<service-name>.<namespace>.svc.cluster.local
```

For our API service in the default namespace:

```
api.default.svc.cluster.local
```

But within the same namespace, you can use the short form:

```
api
```

Kubernetes' built-in DNS server (**CoreDNS**) resolves these names to the Service's ClusterIP address.

```
Pod inside the cluster                  CoreDNS
┌────────────────────┐                 ┌──────────────────┐
│                    │  "Who is api?"  │                  │
│  wget http://api   │ ──────────────→ │  api → 10.96.x.x │
│                    │                 │                  │
│                    │  "10.96.x.x"   │                  │
│                    │ ←────────────── │                  │
└────────────────────┘                 └──────────────────┘
         │
         │  HTTP request to 10.96.x.x:8080
         ↓
┌────────────────────┐
│  Service: api      │
│  10.96.x.x:8080   │ ──→ Pod (echoserver)
└────────────────────┘
```

### An analogy

Kubernetes DNS is like a company's internal phone directory. You don't need to know your colleague's desk phone number (pod IP). You call the switchboard (DNS) and say "connect me to the sales team" (service name). The switchboard routes your call to the right person, even if they moved desks yesterday.

### Verifying DNS

Let's deploy our API service first and verify DNS works. Create `~/k8s-tutorial/api.yaml`:

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

```sh
kubectl apply -f ~/k8s-tutorial/api.yaml
```

Now let's test DNS from a temporary pod:

```sh
kubectl run dns-test --image=busybox --rm -it --restart=Never -- nslookup api
```

**What this does:**
- Creates a temporary pod running `busybox` (a tiny Linux image with basic networking tools)
- Runs `nslookup api` inside it to query DNS
- Deletes the pod when done (`--rm`)

You should see:

```
Server:    10.96.0.10
Address:   10.96.0.10:53

Name:   api.default.svc.cluster.local
Address: 10.96.xxx.xxx
```

DNS works. The name `api` resolves to the Service's ClusterIP. Any pod in this namespace can reach the API using `http://api:8080`.

---

## 2. Creating an NGINX Reverse Proxy

Now let's configure NGINX to proxy requests to the API. We need a custom NGINX configuration that routes specific paths to the API service.

### The ConfigMap

Kubernetes has a resource type called a **ConfigMap** — it stores configuration data that can be injected into pods. We'll use it to provide a custom NGINX configuration.

Create `~/k8s-tutorial/frontend.yaml`:

```yaml
# ConfigMap for custom NGINX configuration
apiVersion: v1
kind: ConfigMap
metadata:
  name: nginx-config
data:
  default.conf: |
    server {
        listen 80;
        server_name localhost;

        # Serve the default NGINX page for /
        location / {
            root /usr/share/nginx/html;
            index index.html;
        }

        # Proxy /api requests to the API service
        location /api/ {
            proxy_pass http://api:8080/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
---
# Frontend Deployment
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
        volumeMounts:
        - name: nginx-config
          mountPath: /etc/nginx/conf.d
      volumes:
      - name: nginx-config
        configMap:
          name: nginx-config
---
# Frontend Service
apiVersion: v1
kind: Service
metadata:
  name: frontend
spec:
  type: NodePort
  selector:
    app: frontend
  ports:
  - port: 80
    targetPort: 80
```

### Breaking this down

There are three new concepts here. Let's take them one at a time.

**ConfigMap:**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nginx-config
data:
  default.conf: |
    server {
        listen 80;
        ...
    }
```

A ConfigMap is a key-value store for configuration. Here, the key is `default.conf` (a filename) and the value is the NGINX configuration. The `|` character in YAML means "the following lines are a multi-line string."

**Volume + VolumeMount:**

```yaml
# In the container spec:
volumeMounts:
- name: nginx-config
  mountPath: /etc/nginx/conf.d     # Where to mount the config

# In the pod spec:
volumes:
- name: nginx-config
  configMap:
    name: nginx-config              # Which ConfigMap to use
```

This takes the ConfigMap's data and mounts it as files inside the container. The file `default.conf` from the ConfigMap appears at `/etc/nginx/conf.d/default.conf` inside the NGINX container — exactly where NGINX looks for its configuration.

Think of it like plugging a USB drive into the container. The ConfigMap is the USB drive, and the volumeMount is the USB port.

**The proxy configuration:**

```nginx
location /api/ {
    proxy_pass http://api:8080/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

This is standard NGINX reverse proxy configuration:
- `location /api/` — match any request starting with `/api/`
- `proxy_pass http://api:8080/` — forward it to the `api` Service (using Kubernetes DNS)
- The trailing `/` on both `location` and `proxy_pass` strips the `/api/` prefix, so `/api/test` becomes `/test` on the backend

```
Request Flow:

User → http://frontend/api/hello
                ↓
NGINX matches location /api/
                ↓
proxy_pass http://api:8080/hello
                ↓
DNS resolves "api" → 10.96.xxx.xxx (Service ClusterIP)
                ↓
Service routes to an API pod
                ↓
echoserver responds
                ↓
NGINX returns response to user
```

---

## 3. Deploy and Test

Apply everything:

```sh
kubectl apply -f ~/k8s-tutorial/api.yaml
kubectl apply -f ~/k8s-tutorial/frontend.yaml
```

Wait for all pods to be ready:

```sh
kubectl get pods --watch
```

Once all pods show `1/1 Running`, get the frontend URL:

```sh
minikube service frontend --url
```

### Test the frontend directly

```sh
curl $(minikube service frontend --url)
```

You should see the default NGINX welcome page. This is the frontend serving its own content.

### Test the API proxy

```sh
curl $(minikube service frontend --url)/api/
```

You should see the echoserver response — the frontend proxied your request to the API service.

```
Hostname: api-xxxxxxxxxx-aaaaa

Pod Information:
    -no pod information available-

Server values:
    server_version=nginx: 1.13.3

Request Information:
    client_address=172.17.0.5
    method=GET
    real path=/
    ...
```

The **Hostname** field shows an API pod name — confirming the request went through the frontend NGINX proxy to the API backend.

### Proving load balancing works

Send several requests through the proxy:

```sh
for i in $(seq 1 6); do
  curl -s $(minikube service frontend --url)/api/ | grep "Hostname"
done
```

```
Hostname: api-xxxxxxxxxx-aaaaa
Hostname: api-xxxxxxxxxx-bbbbb
Hostname: api-xxxxxxxxxx-aaaaa
Hostname: api-xxxxxxxxxx-bbbbb
Hostname: api-xxxxxxxxxx-aaaaa
Hostname: api-xxxxxxxxxx-bbbbb
```

The API Service load balances across both API pods, even though the request comes from the NGINX frontend.

---

## 4. The Complete Request Flow

Let's trace a request from your Mac all the way to an API pod and back:

```
Your Mac (curl/browser)
        │
        │ HTTP GET /api/hello
        ↓
┌─────────────────────────────────────────────────┐
│  Minikube Node                                  │
│  ┌───────────────────────────────────────────┐  │
│  │  NodePort (3XXXX)                         │  │
│  │        │                                  │  │
│  │        ↓                                  │  │
│  │  Service: frontend (ClusterIP:80)         │  │
│  │        │                                  │  │
│  │        ↓                                  │  │
│  │  Frontend Pod (NGINX)                     │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │ location /api/ matches              │  │  │
│  │  │ proxy_pass http://api:8080/hello    │  │  │
│  │  └──────────────┬──────────────────────┘  │  │
│  │                 │                         │  │
│  │                 │ DNS: api → 10.96.x.x    │  │
│  │                 ↓                         │  │
│  │  Service: api (ClusterIP:8080)            │  │
│  │        │                                  │  │
│  │        ↓                                  │  │
│  │  API Pod (echoserver)                     │  │
│  │  ┌──────────────────────┐                 │  │
│  │  │ Handles /hello       │                 │  │
│  │  │ Returns response     │                 │  │
│  │  └──────────────────────┘                 │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

Seven hops: Your Mac → NodePort → frontend Service → frontend Pod → DNS lookup → API Service → API Pod. All happening in milliseconds.

---

## 5. ConfigMaps: Going Deeper

ConfigMaps are how you separate configuration from application code. Let's explore them further.

### Viewing a ConfigMap

```sh
kubectl get configmap nginx-config -o yaml
```

This shows the full ConfigMap contents, including the NGINX configuration we wrote.

### ConfigMaps as environment variables

Besides mounting as files, ConfigMaps can be injected as environment variables. This is useful for simpler configuration:

```yaml
# Example (not part of our tutorial files)
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  DATABASE_HOST: "postgres"
  DATABASE_PORT: "5432"
  LOG_LEVEL: "info"
```

```yaml
# In a container spec:
containers:
- name: myapp
  image: myapp:latest
  envFrom:
  - configMapRef:
      name: app-config
```

Now the container has environment variables `DATABASE_HOST=postgres`, `DATABASE_PORT=5432`, and `LOG_LEVEL=info`.

### When to use each approach

| Approach | Best for |
|----------|---------|
| **Volume mount** | Configuration files (nginx.conf, application.yaml) |
| **Environment variables** | Simple key-value settings (database host, log level) |

---

## 6. Debugging Service Communication

When services can't talk to each other, here's how to diagnose the problem.

### Step 1: Check pods are running

```sh
kubectl get pods
```

All pods should be `1/1 Running`.

### Step 2: Check the Service has endpoints

```sh
kubectl get endpoints api
```

```
NAME   ENDPOINTS                           AGE
api    172.17.0.3:8080,172.17.0.4:8080     10m
```

If endpoints are empty, the Service selector doesn't match any pods. Check labels:

```sh
kubectl get pods --show-labels
```

### Step 3: Test DNS from inside a pod

```sh
kubectl run debug --image=busybox --rm -it --restart=Never -- nslookup api
```

If DNS fails, check CoreDNS:

```sh
kubectl get pods -n kube-system -l k8s-app=kube-dns
```

### Step 4: Test connectivity from inside a pod

```sh
kubectl run debug --image=busybox --rm -it --restart=Never -- wget -qO- http://api:8080
```

If this works but your frontend can't reach the API, the problem is in your NGINX configuration — not in Kubernetes networking.

### Step 5: Check NGINX logs

```sh
kubectl logs deployment/frontend
```

NGINX logs errors when it can't connect to upstream servers. You might see:

```
[error] connect() failed (111: Connection refused) while connecting to upstream
```

This means DNS resolved but the connection was refused — check the target port is correct.

---

## 7. Updating the ConfigMap

If you change the NGINX configuration, you need to:

1. Update the ConfigMap
2. Restart the pods (they don't automatically pick up changes)

The easiest way:

```sh
# Apply the updated YAML (which includes the ConfigMap)
kubectl apply -f ~/k8s-tutorial/frontend.yaml

# Restart pods to pick up the new config
kubectl rollout restart deployment frontend
```

`kubectl rollout restart` performs a rolling restart — replacing pods one at a time so there's no downtime.

---

## What Problem Did We Just Solve?

We connected two services together using Kubernetes DNS, creating a real microservices architecture:

1. **Service discovery via DNS** — services find each other by name, not IP. Pod IPs can change, but the service name `api` always resolves to the right address.
2. **Reverse proxying** — the frontend proxies API requests to the backend, hiding the internal architecture from external users.
3. **Configuration management** — ConfigMaps let us inject configuration without baking it into the container image.

This is the pattern used by real-world microservices platforms. Each service has a DNS name, and services communicate using those names.

### What would break in production?

- We're using HTTP for service-to-service communication. In production, you'd use **mTLS** (mutual TLS) — a service mesh like Istio or Linkerd can add this transparently.
- Our NGINX config is very basic. Production reverse proxies need **timeouts**, **retries**, **circuit breakers**, and **rate limiting**.
- ConfigMaps are stored unencrypted. For sensitive data (passwords, API keys), use **Secrets** — a ConfigMap-like resource that's base64-encoded and can be encrypted at rest.

---

## What's Next?

Our frontend is exposed via a NodePort on a random high port. That's not how real websites work — users expect `example.com/api`, not `192.168.49.2:31234/api`. In **Part 9**, we'll set up an **Ingress controller** that provides proper HTTP routing, path-based routing, and a single entry point for all our services.
