This is Part 5 of Series 2 — a 10-part intermediate Kubernetes series using Minikube. We look inside Kubernetes networking: kube-proxy, iptables, CoreDNS, and Network Policies.

---

## The Series

1. [Rolling Updates and Rollbacks](/blog/view.html?slug=minikube-series-02-01-rolling-updates-rollbacks&folder=tutorials)
2. [Namespaces and Resource Quotas](/blog/view.html?slug=minikube-series-02-02-namespaces-resource-quotas&folder=tutorials)
3. [Secrets and Configuration](/blog/view.html?slug=minikube-series-02-03-secrets-and-configuration&folder=tutorials)
4. [Persistent Storage](/blog/view.html?slug=minikube-series-02-04-persistent-storage&folder=tutorials)
5. **Networking from the Inside** ← you are here
6. [Jobs, CronJobs, and Batch Work](/blog/view.html?slug=minikube-series-02-06-jobs-cronjobs-batch&folder=tutorials)
7. [StatefulSets and Databases](/blog/view.html?slug=minikube-series-02-07-statefulsets-databases&folder=tutorials)
8. [Helm and Chart Packaging](/blog/view.html?slug=minikube-series-02-08-helm-chart-packaging&folder=tutorials)
9. [RBAC and Security](/blog/view.html?slug=minikube-series-02-09-rbac-security&folder=tutorials)
10. [Debugging Like an SRE](/blog/view.html?slug=minikube-series-02-10-debugging-like-an-sre&folder=tutorials)

---

## Introduction

In Series 1, we used Services and DNS to connect our applications. Traffic flowed from one pod to another, and it "just worked." But *how* did it work? When you type `http://api:8080` inside a pod, what actually happens at the network level?

Understanding networking internals is essential for debugging. When a Service doesn't route traffic, or a pod can't reach another pod, you need to know where to look. In this part, we'll peel back the layers: how pods get IPs, how kube-proxy rewrites traffic, how CoreDNS resolves names, and how Network Policies act as firewalls.

---

## Prerequisites

- Minikube running: `minikube start --driver=docker`
- For Network Policies, we need the Calico CNI. Start Minikube with it:

```sh
minikube delete
minikube start --driver=docker --cni=calico
```

**Note:** If you've already started Minikube without Calico, you'll need to delete and recreate it. The CNI (Container Network Interface) plugin is configured at cluster creation time.

Wait for Calico to be ready:

```sh
kubectl get pods -n kube-system -l k8s-app=calico-node --watch
```

Once the Calico pod shows `1/1 Running`, press `Ctrl+C`.

---

## 1. The Kubernetes Networking Model

Kubernetes networking follows three fundamental rules:

1. **Every pod gets its own IP address** — pods don't share IPs, so there are no port conflicts
2. **All pods can communicate with all other pods** without NAT — any pod can reach any other pod using its IP
3. **Agents on a node can communicate with all pods on that node** — the kubelet and kube-proxy can reach local pods directly

These rules mean Kubernetes networking is a **flat network** — no NAT, no port mapping between pods. If pod A has IP 10.244.0.5 and pod B has IP 10.244.0.6, they can talk directly.

```
Flat Pod Network:

┌────────────────────────────────────────────────┐
│  Node (Minikube)                               │
│                                                │
│  Pod A (10.244.0.5)  ←───────→  Pod B (10.244.0.6)
│  Pod C (10.244.0.7)  ←───────→  Pod D (10.244.0.8)
│                                                │
│  All pods can reach all other pods directly     │
│  No NAT, no port mapping                      │
└────────────────────────────────────────────────┘
```

### Verifying pod IPs

Let's deploy two pods and verify they can communicate directly:

```sh
kubectl create deployment app-a --image=nginx:alpine --replicas=1
kubectl create deployment app-b --image=nginx:alpine --replicas=1
kubectl wait --for=condition=Available deployment/app-a deployment/app-b
```

```sh
kubectl get pods -o wide
```

```
NAME                     READY   STATUS    IP            NODE
app-a-xxxxxxxxxx-aaaaa   1/1     Running   10.244.0.5    minikube
app-b-xxxxxxxxxx-bbbbb   1/1     Running   10.244.0.6    minikube
```

Test direct pod-to-pod communication using the IP:

```sh
kubectl exec deployment/app-a -- wget -qO- http://10.244.0.6
```

You should see the NGINX welcome page. Pod A reached pod B directly by IP. No Service needed.

But remember: **pod IPs are ephemeral**. If pod B restarts, it gets a new IP. This is why we need Services — and understanding *how* Services work is the next step.

---

## 2. How kube-proxy Works

When you create a Service, Kubernetes assigns it a virtual IP (ClusterIP) from a dedicated range (e.g., 10.96.0.0/16). This IP doesn't belong to any real network interface — it's a **virtual IP** that exists only in the node's networking rules.

**kube-proxy** is the component responsible for making these virtual IPs work. It runs on every node and watches the API server for Service and Endpoint changes. When traffic is sent to a Service's ClusterIP, kube-proxy intercepts it and redirects it to one of the Service's backend pods.

### Creating a Service to inspect

```sh
kubectl expose deployment app-a --port=80 --name=app-a-svc
```

```sh
kubectl get service app-a-svc
```

```
NAME        TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
app-a-svc   ClusterIP   10.96.xxx.xxx   <none>       80/TCP    5s
```

### Inspecting iptables rules

kube-proxy (in iptables mode, the default) creates iptables rules that intercept traffic to the ClusterIP and redirect it to a pod IP. Let's see these rules:

```sh
minikube ssh -- sudo iptables -t nat -L KUBE-SERVICES -n | grep app-a
```

You should see output like:

```
KUBE-SVC-XXXXX  tcp  --  0.0.0.0/0  10.96.xxx.xxx  /* default/app-a-svc cluster IP */ tcp dpt:80
```

This says: "Any TCP traffic destined for 10.96.xxx.xxx:80, jump to chain KUBE-SVC-XXXXX."

Let's follow the chain:

```sh
minikube ssh -- sudo iptables -t nat -L KUBE-SVC-XXXXX -n
```

```
KUBE-SEP-YYYYY  all  --  0.0.0.0/0  0.0.0.0/0   /* default/app-a-svc */
```

And the endpoint:

```sh
minikube ssh -- sudo iptables -t nat -L KUBE-SEP-YYYYY -n
```

```
DNAT  tcp  --  0.0.0.0/0  0.0.0.0/0  /* default/app-a-svc */ tcp to:10.244.0.5:80
```

**DNAT** (Destination NAT) rewrites the destination IP from the Service ClusterIP (10.96.xxx.xxx) to the pod IP (10.244.0.5). The traffic arrives at the pod as if it was sent directly.

### The full flow

```
Pod B sends request to 10.96.xxx.xxx:80 (Service ClusterIP)
            │
            ↓
iptables (KUBE-SERVICES chain):
  "This matches Service app-a-svc"
            │
            ↓
iptables (KUBE-SVC-XXXXX chain):
  "Pick a backend pod"
  (if multiple pods, uses random probability rules)
            │
            ↓
iptables (KUBE-SEP-YYYYY chain):
  "DNAT to 10.244.0.5:80"
            │
            ↓
Traffic arrives at Pod A (10.244.0.5:80)
  Pod A sees the request as coming from Pod B's IP
```

### Load balancing with multiple pods

Scale app-a to 3 replicas:

```sh
kubectl scale deployment app-a --replicas=3
```

Check the iptables rules again:

```sh
minikube ssh -- sudo iptables -t nat -L KUBE-SVC-XXXXX -n
```

Now you'll see multiple SEP (Service Endpoint) chains with probability-based selection:

```
KUBE-SEP-AAA  all  -- 0.0.0.0/0  0.0.0.0/0  statistic mode random probability 0.33333
KUBE-SEP-BBB  all  -- 0.0.0.0/0  0.0.0.0/0  statistic mode random probability 0.50000
KUBE-SEP-CCC  all  -- 0.0.0.0/0  0.0.0.0/0
```

The first rule matches with 33% probability, the second with 50% of the remaining (so 33% overall), and the third catches everything else (33%). This gives roughly equal distribution across 3 pods.

This is how Kubernetes load-balances — pure iptables probability rules. No separate load balancer process needed.

---

## 3. How CoreDNS Works

When you use a Service name like `http://api:8080` inside a pod, something needs to resolve `api` to the Service's ClusterIP. That something is **CoreDNS**.

### How pods find CoreDNS

Every pod has a DNS configuration injected by the kubelet. Let's look at it:

```sh
kubectl exec deployment/app-a -- cat /etc/resolv.conf
```

```
nameserver 10.96.0.10
search default.svc.cluster.local svc.cluster.local cluster.local
ndots:5
```

**Breaking this down:**

**`nameserver 10.96.0.10`** — all DNS queries go to this IP. This is the CoreDNS Service:

```sh
kubectl get service -n kube-system kube-dns
```

```
NAME       TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)
kube-dns   ClusterIP   10.96.0.10   <none>        53/UDP,53/TCP
```

**`search default.svc.cluster.local svc.cluster.local cluster.local`** — the DNS search domains. When you query `api`, the resolver tries:
1. `api.default.svc.cluster.local` — found! (if there's a Service called `api` in the `default` namespace)
2. `api.svc.cluster.local` — tried if #1 fails
3. `api.cluster.local` — tried if #2 fails
4. `api` — bare name, tried last

This is why `api` works within the same namespace, but you need `api.staging.svc.cluster.local` to reach a Service in a different namespace.

**`ndots:5`** — if the name has fewer than 5 dots, the search domains are appended first. `api` has 0 dots, so the search list is used. `api.staging.svc.cluster.local` has 4 dots, so the search list is still used. `google.com` has 1 dot, so the search list is tried first, then the bare name.

### Testing DNS resolution

```sh
kubectl run dns-debug --image=busybox --rm -it --restart=Never -- nslookup app-a-svc
```

```
Server:    10.96.0.10
Address:   10.96.0.10:53

Name:   app-a-svc.default.svc.cluster.local
Address: 10.96.xxx.xxx
```

CoreDNS resolved `app-a-svc` to the Service's ClusterIP.

### Headless Services

A normal Service has a ClusterIP and DNS resolves to that single virtual IP. A **headless Service** (`clusterIP: None`) has no virtual IP — DNS returns the IP addresses of the individual pods instead.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: app-a-headless
spec:
  clusterIP: None
  selector:
    app: app-a
  ports:
  - port: 80
```

```sh
kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: app-a-headless
spec:
  clusterIP: None
  selector:
    app: app-a
  ports:
  - port: 80
EOF
```

Now query the headless Service:

```sh
kubectl run dns-debug --image=busybox --rm -it --restart=Never -- nslookup app-a-headless
```

```
Name:   app-a-headless.default.svc.cluster.local
Address: 10.244.0.5
Address: 10.244.0.6
Address: 10.244.0.7
```

Three IP addresses — one for each pod. The client decides which pod to connect to. This is essential for StatefulSets (Part 7), where each pod has a unique identity and clients need to address specific replicas.

```
Normal Service:                      Headless Service:
DNS returns: 10.96.xxx.xxx          DNS returns: 10.244.0.5
(one virtual IP)                                 10.244.0.6
                                                 10.244.0.7
                                    (all pod IPs)
```

---

## 4. Network Policies

By default, Kubernetes networking is completely open — any pod can talk to any other pod in any namespace. This is a significant security risk in shared clusters. **Network Policies** are the solution — they act as firewalls for pod-to-pod traffic.

### How Network Policies work

A Network Policy selects pods by label and specifies what traffic is allowed. Once you apply *any* Network Policy that selects a pod, all other traffic to that pod is denied by default (deny-by-default model).

**Important:** Network Policies require a CNI plugin that supports them. Not all do. We started Minikube with `--cni=calico` for this reason. The default Minikube CNI does not enforce Network Policies.

### Setting up the test environment

Let's create a proper test scenario:

```sh
kubectl delete all --all

kubectl create deployment frontend --image=nginx:alpine --replicas=1
kubectl create deployment api --image=nginx:alpine --replicas=1
kubectl create deployment database --image=nginx:alpine --replicas=1

kubectl expose deployment frontend --port=80
kubectl expose deployment api --port=80
kubectl expose deployment database --port=80

kubectl wait --for=condition=Available deployment/frontend deployment/api deployment/database
```

Label them with tiers:

```sh
kubectl label deployment frontend tier=frontend
kubectl label deployment api tier=backend
kubectl label deployment database tier=database
```

Verify everything can talk to everything:

```sh
# Frontend → API (should work)
kubectl exec deployment/frontend -- wget -qO- --timeout=3 http://api

# Frontend → Database (should work — but shouldn't in production!)
kubectl exec deployment/frontend -- wget -qO- --timeout=3 http://database

# API → Database (should work)
kubectl exec deployment/api -- wget -qO- --timeout=3 http://database
```

All three succeed. The frontend can reach the database directly — that's a security problem.

### Creating a deny-all policy

First, let's deny all ingress traffic to the database:

```yaml
# deny-all-database.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all-to-database
spec:
  podSelector:
    matchLabels:
      app: database
  policyTypes:
  - Ingress
  ingress: []    # empty = no traffic allowed
```

```sh
kubectl apply -f deny-all-database.yaml
```

Now test:

```sh
# API → Database (blocked!)
kubectl exec deployment/api -- wget -qO- --timeout=3 http://database
```

```
wget: download timed out
command terminated with exit code 1
```

Blocked. The database is now completely isolated.

### Allowing specific traffic

Now let's allow only the API to reach the database:

```yaml
# allow-api-to-database.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-to-database
spec:
  podSelector:
    matchLabels:
      app: database
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: api
    ports:
    - protocol: TCP
      port: 80
```

```sh
kubectl apply -f allow-api-to-database.yaml
```

Test again:

```sh
# API → Database (allowed!)
kubectl exec deployment/api -- wget -qO- --timeout=3 http://database
# Success — returns NGINX page

# Frontend → Database (still blocked!)
kubectl exec deployment/frontend -- wget -qO- --timeout=3 http://database
# wget: download timed out
```

The API can reach the database. The frontend cannot. Exactly the access pattern we want.

```
Network Policy effect:

Frontend ─── ✗ ──→ Database
   │
   │ ✓
   ↓
  API ──── ✓ ──→ Database
```

### Breaking down the policy

```yaml
spec:
  podSelector:          # Which pods this policy applies TO
    matchLabels:
      app: database     # "Apply this to pods with app=database"

  policyTypes:
  - Ingress             # Control incoming traffic

  ingress:
  - from:               # Who is allowed to connect
    - podSelector:
        matchLabels:
          app: api      # "Only pods with app=api"
    ports:
    - protocol: TCP
      port: 80          # "Only on TCP port 80"
```

### Namespace-based policies

You can also restrict traffic by namespace:

```yaml
ingress:
- from:
  - namespaceSelector:
      matchLabels:
        environment: staging
```

This allows traffic only from pods in namespaces labelled `environment=staging`.

### Egress policies

Network Policies can also control **outgoing** traffic:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-egress
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
  - Egress
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: database
    ports:
    - protocol: TCP
      port: 80
  - to:                    # Allow DNS (required for service name resolution)
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
```

**Important:** If you restrict egress, you must explicitly allow DNS (port 53) or the pod can't resolve service names.

---

## 5. Debugging Network Issues

When networking fails, here's the systematic approach:

### Step 1: Check pod IPs

```sh
kubectl get pods -o wide
```

Are the pods running? Do they have IPs?

### Step 2: Test direct pod-to-pod connectivity

```sh
kubectl exec deployment/app-a -- wget -qO- --timeout=3 http://<pod-b-ip>
```

If direct pod-to-pod works but Service doesn't, the problem is in kube-proxy/iptables.

### Step 3: Check Service endpoints

```sh
kubectl get endpoints <service-name>
```

If endpoints are empty, the Service selector doesn't match any pod labels.

### Step 4: Test DNS resolution

```sh
kubectl exec deployment/app-a -- nslookup <service-name>
```

If DNS fails, check CoreDNS:

```sh
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns
```

### Step 5: Check Network Policies

```sh
kubectl get networkpolicy
kubectl describe networkpolicy <policy-name>
```

A NetworkPolicy might be blocking traffic. Remember: once any policy selects a pod, all unspecified traffic is denied.

---

## Cleanup

```sh
kubectl delete all --all
kubectl delete networkpolicy --all
```

---

## What Problem Did We Just Solve?

We opened the black box of Kubernetes networking:

1. **Pod networking** is flat — every pod gets an IP, every pod can reach every other pod directly
2. **kube-proxy** uses iptables DNAT rules to redirect ClusterIP traffic to actual pod IPs — Services are virtual, implemented entirely in network rules
3. **CoreDNS** resolves service names to ClusterIPs using search domains injected into each pod's `/etc/resolv.conf`
4. **Headless Services** return pod IPs directly instead of a virtual IP — essential for StatefulSets
5. **Network Policies** act as firewalls, restricting which pods can communicate — critical for security in shared clusters

### What would break in production?

- iptables mode has performance limitations at scale (thousands of Services). Large clusters use **IPVS mode** which uses hash tables instead of linear rule chains.
- Network Policies only work with CNI plugins that support them. If your cluster uses a basic CNI, policies are silently ignored — a dangerous false sense of security.
- We haven't discussed **service mesh** (Istio, Linkerd) which adds mTLS, traffic splitting, retries, and observability at the networking layer. For complex microservices, a service mesh is often the next step after Network Policies.

---

## What's Next?

In **Part 6**, we'll explore **Jobs, CronJobs, and Batch Work** — workloads that run to completion instead of running forever. We'll also learn about Init Containers, which run setup tasks before your main application starts.
