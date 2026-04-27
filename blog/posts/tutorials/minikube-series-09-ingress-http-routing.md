This is Part 9 of a 10-part series on Kubernetes using Minikube. We set up an Ingress controller for proper HTTP routing.

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
9. **Ingress and HTTP Routing** ← you are here
10. [Production Readiness](/blog/view.html?slug=minikube-series-10-production-readiness&folder=tutorials)

---

## Introduction

Up to now, we've been accessing services via NodePort — random high ports like `31234`. This works for development, but it's not how real applications are exposed. Users expect `myapp.com`, not `192.168.49.2:31234`.

An **Ingress** solves this by providing:
- A single entry point for your cluster
- Path-based routing (`/api` → API service, `/` → frontend)
- Host-based routing (`api.myapp.com` → API, `www.myapp.com` → frontend)
- TLS termination (HTTPS)

In this part, we'll set up an Ingress controller on Minikube and configure routing rules for our two services.

---

## Prerequisites

- Minikube running
- Clean slate:

```sh
kubectl delete all --all
kubectl delete configmap --all
```

---

## 1. What is Ingress?

Ingress is actually two things:

1. **Ingress resource** — a YAML object that defines routing rules ("send `/api` to the API service")
2. **Ingress controller** — a pod that reads Ingress resources and actually handles the routing (typically NGINX or Traefik)

The Ingress *resource* is just a configuration. Without a *controller*, nothing happens — like writing traffic rules but having no traffic police.

```
Without Ingress:                     With Ingress:

    :31234 → frontend                    :80 → Ingress Controller
    :31567 → api                              │
    :31890 → monitoring                       ├── /       → frontend
                                              ├── /api    → api
Multiple random ports,                        └── /metrics → monitoring
hard to remember
                                         One port, clean paths
```

### How Ingress fits in the architecture

```
Internet / Your Mac
        │
        │ HTTP request to myapp.local/api
        ↓
┌─────────────────────────────────────────────────────┐
│  Kubernetes Cluster                                 │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  Ingress Controller (NGINX pod)               │  │
│  │                                               │  │
│  │  Reads Ingress rules:                         │  │
│  │  • /     → frontend:80                        │  │
│  │  • /api  → api:8080                           │  │
│  │                                               │  │
│  └────────┬──────────────────┬───────────────────┘  │
│           │                  │                      │
│           ↓                  ↓                      │
│  ┌────────────────┐  ┌────────────────┐             │
│  │ Service:       │  │ Service:       │             │
│  │ frontend       │  │ api            │             │
│  │ (ClusterIP)    │  │ (ClusterIP)    │             │
│  └───────┬────────┘  └───────┬────────┘             │
│          ↓                   ↓                      │
│  ┌──────────────┐    ┌──────────────┐               │
│  │ frontend pods│    │   api pods   │               │
│  └──────────────┘    └──────────────┘               │
└─────────────────────────────────────────────────────┘
```

---

## 2. Enabling the Ingress Controller on Minikube

Minikube has a built-in NGINX Ingress controller that you enable as an addon:

```sh
minikube addons enable ingress
```

This downloads and deploys the NGINX Ingress Controller into the `ingress-nginx` namespace. Wait for it to be ready:

```sh
kubectl get pods -n ingress-nginx --watch
```

Once you see the controller pod in `Running` state (this may take a minute or two):

```
NAME                                        READY   STATUS    RESTARTS   AGE
ingress-nginx-controller-xxxxxxxxxx-xxxxx   1/1     Running   0          60s
```

Press `Ctrl+C` to stop watching.

### What Minikube just did

The addon:
1. Created the `ingress-nginx` namespace
2. Deployed the NGINX Ingress Controller (a Deployment with a single pod)
3. Created a Service to expose the controller
4. Configured it to listen on ports 80 and 443

The controller pod is now watching for Ingress resources. When we create one, it'll update its NGINX configuration to match.

---

## 3. Deploying Our Services

First, let's deploy our API and frontend. This time, both services will be **ClusterIP** — no NodePort needed because Ingress handles external access.

Create `~/k8s-tutorial/api.yaml`:

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

Create `~/k8s-tutorial/frontend.yaml` (simplified, no ConfigMap this time):

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

Deploy both:

```sh
kubectl apply -f ~/k8s-tutorial/api.yaml
kubectl apply -f ~/k8s-tutorial/frontend.yaml
```

Notice both services are ClusterIP. Without Ingress, they'd be completely inaccessible from your Mac. Ingress will provide the external access.

---

## 4. Creating Ingress Rules

Now for the Ingress resource. Create `~/k8s-tutorial/ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$1
spec:
  ingressClassName: nginx
  rules:
  - http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
      - path: /api(/|$)(.*)
        pathType: ImplementationSpecific
        backend:
          service:
            name: api
            port:
              number: 8080
```

### Breaking this down

**`apiVersion: networking.k8s.io/v1`**
Ingress is in the networking API group.

**`annotations`**

```yaml
annotations:
  nginx.ingress.kubernetes.io/rewrite-target: /$1
```

Annotations are metadata that the Ingress controller reads. This one tells NGINX to rewrite the URL path. Without it, a request to `/api/hello` would arrive at the API service as `/api/hello`. With the rewrite, it arrives as `/hello`. This is important because the API doesn't know it's mounted under `/api` — it expects requests at `/`.

**`ingressClassName: nginx`**
Specifies which Ingress controller to use. If you had multiple controllers (e.g., one for internal traffic, one for external), this is how you'd choose.

**`rules`**
The routing rules. Each rule maps a path to a backend service:

```yaml
- path: /
  pathType: Prefix
  backend:
    service:
      name: frontend
      port:
        number: 80
```

- **path:** Match requests starting with `/`
- **pathType: Prefix** — match this path and anything under it
- **backend:** Send matching requests to the `frontend` Service on port 80

```yaml
- path: /api(/|$)(.*)
  pathType: ImplementationSpecific
  backend:
    service:
      name: api
      port:
        number: 8080
```

- **path:** A regex that matches `/api`, `/api/`, and `/api/anything`
- **pathType: ImplementationSpecific** — tells Kubernetes to let the controller interpret the path (needed for regex)
- **backend:** Send to the `api` Service on port 8080

### Routing visualised

```
Incoming Request          Ingress Rule           Backend Service
─────────────────         ──────────             ───────────────

GET /                 →   path: /            →   frontend:80
GET /index.html       →   path: /            →   frontend:80
GET /style.css        →   path: /            →   frontend:80
GET /api              →   path: /api(/|$)(.*)→   api:8080
GET /api/users        →   path: /api(/|$)(.*)→   api:8080
```

The Ingress controller evaluates rules in order of specificity. `/api` is more specific than `/`, so API requests match the API rule even though they also match `/`.

---

## 5. Apply and Test

```sh
kubectl apply -f ~/k8s-tutorial/ingress.yaml
```

Verify the Ingress was created:

```sh
kubectl get ingress
```

```
NAME          CLASS   HOSTS   ADDRESS          PORTS   AGE
app-ingress   nginx   *       192.168.49.2     80      30s
```

**ADDRESS** shows the Minikube IP. If it's empty, wait a moment — the controller is still processing.

### Get the Minikube IP

```sh
minikube ip
```

Let's say it returns `192.168.49.2`.

### Test the frontend

```sh
curl http://$(minikube ip)
```

You should see the NGINX welcome page. The request hit the Ingress controller on port 80, matched the `/` rule, and was routed to the frontend Service.

### Test the API

```sh
curl http://$(minikube ip)/api/
```

You should see the echoserver response. The request matched the `/api` rule and was routed to the API service.

### If curl hangs or fails

On macOS with the Docker driver, the Minikube IP might not be directly accessible. In that case, use `minikube tunnel`:

```sh
# In a separate terminal (keeps running in foreground)
minikube tunnel
```

This creates a network route from your Mac to the Minikube cluster. You may be prompted for your password (it modifies routing tables).

With the tunnel running, try:

```sh
curl http://127.0.0.1
curl http://127.0.0.1/api/
```

---

## 6. Host-Based Routing

Besides path-based routing, Ingress supports **host-based routing** — directing traffic based on the domain name in the request.

Let's set up two hostnames: `frontend.local` and `api.local`.

Update `~/k8s-tutorial/ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
spec:
  ingressClassName: nginx
  rules:
  - host: frontend.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
  - host: api.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api
            port:
              number: 8080
```

```sh
kubectl apply -f ~/k8s-tutorial/ingress.yaml
```

### Configure local DNS

Add entries to your `/etc/hosts` file so your Mac knows where to find these domains:

```sh
echo "$(minikube ip) frontend.local api.local" | sudo tee -a /etc/hosts
```

You'll be prompted for your password.

### Test host-based routing

```sh
curl http://frontend.local
```

NGINX welcome page — routed to the frontend Service.

```sh
curl http://api.local
```

Echoserver response — routed to the API Service.

Same IP, same port (80), but different services based on the hostname. This is how real-world websites work — `api.example.com` and `www.example.com` can point to the same server but route to different backends.

```
Request: frontend.local       Request: api.local
          │                              │
          ↓                              ↓
    Ingress Controller            Ingress Controller
    Host: frontend.local          Host: api.local
          │                              │
          ↓                              ↓
    frontend Service              api Service
    (NGINX pods)                  (echoserver pods)
```

---

## 7. Inspecting Ingress

### Detailed view

```sh
kubectl describe ingress app-ingress
```

Key sections:

```
Rules:
  Host              Path  Backends
  ----              ----  --------
  frontend.local
                    /     frontend:80 (172.17.0.3:80, 172.17.0.4:80)
  api.local
                    /     api:8080 (172.17.0.5:8080, 172.17.0.6:8080)
```

This shows exactly which pods back each rule. The IP addresses are the individual pod IPs.

### Ingress controller logs

If things aren't working, check the controller's logs:

```sh
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller
```

You'll see NGINX access logs (each request) and any configuration errors.

---

## 8. Path-Based vs Host-Based: When to Use Each

| Approach | Example | Best for |
|----------|---------|---------|
| **Path-based** | `myapp.com/api`, `myapp.com/web` | Simple setups, single domain |
| **Host-based** | `api.myapp.com`, `web.myapp.com` | Multiple domains, larger systems |
| **Combined** | `api.myapp.com/v1`, `api.myapp.com/v2` | API versioning, complex routing |

In production, host-based routing is more common because:
- Each service gets its own domain — cleaner URLs
- CORS (cross-origin requests) is simpler to manage
- TLS certificates can be service-specific

---

## 9. Cleanup

Remove the `/etc/hosts` entries when you're done (keep the file clean):

```sh
sudo sed -i '' '/frontend.local/d' /etc/hosts
sudo sed -i '' '/api.local/d' /etc/hosts
```

Let's also revert the Ingress to path-based routing for Part 10:

```yaml
# ~/k8s-tutorial/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$1
spec:
  ingressClassName: nginx
  rules:
  - http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
      - path: /api(/|$)(.*)
        pathType: ImplementationSpecific
        backend:
          service:
            name: api
            port:
              number: 8080
```

```sh
kubectl apply -f ~/k8s-tutorial/ingress.yaml
```

---

## What Problem Did We Just Solve?

We replaced random NodePort numbers with proper HTTP routing:

1. **Single entry point** — all traffic enters through port 80 on the Ingress controller
2. **Path-based routing** — `/` goes to the frontend, `/api` goes to the API
3. **Host-based routing** — different domains route to different services
4. **Clean URLs** — users see `myapp.com/api`, not `192.168.49.2:31234`

Ingress is the standard way to expose HTTP services in Kubernetes. It's what makes your cluster feel like a real web platform.

### What would break in production?

- We have **no TLS** (HTTPS). In production, the Ingress controller would terminate TLS using certificates (often managed by cert-manager, which automatically provisions Let's Encrypt certificates).
- There's no **rate limiting** or **WAF** (Web Application Firewall). Production Ingress controllers typically sit behind a cloud load balancer that provides these.
- We're using the NGINX Ingress controller, which is great for most use cases. High-traffic production systems might use more specialised options like **Envoy** (used by Istio) or **Traefik**.

---

## What's Next?

In the final part — **Part 10** — we'll add production-readiness features to our services: **liveness and readiness probes** (so Kubernetes knows if your app is actually healthy), **resource limits** (so one app can't starve others), and **observability basics** (so you can debug problems when they inevitably happen). This is what separates a tutorial setup from something you'd trust with real traffic.
