This is Part 7 of Series 2 — a 10-part intermediate Kubernetes series using Minikube. We deploy stateful workloads using StatefulSets, with Redis as our hands-on example.

---

## The Series

1. [Rolling Updates and Rollbacks](/blog/view.html?slug=minikube-series-02-01-rolling-updates-rollbacks&folder=tutorials)
2. [Namespaces and Resource Quotas](/blog/view.html?slug=minikube-series-02-02-namespaces-resource-quotas&folder=tutorials)
3. [Secrets and Configuration](/blog/view.html?slug=minikube-series-02-03-secrets-and-configuration&folder=tutorials)
4. [Persistent Storage](/blog/view.html?slug=minikube-series-02-04-persistent-storage&folder=tutorials)
5. [Networking from the Inside](/blog/view.html?slug=minikube-series-02-05-networking-internals&folder=tutorials)
6. [Jobs, CronJobs, and Batch Work](/blog/view.html?slug=minikube-series-02-06-jobs-cronjobs-batch&folder=tutorials)
7. **StatefulSets and Databases** ← you are here
8. [Helm and Chart Packaging](/blog/view.html?slug=minikube-series-02-08-helm-chart-packaging&folder=tutorials)
9. [RBAC and Security](/blog/view.html?slug=minikube-series-02-09-rbac-security&folder=tutorials)
10. [Debugging Like an SRE](/blog/view.html?slug=minikube-series-02-10-debugging-like-an-sre&folder=tutorials)

---

## Introduction

Deployments treat pods as interchangeable. Any pod can handle any request. When a pod is deleted, the replacement has a new name, new IP, and no memory of its predecessor. For stateless web servers, this is perfect. For databases, it's a disaster.

Databases need:
- **Stable identity** — a replica called `db-0` should always be `db-0`, even after a restart
- **Stable storage** — each replica has its own data that must survive rescheduling
- **Ordered operations** — start the primary before the replicas; shut down replicas before the primary

**StatefulSets** provide all three. They're the workload controller for anything stateful: databases, caches, message queues, consensus systems. In this part, we'll deploy Redis and experience how StatefulSets differ from Deployments.

---

## Prerequisites

- Minikube running: `minikube start --driver=docker`
- Clean slate:

```sh
kubectl delete all --all
kubectl delete pvc --all
```

---

## 1. Why Deployments Don't Work for Databases

Let's make this concrete. Imagine running a database with a Deployment:

```
Deployment (replicas: 3)
├── db-6f7d8e-aaaaa  (IP: 10.244.0.5, Volume: shared-pvc)
├── db-6f7d8e-bbbbb  (IP: 10.244.0.6, Volume: shared-pvc)
└── db-6f7d8e-ccccc  (IP: 10.244.0.7, Volume: shared-pvc)
```

Problems:
1. **Random names** — pods get hashes like `aaaaa`. You can't tell which is the primary and which are replicas.
2. **Shared storage** — all pods mount the same PVC. Three database instances writing to the same storage means corruption.
3. **No ordering** — all pods start simultaneously. But databases often need the primary to start first.
4. **Unstable network identity** — if `aaaaa` restarts, it becomes `ddddd` with a new IP. Other replicas can't find it.

### StatefulSet fixes all of these

```
StatefulSet (replicas: 3)
├── db-0  (IP: stable, Volume: data-db-0, DNS: db-0.db-svc)
├── db-1  (IP: stable, Volume: data-db-1, DNS: db-1.db-svc)
└── db-2  (IP: stable, Volume: data-db-2, DNS: db-2.db-svc)
```

- **Predictable names** — `db-0`, `db-1`, `db-2` (ordinal index, not random hash)
- **Per-pod storage** — each pod gets its own PVC (`data-db-0`, `data-db-1`, `data-db-2`)
- **Ordered deployment** — `db-0` starts first, then `db-1`, then `db-2`
- **Stable DNS** — each pod has a DNS name that persists across restarts

---

## 2. Anatomy of a StatefulSet

A StatefulSet requires a **headless Service** (from Part 5) to provide DNS names for each pod. Let's build the complete setup.

Create `~/k8s-tutorial-2/redis-statefulset.yaml`:

```yaml
# Headless Service (required for StatefulSet DNS)
apiVersion: v1
kind: Service
metadata:
  name: redis
  labels:
    app: redis
spec:
  clusterIP: None          # Headless — returns individual pod IPs
  selector:
    app: redis
  ports:
  - port: 6379
    name: redis
---
# StatefulSet
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis
spec:
  serviceName: redis        # Must match the headless Service name
  replicas: 3
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
          name: redis
        volumeMounts:
        - name: data
          mountPath: /data
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 100Mi
```

### Breaking this down

**Headless Service:**

```yaml
spec:
  clusterIP: None
```

A headless Service has no ClusterIP. Instead of returning a single virtual IP, DNS returns the IPs of individual pods. This gives each pod its own DNS record:
- `redis-0.redis.default.svc.cluster.local`
- `redis-1.redis.default.svc.cluster.local`
- `redis-2.redis.default.svc.cluster.local`

**`serviceName: redis`** — links the StatefulSet to its headless Service. This is what enables the per-pod DNS names.

**`volumeClaimTemplates`** — this is unique to StatefulSets. Instead of referencing a single PVC (which all pods would share), the template creates a **separate PVC for each pod**:

```
volumeClaimTemplates creates:
  data-redis-0  →  100Mi PV (used by redis-0)
  data-redis-1  →  100Mi PV (used by redis-1)
  data-redis-2  →  100Mi PV (used by redis-2)
```

Each pod gets its own independent storage. This is the difference that makes databases possible.

---

## 3. Deploying Redis

```sh
kubectl apply -f ~/k8s-tutorial-2/redis-statefulset.yaml
```

### Watch the ordered startup

```sh
kubectl get pods --watch
```

```
NAME      READY   STATUS              RESTARTS   AGE
redis-0   0/1     ContainerCreating   0          2s
redis-0   1/1     Running             0          5s
redis-1   0/1     ContainerCreating   0          2s
redis-1   1/1     Running             0          5s
redis-2   0/1     ContainerCreating   0          2s
redis-2   1/1     Running             0          4s
```

Notice the order: `redis-0` starts first, only after it's ready does `redis-1` start, then `redis-2`. This is **ordered deployment** — essential for primary/replica database setups where the primary must be ready before replicas try to connect.

### Verify the naming pattern

```sh
kubectl get pods -o wide
```

```
NAME      READY   STATUS    IP            NODE
redis-0   1/1     Running   10.244.0.5    minikube
redis-1   1/1     Running   10.244.0.6    minikube
redis-2   1/1     Running   10.244.0.7    minikube
```

Simple, predictable names: `redis-0`, `redis-1`, `redis-2`. Not `redis-6f7d8e9a-xkp4q`.

### Verify per-pod storage

```sh
kubectl get pvc
```

```
NAME           STATUS   VOLUME         CAPACITY   ACCESS MODES   STORAGECLASS   AGE
data-redis-0   Bound    pvc-xxx-000    100Mi      RWO            standard       2m
data-redis-1   Bound    pvc-xxx-001    100Mi      RWO            standard       1m
data-redis-2   Bound    pvc-xxx-002    100Mi      RWO            standard       30s
```

Three separate PVCs, one for each pod. Each pod has independent storage.

### Verify DNS

```sh
kubectl run dns-test --image=busybox --rm -it --restart=Never -- nslookup redis-0.redis
```

```
Name:   redis-0.redis.default.svc.cluster.local
Address: 10.244.0.5
```

Each pod has its own DNS name: `<pod-name>.<service-name>`.

---

## 4. Writing Data and Testing Persistence

Let's write data to a specific Redis instance and verify it persists across pod restarts.

### Write data to redis-0

```sh
kubectl exec redis-0 -- redis-cli SET mykey "Hello from redis-0"
```

```
OK
```

### Read it back

```sh
kubectl exec redis-0 -- redis-cli GET mykey
```

```
Hello from redis-0
```

### Verify other pods don't have it

```sh
kubectl exec redis-1 -- redis-cli GET mykey
```

```
(nil)
```

Each Redis instance has its own data — because each has its own PVC. This is the per-pod storage guarantee.

### Delete the pod and verify persistence

```sh
kubectl delete pod redis-0
```

Watch it come back:

```sh
kubectl get pods --watch
```

```
redis-0   0/1     Terminating         0          10m
redis-0   0/1     Pending             0          0s
redis-0   0/1     ContainerCreating   0          1s
redis-0   1/1     Running             0          3s
```

**Same name** — `redis-0`, not `redis-0-xyzab`. The StatefulSet always recreates with the same ordinal.

Check the data:

```sh
kubectl exec redis-0 -- redis-cli GET mykey
```

```
Hello from redis-0
```

The data survived the pod restart because:
1. The PVC `data-redis-0` was not deleted (only the pod was)
2. The new `redis-0` pod was automatically bound to the same PVC
3. Redis loaded the data from `/data` (which is the PVC mount point)

```
Pod lifecycle with StatefulSet:

redis-0 (Pod v1) → writes to PVC data-redis-0 → [data saved]
         ↓
redis-0 deleted → PVC data-redis-0 persists
         ↓
redis-0 (Pod v2) → reads from PVC data-redis-0 → [data restored]

Same name, same PVC, same data.
```

---

## 5. Ordered Scaling

### Scaling up

```sh
kubectl scale statefulset redis --replicas=5
```

```sh
kubectl get pods --watch
```

Pods are added in order: `redis-3` is created first, then `redis-4`. Each waits for the previous one to be ready.

### Scaling down

```sh
kubectl scale statefulset redis --replicas=2
```

Pods are removed in **reverse** order: `redis-4` first, then `redis-3`, then `redis-2`. The lowest ordinals are kept.

```
Scaling down from 5 to 2:

redis-4 → terminated first  (highest ordinal)
redis-3 → terminated second
redis-2 → terminated third
redis-1 → kept
redis-0 → kept (lowest ordinal, usually the primary)
```

This ordering is critical for databases. The lowest ordinal (often the primary) is always the last to be removed.

### What happens to the PVCs?

```sh
kubectl get pvc
```

```
NAME           STATUS   VOLUME         CAPACITY   AGE
data-redis-0   Bound    pvc-xxx-000    100Mi      15m
data-redis-1   Bound    pvc-xxx-001    100Mi      14m
data-redis-2   Bound    pvc-xxx-002    100Mi      13m
data-redis-3   Bound    pvc-xxx-003    100Mi      5m
data-redis-4   Bound    pvc-xxx-004    100Mi      5m
```

All five PVCs still exist, even though we scaled down to 2 pods. **Kubernetes never automatically deletes PVCs from StatefulSets.** This is a safety measure — data should not be accidentally lost during scaling.

If you scale back up to 5, `redis-2`, `redis-3`, and `redis-4` will reattach to their existing PVCs with the old data still intact.

To truly delete the PVCs, you must do it manually:

```sh
kubectl delete pvc data-redis-2 data-redis-3 data-redis-4
```

---

## 6. StatefulSet Update Strategies

StatefulSets support the same rolling update mechanism as Deployments, but with ordered semantics:

### RollingUpdate (default)

Pods are updated in **reverse ordinal order**: `redis-2` first, then `redis-1`, then `redis-0`. Each pod must be ready before the next is updated.

```yaml
spec:
  updateStrategy:
    type: RollingUpdate
```

### Partitioned updates (canary)

You can update only pods above a certain ordinal. This is useful for canary testing:

```yaml
spec:
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      partition: 2    # Only update pods with ordinal >= 2
```

With `partition: 2` and 3 replicas, only `redis-2` gets the new version. `redis-0` and `redis-1` keep the old version. If the update works, reduce the partition to 0 to update all pods.

### OnDelete

```yaml
spec:
  updateStrategy:
    type: OnDelete
```

Pods are not automatically updated. You manually delete pods, and new ones are created with the updated template. This gives you full control over the rollout order and timing.

---

## 7. StatefulSet vs Deployment: Complete Comparison

| Feature | Deployment | StatefulSet |
|---------|-----------|-------------|
| Pod names | Random hash (`web-6f7d8e-xkp4q`) | Ordinal index (`web-0`, `web-1`) |
| Pod creation | All at once (parallel) | Sequential (ordered) |
| Pod deletion | Any order | Reverse ordinal order |
| Network identity | Shared Service IP | Per-pod DNS name |
| Storage | Shared PVC (or none) | Per-pod PVC via `volumeClaimTemplates` |
| PVC lifecycle | Manual | Auto-created, manually deleted |
| Use case | Stateless apps | Databases, caches, consensus systems |
| Scaling | Fast (parallel) | Slower (sequential) |

### When to use each

| Workload | Use |
|----------|-----|
| Web servers, APIs | Deployment |
| Redis, PostgreSQL, MongoDB | StatefulSet |
| Kafka, ZooKeeper, etcd | StatefulSet |
| Background workers | Deployment (usually) |
| Elasticsearch | StatefulSet |

---

## 8. The Honest Trade-Offs

Running databases on Kubernetes is possible but comes with complexity. Let's be honest about when it makes sense and when it doesn't.

### When to run databases on Kubernetes

- **Development and testing** — spin up a database for each test run, tear it down after
- **Small-scale production** — your team already manages the cluster and understands StatefulSets
- **Cloud-native architectures** — everything runs on Kubernetes, and you want a unified management plane
- **Specific databases designed for Kubernetes** — CockroachDB, TiDB, and Vitess were built for orchestrated environments

### When NOT to run databases on Kubernetes

- **If managed services are available** — AWS RDS, GCP Cloud SQL, Azure Database are battle-tested, handle backups, failover, and scaling without you managing StatefulSets
- **If your team doesn't understand Kubernetes storage** — PVC misconfigurations can lead to data loss
- **If you need extreme performance** — the storage abstraction layer adds some overhead
- **If operational burden matters** — backups, failover, upgrade procedures are all on you

### The rule of thumb

> If you're choosing between running PostgreSQL on a StatefulSet and using a managed database service, choose the managed service unless you have a specific reason not to. The cost of operational complexity outweighs the benefit of "everything on Kubernetes."

For learning and development — which is what we're doing — StatefulSets are perfect. They teach you the concepts without the operational risk.

---

## Cleanup

```sh
kubectl delete statefulset redis
kubectl delete service redis
kubectl delete pvc --all
```

---

## What Problem Did We Just Solve?

We learned how to run stateful workloads on Kubernetes:

1. **StatefulSets** provide stable pod names, ordered deployment, and per-pod storage — the three things databases need that Deployments don't provide
2. **Headless Services** give each pod a unique DNS name — enabling clients to address specific replicas
3. **volumeClaimTemplates** create a separate PVC for each pod — no shared storage, no data corruption
4. **Ordered scaling** ensures primaries start before replicas and replicas stop before primaries
5. **PVCs persist across pod restarts** — and even across scaling operations

### What would break in production?

- We deployed standalone Redis instances, not a Redis cluster. Production Redis would need sentinel or cluster mode for high availability, with additional configuration for replication.
- We have **no backup strategy**. StatefulSet PVCs persist data, but they don't protect against accidental `FLUSHALL` or storage failures.
- **Monitoring** is critical for databases. You'd want metrics on memory usage, connections, replication lag, and slow queries — none of which we've set up.

---

## What's Next?

In **Part 8**, we'll tackle **Helm and Chart Packaging** — how to stop copy-pasting YAML files and instead package, template, and share Kubernetes configurations. We'll install community charts and create our own.
