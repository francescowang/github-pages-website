This is Part 10 of Series 2 — the final part of a 10-part intermediate Kubernetes series using Minikube. We create real failure scenarios and debug them systematically.

---

## The Series

1. [Rolling Updates and Rollbacks](/blog/view.html?slug=minikube-series-02-01-rolling-updates-rollbacks&folder=tutorials)
2. [Namespaces and Resource Quotas](/blog/view.html?slug=minikube-series-02-02-namespaces-resource-quotas&folder=tutorials)
3. [Secrets and Configuration](/blog/view.html?slug=minikube-series-02-03-secrets-and-configuration&folder=tutorials)
4. [Persistent Storage](/blog/view.html?slug=minikube-series-02-04-persistent-storage&folder=tutorials)
5. [Networking from the Inside](/blog/view.html?slug=minikube-series-02-05-networking-internals&folder=tutorials)
6. [Jobs, CronJobs, and Batch Work](/blog/view.html?slug=minikube-series-02-06-jobs-cronjobs-batch&folder=tutorials)
7. [StatefulSets and Databases](/blog/view.html?slug=minikube-series-02-07-statefulsets-databases&folder=tutorials)
8. [Helm and Chart Packaging](/blog/view.html?slug=minikube-series-02-08-helm-chart-packaging&folder=tutorials)
9. [RBAC and Security](/blog/view.html?slug=minikube-series-02-09-rbac-security&folder=tutorials)
10. **Debugging Like an SRE** ← you are here

---

## Introduction

Everything breaks eventually. Pods crash. Images fail to pull. Services lose their endpoints. Memory leaks kill containers. DNS stops resolving. When this happens at 3am, you need a systematic approach — not guesswork.

This part is different from the rest of the series. Instead of teaching new concepts, we'll **create real problems and solve them.** Eight failure scenarios, each testing a different part of the stack. By the end, you'll have a debugging toolkit and the confidence to handle any Kubernetes issue.

---

## Prerequisites

- Minikube running: `minikube start --driver=docker`
- Clean slate:

```sh
kubectl delete all --all
```

---

## The Debugging Mindset

Before we start, let's establish a framework. When something goes wrong:

```
1. OBSERVE — What is the current state?
   kubectl get pods / kubectl get events

2. DESCRIBE — What details does Kubernetes have?
   kubectl describe pod/svc/deploy <name>

3. LOGS — What is the application saying?
   kubectl logs <pod> [--previous]

4. EXEC — What's happening inside the container?
   kubectl exec -it <pod> -- sh

5. NARROW — Isolate the layer
   Is it the pod? The Service? DNS? Network? Permissions?
```

The key principle: **start broad, narrow down.** Don't jump to conclusions. Read error messages — Kubernetes tells you exactly what's wrong if you look.

---

## Scenario 1: ImagePullBackOff

### Create the problem

```sh
kubectl create deployment broken --image=nginx:99.99.99
```

### Observe

```sh
kubectl get pods
```

```
NAME                      READY   STATUS             RESTARTS   AGE
broken-xxxxxxxxxx-aaaaa   0/1     ImagePullBackOff   0          30s
```

### Diagnose

```sh
kubectl describe pod -l app=broken
```

Scroll to the **Events** section:

```
Events:
  Warning  Failed     10s   kubelet  Failed to pull image "nginx:99.99.99":
           rpc error: code = NotFound desc = failed to pull and unpack image
           "docker.io/library/nginx:99.99.99": not found
  Warning  Failed     10s   kubelet  Error: ImagePullBackOff
```

**Root cause:** The image tag `99.99.99` doesn't exist. Kubernetes can't find it on Docker Hub.

### Fix

```sh
kubectl set image deployment/broken nginx=nginx:alpine
```

### Lesson

**ImagePullBackOff** means Kubernetes can't download the container image. Common causes:
- Typo in the image name or tag
- Private registry without authentication
- Network connectivity issues from the node
- Rate limiting (Docker Hub has pull limits)

```sh
kubectl delete deployment broken
```

---

## Scenario 2: CrashLoopBackOff

### Create the problem

```sh
kubectl create deployment crasher --image=busybox -- sh -c "echo 'starting'; exit 1"
```

### Observe

```sh
kubectl get pods --watch
```

```
NAME                       READY   STATUS             RESTARTS      AGE
crasher-xxxxxxxxxx-aaaaa   0/1     CrashLoopBackOff   3 (30s ago)   45s
```

The RESTARTS column increments. The pod starts, immediately exits with code 1, and Kubernetes restarts it — with increasing backoff delays.

### Diagnose

```sh
kubectl logs -l app=crasher --previous
```

```
starting
```

The `--previous` flag shows logs from the **last** container that ran (the one that crashed). Without it, you might see nothing because the current container already crashed before producing output.

```sh
kubectl describe pod -l app=crasher
```

Look at:
```
Last State:   Terminated
  Reason:     Error
  Exit Code:  1
```

**Root cause:** The application exits with code 1 (error). Kubernetes restarts it, it crashes again, and we enter a CrashLoop.

### Fix

Fix the command so the application doesn't exit:

```sh
kubectl set image deployment/crasher busybox=nginx:alpine
```

Or fix the command itself:

```sh
kubectl delete deployment crasher
kubectl create deployment crasher --image=busybox -- sh -c "echo 'starting'; sleep 3600"
```

### Lesson

**CrashLoopBackOff** means the container keeps crashing and restarting. Common causes:
- Application bug (unhandled exception, missing dependency)
- Wrong command or entrypoint
- Missing configuration (env vars, config files)
- Insufficient resources (OOMKilled — see Scenario 7)

Always check `kubectl logs --previous` to see what happened before the crash.

```sh
kubectl delete deployment crasher
```

---

## Scenario 3: Pod Stuck in Pending

### Create the problem

```sh
kubectl run greedy --image=nginx --restart=Never --overrides='{"spec":{"containers":[{"name":"nginx","image":"nginx","resources":{"requests":{"cpu":"100","memory":"100Gi"}}}]}}'
```

We're requesting 100 CPU cores and 100Gi of memory — far more than Minikube has.

### Observe

```sh
kubectl get pods
```

```
NAME     READY   STATUS    RESTARTS   AGE
greedy   0/1     Pending   0          30s
```

Stuck in **Pending**. The pod exists but isn't scheduled to any node.

### Diagnose

```sh
kubectl describe pod greedy
```

```
Events:
  Warning  FailedScheduling  default-scheduler  0/1 nodes are available:
           1 Insufficient cpu, 1 Insufficient memory.
```

The scheduler can't find a node with enough resources.

**Root cause:** The pod requests more resources than any node in the cluster has available.

### Fix

Delete the pod and create it with reasonable requests:

```sh
kubectl delete pod greedy
kubectl run greedy --image=nginx --restart=Never
```

### Lesson

**Pending** pods are usually a scheduling problem. Common causes:
- Insufficient resources on all nodes
- Node affinity/anti-affinity rules that can't be satisfied
- PVC that can't be bound (no matching PV or StorageClass)
- Taints on nodes without matching tolerations

```sh
kubectl delete pod greedy
```

---

## Scenario 4: Service Not Routing Traffic

### Create the problem

```sh
kubectl create deployment web --image=nginx:alpine --replicas=2
kubectl expose deployment web --port=80
```

Now let's break the Service by changing the pod labels:

```sh
kubectl label pods -l app=web app=broken --overwrite
```

### Observe

```sh
kubectl exec deployment/web -- wget -qO- --timeout=3 http://web 2>&1 || echo "Connection failed"
```

The Service exists but can't find any pods.

### Diagnose

```sh
kubectl get endpoints web
```

```
NAME   ENDPOINTS   AGE
web    <none>      2m
```

**No endpoints.** The Service selector doesn't match any pods.

```sh
kubectl describe service web
```

```
Selector:  app=web
```

```sh
kubectl get pods --show-labels
```

```
NAME                   READY   STATUS    LABELS
web-xxxxxxxxxx-aaaaa   1/1     Running   app=broken,...
web-xxxxxxxxxx-bbbbb   1/1     Running   app=broken,...
```

**Root cause:** The pods have `app=broken` but the Service selects `app=web`. No match, no endpoints.

### Fix

```sh
kubectl label pods -l app=broken app=web --overwrite
```

Check endpoints again:

```sh
kubectl get endpoints web
```

```
NAME   ENDPOINTS                     AGE
web    10.244.0.5:80,10.244.0.6:80   3m
```

Traffic flows again.

### Lesson

When a Service returns no results or times out, check **endpoints first**. Empty endpoints almost always means a selector/label mismatch.

```sh
kubectl delete all --all
```

---

## Scenario 5: Ingress Returning 404 or 502

### Create the problem

First, enable the Ingress addon:

```sh
minikube addons enable ingress
kubectl wait --namespace ingress-nginx --for=condition=ready pod -l app.kubernetes.io/component=controller --timeout=120s
```

Deploy an app and create a broken Ingress:

```sh
kubectl create deployment web --image=nginx:alpine
kubectl expose deployment web --port=80
```

```yaml
# broken-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-ingress
spec:
  ingressClassName: nginx
  rules:
  - http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web
            port:
              number: 8080    # Wrong port! Service is on 80
```

```sh
kubectl apply -f broken-ingress.yaml
```

### Observe

```sh
curl -s http://$(minikube ip) || echo "Failed"
```

You'll get a 502 Bad Gateway or a connection error.

### Diagnose

```sh
kubectl describe ingress web-ingress
```

Look at the backend:

```
Rules:
  Host  Path  Backends
  ----  ----  --------
  *     /     web:8080 (<error: endpoints "web" not found>)
```

Check the Service:

```sh
kubectl get service web
```

```
NAME   TYPE        CLUSTER-IP      PORT(S)   AGE
web    ClusterIP   10.96.xxx.xxx   80/TCP    5m
```

The Service listens on port 80, but the Ingress points to port 8080. The Ingress controller can't connect to the backend.

Check the Ingress controller logs for more detail:

```sh
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller --tail=20
```

### Fix

```sh
kubectl patch ingress web-ingress --type=json -p='[{"op":"replace","path":"/spec/rules/0/http/paths/0/backend/service/port/number","value":80}]'
```

Or edit the YAML and re-apply:

```yaml
port:
  number: 80    # Correct port
```

### Lesson

Ingress errors are usually: wrong `ingressClassName`, wrong backend port, or missing Service. Check `kubectl describe ingress` first, then controller logs.

```sh
kubectl delete ingress web-ingress
kubectl delete all --all
```

---

## Scenario 6: DNS Resolution Failure

### Create the problem

```sh
kubectl create deployment api --image=nginx:alpine
# Note: we deliberately do NOT create a Service
```

### Observe

```sh
kubectl run dns-test --image=busybox --rm -it --restart=Never -- wget -qO- --timeout=3 http://api
```

```
wget: bad address 'api'
```

### Diagnose

```sh
kubectl run dns-test --image=busybox --rm -it --restart=Never -- nslookup api
```

```
** server can't find api: NXDOMAIN
```

NXDOMAIN — the name doesn't exist in DNS.

Check if a Service exists:

```sh
kubectl get service api
```

```
Error from server (NotFound): services "api" not found
```

**Root cause:** There's no Service named `api`. DNS names are created for Services, not Deployments or pods.

### Fix

```sh
kubectl expose deployment api --port=80
```

Now DNS works:

```sh
kubectl run dns-test --image=busybox --rm -it --restart=Never -- nslookup api
```

```
Name:   api.default.svc.cluster.local
Address: 10.96.xxx.xxx
```

### Lesson

If DNS resolution fails inside a pod:
1. Check if the Service exists (`kubectl get svc`)
2. Check you're using the right name (including namespace for cross-namespace lookups)
3. Check CoreDNS is running (`kubectl get pods -n kube-system -l k8s-app=kube-dns`)

```sh
kubectl delete all --all
```

---

## Scenario 7: OOMKilled

### Create the problem

```sh
kubectl run memory-hog --image=busybox --restart=Never --overrides='{"spec":{"containers":[{"name":"busybox","image":"busybox","command":["sh","-c","echo Allocating memory; dd if=/dev/zero of=/dev/null bs=1M; sleep 3600"],"resources":{"limits":{"memory":"32Mi"}}}]}}'
```

This pod has a 32Mi memory limit and tries to process unlimited data.

### Observe

```sh
kubectl get pods --watch
```

```
NAME         READY   STATUS      RESTARTS     AGE
memory-hog   0/1     OOMKilled   1 (5s ago)   15s
```

### Diagnose

```sh
kubectl describe pod memory-hog
```

```
Last State:     Terminated
  Reason:       OOMKilled
  Exit Code:    137
```

**Exit code 137** = the process was killed by SIGKILL (128 + 9). This is the kernel's OOM killer terminating the process because it exceeded its memory limit.

### Fix

Either increase the memory limit or fix the application to use less memory:

```sh
kubectl delete pod memory-hog
kubectl run memory-hog --image=busybox --restart=Never --overrides='{"spec":{"containers":[{"name":"busybox","image":"busybox","command":["sleep","3600"],"resources":{"limits":{"memory":"128Mi"}}}]}}'
```

### Lesson

**OOMKilled** means the container exceeded its memory limit. The kernel kills the process (exit code 137). Common causes:
- Memory limit too low for the workload
- Memory leak in the application
- JVM heap size not matching container limits

Always set `resources.requests.memory` close to expected usage and `resources.limits.memory` with some headroom.

```sh
kubectl delete pod memory-hog
```

---

## Scenario 8: Pod Can't Reach External Internet

### Create the problem

```sh
kubectl run net-test --image=busybox --restart=Never -- sh -c "wget -qO- --timeout=5 http://example.com || echo 'Cannot reach internet'; sleep 3600"
```

### Observe

```sh
kubectl logs net-test
```

If it says "Cannot reach internet", there's a DNS or routing issue.

### Diagnose

Step by step:

```sh
# 1. Can the pod resolve external DNS?
kubectl exec net-test -- nslookup example.com

# 2. Can the pod reach external IPs?
kubectl exec net-test -- wget -qO- --timeout=5 http://93.184.216.34

# 3. Check the pod's DNS config
kubectl exec net-test -- cat /etc/resolv.conf
```

**If DNS fails but IP works:** The upstream DNS server (CoreDNS → host DNS) can't resolve external names. Check CoreDNS configuration.

**If both fail:** There's a network routing issue. The node might not have internet access, or a Network Policy is blocking egress.

### Fix

On Minikube with Docker driver, external connectivity usually works. If it doesn't:

```sh
# Check if Minikube itself has internet access
minikube ssh -- wget -qO- --timeout=5 http://example.com

# Restart CoreDNS
kubectl rollout restart deployment coredns -n kube-system
```

### Lesson

External connectivity issues are usually DNS-related. The debugging path:
1. Can the pod resolve external names? (`nslookup`)
2. Can the pod reach external IPs? (`wget` with IP)
3. Can the node resolve and reach external hosts? (`minikube ssh`)

```sh
kubectl delete pod net-test
```

---

## The Debugging Cheat Sheet

Keep this handy:

```
STATUS              FIRST COMMAND                    COMMON CAUSE
────────────────    ──────────────────────────────   ─────────────────────────
ImagePullBackOff    kubectl describe pod <name>      Wrong image name/tag
CrashLoopBackOff    kubectl logs <pod> --previous    App crash, missing config
Pending             kubectl describe pod <name>      Insufficient resources
Running but 0/1     kubectl describe pod <name>      Readiness probe failing
OOMKilled           kubectl describe pod <name>      Memory limit exceeded
Service no traffic  kubectl get endpoints <svc>      Selector/label mismatch
Ingress 404/502     kubectl describe ingress <name>  Wrong port or missing svc
DNS failure         nslookup <name> (from inside)    No Service or wrong namespace
```

### Essential debugging commands

```sh
# Pod status and events
kubectl get pods -o wide
kubectl describe pod <name>
kubectl get events --sort-by='.lastTimestamp'

# Logs
kubectl logs <pod>
kubectl logs <pod> --previous
kubectl logs <pod> -c <container>    # specific container
kubectl logs -l app=<name>           # all pods with a label

# Inside the container
kubectl exec -it <pod> -- sh
kubectl exec <pod> -- env            # see environment variables
kubectl exec <pod> -- cat /etc/resolv.conf

# Networking
kubectl get endpoints <service>
kubectl get service <name>
kubectl run debug --image=busybox --rm -it --restart=Never -- sh

# Permissions
kubectl auth can-i <verb> <resource> --as <user>

# Resource usage
kubectl top pods
kubectl top nodes
kubectl describe node minikube
```

---

## What We've Built Across Series 2

Let's look back at the journey from Series 1 through Series 2:

| Part | What we learned | Key skill |
|------|---------------|-----------|
| S2-1 | Rolling updates and rollbacks | Manage change safely |
| S2-2 | Namespaces and resource quotas | Organise and constrain |
| S2-3 | Secrets and configuration | Manage sensitive data |
| S2-4 | Persistent storage | Give apps memory |
| S2-5 | Networking internals | Understand the wire |
| S2-6 | Jobs and CronJobs | Run batch work |
| S2-7 | StatefulSets | Run databases |
| S2-8 | Helm | Package and reuse |
| S2-9 | RBAC and security | Control access |
| S2-10 | Debugging | Fix problems fast |

### Where you are now

After completing both series, you understand:
- How Kubernetes works **conceptually** (Series 1)
- How Kubernetes works **mechanically** (Series 2)
- How to deploy **stateless and stateful** workloads
- How to **manage configuration and secrets** securely
- How to **control access** with RBAC
- How to **package** applications with Helm
- How to **debug** any failure scenario

### Where to go from here

**Operational topics:**
- **GitOps** (ArgoCD, Flux) — manage cluster state via git commits
- **CI/CD pipelines** — automate testing and deployment
- **Monitoring** (Prometheus + Grafana) — dashboards and alerts
- **Logging** (EFK stack, Loki) — centralised log aggregation

**Advanced Kubernetes:**
- **Custom Resource Definitions (CRDs)** — extend the Kubernetes API
- **Operators** — automate complex application management
- **Service Meshes** (Istio, Linkerd) — advanced networking
- **Pod Disruption Budgets** — safe maintenance and upgrades
- **Horizontal Pod Autoscaler** — automatic scaling based on metrics

**Cloud Kubernetes:**
- **EKS, GKE, AKS** — managed Kubernetes (when you're ready to leave Minikube)
- **Cluster autoscaling** — automatically add/remove nodes
- **Cloud-native storage** — EBS, Persistent Disk, Azure Disk

The most important thing you've learned isn't any specific command. It's the **mental model**: Kubernetes is a declarative system where you describe desired state, controllers reconcile actual state, and everything communicates through the API server. Every new concept you learn will fit into this model.

Good luck, and happy debugging.
