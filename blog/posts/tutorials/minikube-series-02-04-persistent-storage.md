This is Part 4 of Series 2 — a 10-part intermediate Kubernetes series using Minikube. We give our applications storage that survives pod restarts using Volumes, PersistentVolumes, and PersistentVolumeClaims.

---

## The Series

1. [Rolling Updates and Rollbacks](/blog/view.html?slug=minikube-series-02-01-rolling-updates-rollbacks&folder=tutorials)
2. [Namespaces and Resource Quotas](/blog/view.html?slug=minikube-series-02-02-namespaces-resource-quotas&folder=tutorials)
3. [Secrets and Configuration](/blog/view.html?slug=minikube-series-02-03-secrets-and-configuration&folder=tutorials)
4. **Persistent Storage** ← you are here
5. [Networking from the Inside](/blog/view.html?slug=minikube-series-02-05-networking-internals&folder=tutorials)
6. [Jobs, CronJobs, and Batch Work](/blog/view.html?slug=minikube-series-02-06-jobs-cronjobs-batch&folder=tutorials)
7. [StatefulSets and Databases](/blog/view.html?slug=minikube-series-02-07-statefulsets-databases&folder=tutorials)
8. [Helm and Chart Packaging](/blog/view.html?slug=minikube-series-02-08-helm-chart-packaging&folder=tutorials)
9. [RBAC and Security](/blog/view.html?slug=minikube-series-02-09-rbac-security&folder=tutorials)
10. [Debugging Like an SRE](/blog/view.html?slug=minikube-series-02-10-debugging-like-an-sre&folder=tutorials)

---

## Introduction

In Series 1, every application we deployed was stateless. When a pod was deleted, everything inside it — files, logs, data — vanished. That's fine for web servers serving static content, but useless for databases, file uploads, caches, or anything that needs to remember things.

In this part, we learn how Kubernetes handles persistent storage. The model has three layers — Volumes, PersistentVolumes, and PersistentVolumeClaims — and it can feel overwhelming at first. But the design is elegant: it separates *what storage you need* from *how that storage is provided*, letting developers request storage without knowing (or caring) about the underlying infrastructure.

---

## Prerequisites

- Minikube running: `minikube start --driver=docker`
- Clean slate:

```sh
kubectl delete all --all
```

---

## 1. The Problem: Ephemeral Filesystems

Let's prove that pod storage is ephemeral.

```sh
# Create a pod, write a file, verify it exists
kubectl run writer --image=busybox --restart=Never -- sh -c "echo 'important data' > /tmp/data.txt; sleep 3600"

# Wait for it to start
kubectl wait --for=condition=Ready pod/writer

# Read the file
kubectl exec writer -- cat /tmp/data.txt
```

```
important data
```

Now delete and recreate the pod:

```sh
kubectl delete pod writer
kubectl run writer --image=busybox --restart=Never -- sh -c "cat /tmp/data.txt 2>/dev/null || echo 'FILE NOT FOUND'; sleep 3600"
kubectl wait --for=condition=Ready pod/writer
kubectl logs writer
```

```
FILE NOT FOUND
```

The file is gone. Every new pod starts with a fresh filesystem from the container image. This is by design — pods are ephemeral — but it means we need an explicit mechanism for data that should persist.

```sh
kubectl delete pod writer
```

---

## 2. Volume Types

Kubernetes Volumes attach storage to pods. There are many types, but three matter for learning:

### emptyDir — shared temporary storage

An `emptyDir` volume is created when a pod is assigned to a node and exists as long as that pod is running. It's empty initially. When the pod is removed, the data is deleted.

**Use case:** sharing files between containers in the same pod (sidecar patterns).

```yaml
# emptydir-demo.yaml
apiVersion: v1
kind: Pod
metadata:
  name: emptydir-demo
spec:
  containers:
  - name: writer
    image: busybox
    command: ["sh", "-c", "while true; do date >> /shared/log.txt; sleep 5; done"]
    volumeMounts:
    - name: shared-data
      mountPath: /shared
  - name: reader
    image: busybox
    command: ["sh", "-c", "tail -f /shared/log.txt"]
    volumeMounts:
    - name: shared-data
      mountPath: /shared
  volumes:
  - name: shared-data
    emptyDir: {}
```

```sh
kubectl apply -f emptydir-demo.yaml
kubectl wait --for=condition=Ready pod/emptydir-demo
```

Two containers share the same volume. The writer appends timestamps; the reader tails the file:

```sh
kubectl logs emptydir-demo -c reader
```

```
Sun Apr 27 10:00:05 UTC 2026
Sun Apr 27 10:00:10 UTC 2026
Sun Apr 27 10:00:15 UTC 2026
```

Both containers see the same `/shared` directory. But delete the pod and the data is gone — `emptyDir` doesn't persist beyond the pod's lifetime.

```
emptyDir lifecycle:

Pod created → emptyDir created (empty)
Pod running → containers read/write to it
Pod deleted → emptyDir deleted (data lost)
```

```sh
kubectl delete pod emptydir-demo
```

### hostPath — node's filesystem

A `hostPath` volume mounts a directory from the host node into the pod. On Minikube, "the host" is the Minikube Docker container.

```yaml
# hostpath-demo.yaml
apiVersion: v1
kind: Pod
metadata:
  name: hostpath-demo
spec:
  containers:
  - name: app
    image: busybox
    command: ["sh", "-c", "echo 'saved on host' > /data/test.txt; sleep 3600"]
    volumeMounts:
    - name: host-data
      mountPath: /data
  volumes:
  - name: host-data
    hostPath:
      path: /tmp/k8s-demo
      type: DirectoryOrCreate
```

```sh
kubectl apply -f hostpath-demo.yaml
kubectl wait --for=condition=Ready pod/hostpath-demo
```

The data is stored on the Minikube node's filesystem. Verify:

```sh
minikube ssh -- cat /tmp/k8s-demo/test.txt
```

```
saved on host
```

Delete the pod and check again:

```sh
kubectl delete pod hostpath-demo
minikube ssh -- cat /tmp/k8s-demo/test.txt
```

```
saved on host
```

The data survived the pod deletion because it lives on the node, not inside the pod.

**Warning:** `hostPath` is fine for Minikube experiments but dangerous in production:
- Data is tied to a specific node — if the pod is rescheduled to a different node, it won't find its data
- Multiple pods writing to the same hostPath can corrupt data
- It bypasses Kubernetes' storage abstractions

### PersistentVolumeClaim — the proper way

This is how you should do persistent storage in Kubernetes. It's a three-part model that separates concerns:

```
Developer (you)              Cluster Admin / Automation       Infrastructure
┌──────────────────┐        ┌──────────────────────┐        ┌──────────────┐
│ PersistentVolume │        │ PersistentVolume     │        │ Actual disk  │
│    Claim (PVC)   │───────→│    (PV)              │───────→│ (local, NFS, │
│                  │        │                      │        │  EBS, etc.)  │
│ "I need 1Gi of   │        │ "Here's 1Gi of       │        │              │
│  storage"        │        │  storage, provisioned │        │              │
│                  │        │  by StorageClass X"   │        │              │
└──────────────────┘        └──────────────────────┘        └──────────────┘
```

**PersistentVolumeClaim (PVC):** "I need storage with these characteristics" (size, access mode). Created by the developer.

**PersistentVolume (PV):** "Here is actual storage" (a directory, a network disk, a cloud volume). Created by an admin or provisioned automatically.

**StorageClass:** "Here's how I provision new PVs" (the template for creating storage on demand).

### An analogy

Think of it like renting a flat:

- **PVC** = your requirements: "I need a 2-bedroom flat with parking"
- **StorageClass** = the estate agent: "I can find flats in these buildings"
- **PV** = the actual flat: "Here's flat 42B on Baker Street"

You (the developer) describe what you need. The estate agent (StorageClass) finds or creates something that matches. The actual flat (PV) is what you end up using. You don't need to know which building it's in — you just need the key.

---

## 3. Using PersistentVolumeClaims

Minikube comes with a default StorageClass that provisions storage automatically. Let's use it.

### Check the default StorageClass

```sh
kubectl get storageclass
```

```
NAME                 PROVISIONER                RECLAIMPOLICY   VOLUMEBINDINGMODE
standard (default)   k8s.io/minikube-hostpath   Delete          Immediate
```

The `standard` StorageClass uses Minikube's hostpath provisioner. When a PVC is created, this provisioner automatically creates a PV backed by a directory on the Minikube node.

### Create a PVC

Create `~/k8s-tutorial-2/pvc-demo.yaml`:

```yaml
# PersistentVolumeClaim
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: app-data
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
---
# Pod that uses the PVC
apiVersion: apps/v1
kind: Deployment
metadata:
  name: data-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: data-app
  template:
    metadata:
      labels:
        app: data-app
    spec:
      containers:
      - name: app
        image: busybox
        command: ["sh", "-c", "echo \"Written at $(date)\" >> /data/log.txt; cat /data/log.txt; sleep 3600"]
        volumeMounts:
        - name: data
          mountPath: /data
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: app-data
```

### Breaking down the PVC

```yaml
spec:
  accessModes:
  - ReadWriteOnce         # This volume can be mounted read-write by ONE node
  resources:
    requests:
      storage: 1Gi        # We need at least 1 gibibyte
```

**Access modes:**

| Mode | Short | Meaning |
|------|-------|---------|
| `ReadWriteOnce` | RWO | One node can mount read-write |
| `ReadOnlyMany` | ROX | Many nodes can mount read-only |
| `ReadWriteMany` | RWX | Many nodes can mount read-write |

RWO is the most common and the only one Minikube's default provisioner supports. RWX requires specialised storage (NFS, CephFS) — it's what you'd need if multiple pods on different nodes need to write to the same volume.

### Deploy and verify

```sh
kubectl apply -f ~/k8s-tutorial-2/pvc-demo.yaml
```

Check the PVC status:

```sh
kubectl get pvc
```

```
NAME       STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   AGE
app-data   Bound    pvc-abc12345-def6-7890-ghij-klmnopqrstuv   1Gi        RWO            standard       10s
```

**STATUS: Bound** means the PVC found (or provisioned) a matching PV and is ready to use.

Check the automatically created PV:

```sh
kubectl get pv
```

```
NAME                                       CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS   CLAIM              STORAGECLASS
pvc-abc12345-def6-7890-ghij-klmnopqrstuv   1Gi        RWO            Delete           Bound    default/app-data   standard
```

The StorageClass automatically created a PV and bound it to our PVC. We didn't have to create the PV manually.

Check the app's output:

```sh
kubectl logs deployment/data-app
```

```
Written at Sun Apr 27 10:30:00 UTC 2026
```

---

## 4. Proving Persistence

The whole point: data survives pod deletion.

### Delete the pod (not the deployment)

```sh
kubectl delete pod -l app=data-app
```

The Deployment creates a new pod. Check its logs:

```sh
kubectl logs deployment/data-app
```

```
Written at Sun Apr 27 10:30:00 UTC 2026
Written at Sun Apr 27 10:31:15 UTC 2026
```

Two lines. The first was written by the original pod. The second by the replacement. The PVC kept the data safe between pod restarts.

```
Timeline:

Pod 1 created → writes "Written at 10:30:00" to /data/log.txt
                            ↓
Pod 1 deleted              PVC (app-data) persists
                            ↓
Pod 2 created → reads "Written at 10:30:00" from /data/log.txt
              → appends "Written at 10:31:15"
```

### Delete the Deployment (PVC survives)

```sh
kubectl delete deployment data-app
kubectl get pvc
```

```
NAME       STATUS   VOLUME    CAPACITY   ACCESS MODES   STORAGECLASS   AGE
app-data   Bound    pvc-...   1Gi        RWO            standard       5m
```

The PVC still exists. The data is still there. You can create a new Deployment that references the same PVC and it will find the old data.

---

## 5. Reclaim Policies

What happens to the PV when the PVC is deleted? The **reclaim policy** controls this:

| Policy | What happens | When to use |
|--------|-------------|-------------|
| `Delete` | PV and underlying storage are deleted | Development, temporary data |
| `Retain` | PV is kept (data preserved) but not available for new claims | Production, valuable data |

Minikube's default StorageClass uses `Delete`. In production, you'd typically use `Retain` for databases and important data.

### Testing the Delete policy

```sh
kubectl delete pvc app-data
kubectl get pv
```

The PV is gone — and so is the data. The `Delete` reclaim policy cleaned everything up.

### Creating a StorageClass with Retain

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: retain-storage
provisioner: k8s.io/minikube-hostpath
reclaimPolicy: Retain
```

```sh
kubectl apply -f storageclass-retain.yaml
```

Now PVCs using `storageClassName: retain-storage` will keep their PVs even after the PVC is deleted.

---

## 6. Practical Exercise: Persistent Counter

Let's build a simple application that demonstrates persistence through multiple pod restarts.

Create `~/k8s-tutorial-2/counter.yaml`:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: counter-data
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 100Mi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: counter
spec:
  replicas: 1
  selector:
    matchLabels:
      app: counter
  template:
    metadata:
      labels:
        app: counter
    spec:
      containers:
      - name: counter
        image: busybox
        command:
        - sh
        - -c
        - |
          FILE=/data/count.txt
          if [ ! -f "$FILE" ]; then echo 0 > "$FILE"; fi
          COUNT=$(cat "$FILE")
          COUNT=$((COUNT + 1))
          echo $COUNT > "$FILE"
          echo "Boot #$COUNT"
          sleep 3600
        volumeMounts:
        - name: data
          mountPath: /data
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: counter-data
```

```sh
kubectl apply -f ~/k8s-tutorial-2/counter.yaml
```

```sh
kubectl logs deployment/counter
```

```
Boot #1
```

Delete the pod and check again:

```sh
kubectl delete pod -l app=counter
sleep 5
kubectl logs deployment/counter
```

```
Boot #2
```

Again:

```sh
kubectl delete pod -l app=counter
sleep 5
kubectl logs deployment/counter
```

```
Boot #3
```

Each restart increments the counter because the PVC preserves `/data/count.txt` between pods. Without the PVC, every restart would show "Boot #1".

---

## 7. Volume Capacity and Expansion

### Checking actual usage

```sh
kubectl exec deployment/counter -- df -h /data
```

```
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1       ...   ...  ...   ...  /data
```

### Expanding a PVC

Some StorageClasses support volume expansion. Check if yours does:

```sh
kubectl get storageclass standard -o yaml | grep allowVolumeExpansion
```

If `allowVolumeExpansion: true`, you can increase the PVC size:

```sh
kubectl patch pvc counter-data -p '{"spec":{"resources":{"requests":{"storage":"2Gi"}}}}'
```

**You can only increase the size, never decrease it.** The expansion might require a pod restart, depending on the storage provider.

---

## 8. Summary: The Full Storage Stack

```
Developer writes:                        Kubernetes handles:
┌─────────────────────────┐
│ Deployment YAML         │
│   volumes:              │
│   - name: data          │
│     persistentVolumeClaim│
│       claimName: my-pvc │    ←── references
│   volumeMounts:         │              │
│   - name: data          │              ↓
│     mountPath: /data    │    ┌─────────────────────────┐
└─────────────────────────┘    │ PVC: my-pvc             │
                               │   storage: 1Gi          │
                               │   accessModes: RWO      │
                               └────────────┬────────────┘
                                            │ binds to
                                            ↓
                               ┌─────────────────────────┐
                               │ PV (auto-provisioned)   │
                               │   capacity: 1Gi         │
                               │   reclaimPolicy: Delete  │
                               └────────────┬────────────┘
                                            │ backed by
                                            ↓
                               ┌─────────────────────────┐
                               │ Actual storage          │
                               │ (Minikube: hostPath)    │
                               │ (Cloud: EBS, GCE PD)   │
                               └─────────────────────────┘
```

---

## Cleanup

```sh
kubectl delete all --all
kubectl delete pvc --all
```

---

## What Problem Did We Just Solve?

We gave our applications memory that survives restarts:

1. **emptyDir** provides temporary shared storage within a pod — useful for sidecar patterns but lost when the pod is deleted
2. **hostPath** stores data on the node's filesystem — persists beyond the pod but ties data to a specific node
3. **PVC/PV** is the proper abstraction — decouples storage requests from storage provisioning, survives pod restarts, and works across different infrastructure
4. **StorageClasses** automate PV provisioning — developers request storage, Kubernetes creates it
5. **Reclaim policies** control what happens to data when a PVC is deleted — Delete for temporary data, Retain for important data

### What would break in production?

- Minikube's storage provisioner uses `hostPath` under the hood — not suitable for multi-node clusters. Production clusters use network-attached storage (AWS EBS, GCE Persistent Disk, NFS, Ceph) that's accessible from any node.
- We haven't discussed **backups**. A PVC doesn't protect against accidental data deletion or corruption. Production systems need snapshot and backup strategies.
- RWO volumes can only be mounted by pods on a single node. If your app scales across nodes and all pods need to write to the same volume, you need RWX storage — which is significantly more complex and expensive.

---

## What's Next?

In **Part 5**, we'll look at **Kubernetes Networking from the Inside** — how pod-to-pod communication actually works, what kube-proxy does with iptables rules, how CoreDNS resolves service names, and how Network Policies restrict which pods can talk to each other.
