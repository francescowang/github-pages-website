This is Part 6 of Series 2 — a 10-part intermediate Kubernetes series using Minikube. We explore Jobs, CronJobs, and Init Containers — workloads that run to completion rather than forever.

---

## The Series

1. [Rolling Updates and Rollbacks](/blog/view.html?slug=minikube-series-02-01-rolling-updates-rollbacks&folder=tutorials)
2. [Namespaces and Resource Quotas](/blog/view.html?slug=minikube-series-02-02-namespaces-resource-quotas&folder=tutorials)
3. [Secrets and Configuration](/blog/view.html?slug=minikube-series-02-03-secrets-and-configuration&folder=tutorials)
4. [Persistent Storage](/blog/view.html?slug=minikube-series-02-04-persistent-storage&folder=tutorials)
5. [Networking from the Inside](/blog/view.html?slug=minikube-series-02-05-networking-internals&folder=tutorials)
6. **Jobs, CronJobs, and Batch Work** ← you are here
7. [StatefulSets and Databases](/blog/view.html?slug=minikube-series-02-07-statefulsets-databases&folder=tutorials)
8. [Helm and Chart Packaging](/blog/view.html?slug=minikube-series-02-08-helm-chart-packaging&folder=tutorials)
9. [RBAC and Security](/blog/view.html?slug=minikube-series-02-09-rbac-security&folder=tutorials)
10. [Debugging Like an SRE](/blog/view.html?slug=minikube-series-02-10-debugging-like-an-sre&folder=tutorials)

---

## Introduction

Every workload we've deployed so far has been a Deployment — a long-running process that should never stop. Web servers, APIs, frontends — they run until you tell them to stop.

But not everything is a web server. Real systems also need:
- **Database migrations** that run once and exit
- **Data processing jobs** that crunch numbers and finish
- **Report generation** that runs on a schedule
- **Backup scripts** that run nightly
- **Startup checks** that must complete before the main app starts

Kubernetes handles these with **Jobs** (run-to-completion), **CronJobs** (scheduled), and **Init Containers** (pre-start tasks). They use the same pod infrastructure as Deployments but with fundamentally different lifecycle semantics.

---

## Prerequisites

- Minikube running: `minikube start --driver=docker`
- Clean slate:

```sh
kubectl delete all --all
```

---

## 1. Jobs: Run-to-Completion

A **Job** creates one or more pods that run a task and then exit. Unlike a Deployment (which restarts pods that exit), a Job considers a successful exit as mission accomplished.

### Your first Job

Create `~/k8s-tutorial-2/job.yaml`:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: hello-job
spec:
  template:
    spec:
      containers:
      - name: worker
        image: busybox
        command: ["sh", "-c", "echo 'Processing data...'; sleep 5; echo 'Done!'"]
      restartPolicy: Never
```

```sh
kubectl apply -f ~/k8s-tutorial-2/job.yaml
```

### Watching the Job

```sh
kubectl get jobs --watch
```

```
NAME        COMPLETIONS   DURATION   AGE
hello-job   0/1           5s         5s
hello-job   1/1           8s         8s
```

**COMPLETIONS** shows `1/1` — the job completed successfully. The pod ran, the command exited with code 0, and Kubernetes considers the job done.

```sh
kubectl get pods
```

```
NAME              READY   STATUS      RESTARTS   AGE
hello-job-xxxxx   0/1     Completed   0          15s
```

The pod shows **Completed**, not Running. It's finished. The pod is kept around (not deleted) so you can read its logs.

```sh
kubectl logs job/hello-job
```

```
Processing data...
Done!
```

### Key difference from Deployments

| Behaviour | Deployment | Job |
|-----------|-----------|-----|
| Pod exits successfully | Restart it (unintended exit) | Celebrate (task complete) |
| Pod exits with error | Restart it | Retry (up to backoffLimit) |
| Goal | Keep N pods running forever | Run task to completion |
| restartPolicy | Always | Never or OnFailure |

**`restartPolicy: Never`** is required for Jobs. Deployments use `Always` (which is the default). If you accidentally use `Always` in a Job, Kubernetes rejects it.

### The difference between Never and OnFailure

- **`Never`** — if the pod fails, create a **new** pod for the retry (old failed pod kept for debugging)
- **`OnFailure`** — if the pod fails, **restart the same pod** (in-place restart, same node)

Use `Never` when you want to inspect failed pods. Use `OnFailure` to avoid accumulating failed pod objects.

---

## 2. Job Failure and Retry

What happens when a Job fails? Let's find out.

Create `~/k8s-tutorial-2/failing-job.yaml`:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: flaky-job
spec:
  backoffLimit: 3
  template:
    spec:
      containers:
      - name: worker
        image: busybox
        command: ["sh", "-c", "echo 'Attempting...'; exit 1"]
      restartPolicy: Never
```

```sh
kubectl apply -f ~/k8s-tutorial-2/failing-job.yaml
```

Watch the pods:

```sh
kubectl get pods --watch
```

```
NAME              READY   STATUS   RESTARTS   AGE
flaky-job-aaaaa   0/1     Error    0          5s
flaky-job-bbbbb   0/1     Error    0          20s
flaky-job-ccccc   0/1     Error    0          50s
flaky-job-ddddd   0/1     Error    0          90s
```

Four pods were created (initial + 3 retries). Each one failed. After exhausting `backoffLimit: 3`, the Job is marked as failed.

```sh
kubectl get jobs
```

```
NAME        COMPLETIONS   DURATION   AGE
flaky-job   0/1           2m         2m
```

`0/1` completions — the job never succeeded.

### Backoff behaviour

Kubernetes doesn't retry immediately. It uses **exponential backoff**: the delay between retries doubles each time (10s, 20s, 40s, capped at 6 minutes). This prevents a failing job from hammering the cluster.

```
Retry timeline:

Attempt 1: immediate
         │ wait ~10s
Attempt 2: +10s
         │ wait ~20s
Attempt 3: +30s
         │ wait ~40s
Attempt 4: +70s
         │ backoffLimit reached → Job failed
```

### activeDeadlineSeconds

Set an absolute timeout for the entire Job:

```yaml
spec:
  activeDeadlineSeconds: 60    # Job must complete within 60 seconds
  backoffLimit: 3
```

If the job hasn't completed after 60 seconds (including all retries), it's terminated regardless of `backoffLimit`.

Clean up:

```sh
kubectl delete job flaky-job
```

---

## 3. Parallel Jobs

Jobs can run multiple pods in parallel — useful for processing a batch of items.

### Completions and parallelism

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: batch-job
spec:
  completions: 5       # Total number of successful completions needed
  parallelism: 2       # Run 2 pods at a time
  template:
    spec:
      containers:
      - name: worker
        image: busybox
        command: ["sh", "-c", "echo \"Processing item on $(hostname)\"; sleep 3; echo 'Done'"]
      restartPolicy: Never
```

```sh
kubectl apply -f batch-job.yaml
```

```sh
kubectl get pods --watch
```

You'll see 2 pods start immediately. As each completes, a new one starts, until all 5 completions are done:

```
Time →

Pod 1: [████████]
Pod 2: [████████]
Pod 3:           [████████]
Pod 4:           [████████]
Pod 5:                     [████████]

parallelism=2: at most 2 running at once
completions=5: total of 5 must succeed
```

```sh
kubectl get jobs
```

```
NAME        COMPLETIONS   DURATION   AGE
batch-job   5/5           12s        15s
```

All 5 completions finished.

### When to use which configuration

| Configuration | Use case |
|--------------|----------|
| `completions: 1, parallelism: 1` | Single task (default) |
| `completions: N, parallelism: 1` | Sequential processing (one at a time) |
| `completions: N, parallelism: M` | Parallel batch processing |
| `completions: unset, parallelism: M` | Work queue (pods coordinate themselves) |

Clean up:

```sh
kubectl delete job batch-job
```

---

## 4. CronJobs: Scheduled Tasks

A **CronJob** creates Jobs on a schedule — like cron on Linux but managed by Kubernetes.

### Creating a CronJob

Create `~/k8s-tutorial-2/cronjob.yaml`:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: heartbeat
spec:
  schedule: "*/1 * * * *"
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 2
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: heartbeat
            image: busybox
            command: ["sh", "-c", "echo \"Heartbeat at $(date)\""]
          restartPolicy: OnFailure
```

```sh
kubectl apply -f ~/k8s-tutorial-2/cronjob.yaml
```

### Cron schedule syntax

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, Sunday=0)
│ │ │ │ │
* * * * *
```

Common examples:

| Schedule | Meaning |
|----------|---------|
| `*/1 * * * *` | Every minute |
| `0 * * * *` | Every hour (on the hour) |
| `0 2 * * *` | Daily at 2am |
| `0 0 * * 0` | Weekly on Sunday at midnight |
| `0 0 1 * *` | Monthly on the 1st at midnight |

### Watching the CronJob

Wait a minute or two, then:

```sh
kubectl get cronjobs
```

```
NAME        SCHEDULE      SUSPEND   ACTIVE   LAST SCHEDULE   AGE
heartbeat   */1 * * * *   False     0        30s             2m
```

```sh
kubectl get jobs
```

```
NAME                   COMPLETIONS   DURATION   AGE
heartbeat-1714200000   1/1           3s         90s
heartbeat-1714200060   1/1           2s         30s
```

A new Job is created every minute. The number suffix is the Unix timestamp of the scheduled time.

```sh
kubectl logs job/heartbeat-1714200060
```

```
Heartbeat at Sun Apr 27 12:01:00 UTC 2026
```

### History limits

```yaml
successfulJobsHistoryLimit: 3    # Keep the last 3 successful jobs
failedJobsHistoryLimit: 2         # Keep the last 2 failed jobs
```

Kubernetes automatically cleans up old jobs beyond these limits. Without this, completed jobs would accumulate endlessly.

### concurrencyPolicy

What happens if a Job hasn't finished when the next scheduled run is due?

```yaml
spec:
  concurrencyPolicy: Forbid    # Skip the new run if previous is still active
```

| Policy | Behaviour |
|--------|----------|
| `Allow` (default) | Start the new job even if the previous is still running |
| `Forbid` | Skip the new job if any previous job is still active |
| `Replace` | Kill the running job and start a new one |

`Forbid` is the safest for most cases — it prevents overlapping runs.

### Suspending a CronJob

Temporarily stop scheduling without deleting:

```sh
kubectl patch cronjob heartbeat -p '{"spec":{"suspend":true}}'
```

Resume:

```sh
kubectl patch cronjob heartbeat -p '{"spec":{"suspend":false}}'
```

### Manually triggering a CronJob

Sometimes you want to run a scheduled job immediately:

```sh
kubectl create job heartbeat-manual --from=cronjob/heartbeat
```

This creates a one-off Job from the CronJob's template.

Clean up:

```sh
kubectl delete cronjob heartbeat
```

---

## 5. Init Containers

An **Init Container** runs before the main containers in a pod. It must complete successfully before the main containers start. If it fails, Kubernetes retries it (respecting the pod's restart policy).

### Why Init Containers?

Common use cases:
- **Wait for a dependency** — don't start the API until the database is reachable
- **Run database migrations** — apply schema changes before the app starts
- **Download configuration** — fetch config from a remote source
- **Set up permissions** — create directories with the right ownership

### Example: Waiting for a Service

Create `~/k8s-tutorial-2/init-container.yaml`:

```yaml
# A Service we want to wait for
apiVersion: v1
kind: Service
metadata:
  name: database
spec:
  type: ClusterIP
  selector:
    app: database
  ports:
  - port: 5432
---
# App that waits for the database Service to be resolvable
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-with-init
spec:
  replicas: 1
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      initContainers:
      - name: wait-for-db
        image: busybox
        command: ["sh", "-c", "echo 'Waiting for database...'; until nslookup database.default.svc.cluster.local; do echo 'DB not found, retrying...'; sleep 2; done; echo 'Database is available!'"]
      containers:
      - name: api
        image: nginx:alpine
        ports:
        - containerPort: 80
```

```sh
kubectl apply -f ~/k8s-tutorial-2/init-container.yaml
```

### Watching the Init Container

```sh
kubectl get pods --watch
```

```
NAME                            READY   STATUS     RESTARTS   AGE
api-with-init-xxxxxxxxxx-aaaaa  0/1     Init:0/1   0          5s
```

The pod is stuck in `Init:0/1` — the init container is running but hasn't completed yet. Why? Because the `database` Service exists but has no pods backing it (no Deployment with `app: database` label). DNS resolves the name, but the init container's `nslookup` should succeed since the Service exists.

Let's check:

```sh
kubectl logs api-with-init-xxxxxxxxxx-aaaaa -c wait-for-db
```

```
Waiting for database...
Server:    10.96.0.10
Address:   10.96.0.10:53

Name:   database.default.svc.cluster.local
Address: 10.96.xxx.xxx

Database is available!
```

If it succeeded, the main container should now be starting. Check the pod:

```sh
kubectl get pods
```

```
NAME                            READY   STATUS    RESTARTS   AGE
api-with-init-xxxxxxxxxx-aaaaa  1/1     Running   0          30s
```

The init container completed, and the main `nginx` container started.

### Init Container lifecycle

```
Pod starts
     │
     ↓
Init Container 1 runs
     │
     ├── Success → Init Container 2 runs (if any)
     │                  │
     │                  ├── Success → Main containers start
     │                  │
     │                  └── Failure → Retry init container 2
     │
     └── Failure → Retry init container 1
```

Key rules:
- Init containers run **sequentially** (one at a time, in order)
- Each must **succeed** before the next starts
- If an init container fails, Kubernetes **retries** (subject to restartPolicy)
- Init containers have **their own image** — they can use tools your main container doesn't have
- Init containers **don't run again** after the main containers start (even on restart)

### Multiple Init Containers

You can have multiple init containers that run in sequence:

```yaml
initContainers:
- name: wait-for-db
  image: busybox
  command: ["sh", "-c", "until nslookup database; do sleep 2; done"]
- name: run-migration
  image: myapp-migrator:latest
  command: ["./migrate", "--up"]
- name: seed-cache
  image: busybox
  command: ["sh", "-c", "wget -qO /cache/data.json http://config-service/cache-seed"]
```

They run in order: wait for database → run migration → seed cache → main app starts.

---

## 6. Automatic Cleanup: TTL Controller

Completed Jobs stick around (for log inspection) until you manually delete them. The **TTL-after-finished controller** automates cleanup:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: cleanup-demo
spec:
  ttlSecondsAfterFinished: 60    # Delete 60 seconds after completion
  template:
    spec:
      containers:
      - name: worker
        image: busybox
        command: ["echo", "Quick task"]
      restartPolicy: Never
```

After the Job finishes, Kubernetes waits 60 seconds then deletes the Job and its pod automatically. This prevents clutter from accumulating in the cluster.

---

## 7. Practical Exercise: Scheduled Backup Simulation

Let's combine what we've learned: a CronJob that backs up data from a PVC.

```yaml
# backup-cronjob.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: app-data
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 100Mi
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: backup
spec:
  schedule: "*/2 * * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: busybox
            command:
            - sh
            - -c
            - |
              echo "Starting backup at $(date)"
              cp -r /data /backup/
              ls -la /backup/
              echo "Backup complete"
            volumeMounts:
            - name: data
              mountPath: /data
              readOnly: true
            - name: backup
              mountPath: /backup
          volumes:
          - name: data
            persistentVolumeClaim:
              claimName: app-data
          - name: backup
            emptyDir: {}
          restartPolicy: OnFailure
```

```sh
kubectl apply -f backup-cronjob.yaml
```

This CronJob:
- Runs every 2 minutes
- Mounts the application's PVC as read-only
- Copies data to a backup location
- Won't overlap with itself (`concurrencyPolicy: Forbid`)
- Keeps the last 3 successful and 1 failed job for inspection

---

## Cleanup

```sh
kubectl delete all --all
kubectl delete pvc --all
kubectl delete cronjob --all
```

---

## What Problem Did We Just Solve?

We learned that Kubernetes handles more than just long-running servers:

1. **Jobs** run tasks to completion — database migrations, data processing, one-off scripts
2. **CronJobs** run tasks on a schedule — backups, reports, housekeeping
3. **Parallel Jobs** process batches efficiently — multiple pods working simultaneously
4. **Init Containers** run pre-start tasks — dependency checks, migrations, cache warming
5. **TTL cleanup** prevents completed jobs from cluttering the cluster

The key insight: **the pod is the universal building block.** Whether it runs forever (Deployment), runs once (Job), runs on a schedule (CronJob), or runs as a precondition (Init Container) — it's all pods with different lifecycle controllers.

### What would break in production?

- Our CronJobs use simple `busybox` commands. Real backup jobs would need proper tooling — database clients, cloud SDKs, error handling.
- We haven't discussed **Job deadlines for CronJobs** (`startingDeadlineSeconds`). If the scheduler misses a CronJob run window (e.g., the cluster was down), it could run multiple times when it recovers. Setting `startingDeadlineSeconds` limits this catch-up behaviour.
- Init Containers that depend on external services (databases, APIs) should have **timeouts**. Without them, a pod could wait indefinitely if the dependency is permanently down.

---

## What's Next?

In **Part 7**, we'll tackle **StatefulSets and Databases** — how to run workloads that need stable identities, ordered deployment, and per-pod persistent storage. We'll deploy Redis as a hands-on example.
