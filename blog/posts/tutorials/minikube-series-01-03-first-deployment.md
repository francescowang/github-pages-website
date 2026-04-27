This is Part 3 of a 10-part series on Kubernetes using Minikube. We deploy our first application and learn about Pods and Deployments.

---

## The Series

1. [What is Kubernetes?](/blog/view.html?slug=minikube-series-01-01-what-is-kubernetes&folder=tutorials)
2. [Setting Up Your Local Cluster](/blog/view.html?slug=minikube-series-01-02-setting-up-minikube&folder=tutorials)
3. **Your First Deployment** ← you are here
4. [Exposing Your App](/blog/view.html?slug=minikube-series-01-04-exposing-your-app&folder=tutorials)
5. [YAML and Declarative Configuration](/blog/view.html?slug=minikube-series-01-05-yaml-declarative-config&folder=tutorials)
6. [Scaling and Self-Healing](/blog/view.html?slug=minikube-series-01-06-scaling-and-self-healing&folder=tutorials)
7. [Multi-Service Architecture](/blog/view.html?slug=minikube-series-01-07-multi-service-architecture&folder=tutorials)
8. [Service-to-Service Communication](/blog/view.html?slug=minikube-series-01-08-service-to-service-communication&folder=tutorials)
9. [Ingress and HTTP Routing](/blog/view.html?slug=minikube-series-01-09-ingress-http-routing&folder=tutorials)
10. [Production Readiness](/blog/view.html?slug=minikube-series-01-10-production-readiness&folder=tutorials)

---

## Introduction

Your cluster is running, but it's empty — just the Kubernetes system components ticking away in the background. Time to deploy something.

In this part, we'll deploy a simple web server and explore two fundamental Kubernetes concepts: **Pods** and **Deployments**. By the end, you'll have an application running inside your cluster and an understanding of how Kubernetes manages it.

---

## Prerequisites

- Minikube running (`minikube status` should show "Running")
- If your cluster is stopped, start it: `minikube start --driver=docker`

---

## 1. Creating a Deployment

Let's deploy an application. We'll use `echoserver`, a lightweight web server that echoes back information about each request it receives — useful for testing.

```sh
kubectl create deployment hello-world --image=registry.k8s.io/echoserver:1.10
```

That's it. One command, and Kubernetes will:

1. Create a **Deployment** named `hello-world`
2. The Deployment creates a **ReplicaSet** (we'll cover this in Part 6)
3. The ReplicaSet creates a **Pod**
4. The Pod downloads and runs the `echoserver` container image

```
kubectl create deployment
        ↓
  ┌──────────────┐
  │  Deployment  │  ← "I want 1 replica of echoserver"
  │  hello-world │
  └──────┬───────┘
         ↓
  ┌──────────────┐
  │  ReplicaSet  │  ← "I'll maintain exactly 1 pod"
  └──────┬───────┘
         ↓
  ┌──────────────┐
  │     Pod      │  ← the actual running container
  │  echoserver  │
  └──────────────┘
```

### What happened behind the scenes?

When you ran that command:

1. `kubectl` sent a request to the **API Server**: "Create a Deployment called hello-world with image echoserver:1.10"
2. The API Server stored this in **etcd** (the cluster's database)
3. The **Controller Manager** noticed a new Deployment and created a ReplicaSet
4. The ReplicaSet controller noticed it needed 1 pod and created a Pod object
5. The **Scheduler** noticed an unassigned Pod and assigned it to the `minikube` node
6. The **kubelet** on the node noticed a new Pod assigned to it, pulled the container image, and started the container

All of this happened in seconds, automatically. You described what you wanted (a deployment), and Kubernetes figured out how to make it happen.

---

## 2. Checking What's Running

### View the Deployment

```sh
kubectl get deployments
```

```
NAME          READY   UP-TO-DATE   AVAILABLE   AGE
hello-world   1/1     1            1           30s
```

**Breaking this down:**
- **READY 1/1** — 1 out of 1 desired pods are running
- **UP-TO-DATE** — 1 pod is running the latest version
- **AVAILABLE** — 1 pod is ready to serve traffic

### View the Pod

```sh
kubectl get pods
```

```
NAME                           READY   STATUS    RESTARTS   AGE
hello-world-xxxxxxxxxx-xxxxx   1/1     Running   0          45s
```

The pod name looks odd — `hello-world-xxxxxxxxxx-xxxxx`. That's deliberate. Kubernetes generates unique names because:
- Pods are **ephemeral** — they can be replaced at any time
- You might have multiple replicas — each needs a unique name
- The name format is: `<deployment>-<replicaset-hash>-<pod-hash>`

You should never rely on a pod's name staying the same. This is a crucial mental shift from traditional server management.

### Understanding Pod status

The **STATUS** column tells you what the pod is doing:

| Status | Meaning |
|--------|---------|
| `Pending` | Pod accepted but not yet scheduled to a node |
| `ContainerCreating` | Node is pulling the container image |
| `Running` | Container is running |
| `Completed` | Container finished successfully (for batch jobs) |
| `CrashLoopBackOff` | Container keeps crashing and Kubernetes keeps restarting it |
| `Error` | Container exited with an error |

If your pod shows `ContainerCreating`, wait a moment — it's downloading the image. This is normal on first deploy.

---

## 3. Inspecting Your Pod

### Get detailed information

```sh
kubectl describe pod hello-world
```

(This uses a prefix match — it finds any pod starting with "hello-world".)

This produces a lot of output. Here are the important sections:

**Node:** Which node the pod is running on (in our case, `minikube`)

**Containers:** Shows the container name, image, state, and ports

**Events:** A timeline of what happened:
```
Events:
  Type    Reason     Age   From               Message
  ----    ------     ----  ----               -------
  Normal  Scheduled  1m    default-scheduler  Successfully assigned default/hello-world-xxx to minikube
  Normal  Pulling    1m    kubelet            Pulling image "registry.k8s.io/echoserver:1.10"
  Normal  Pulled     55s   kubelet            Successfully pulled image
  Normal  Created    55s   kubelet            Created container echoserver
  Normal  Started    55s   kubelet            Started container echoserver
```

This event log is invaluable for debugging. If your pod isn't running, the events will tell you why — maybe the image doesn't exist, maybe there aren't enough resources, maybe a volume mount failed.

### View container logs

```sh
kubectl logs deployment/hello-world
```

This shows whatever the container is printing to stdout. For the echoserver, you'll see the NGINX startup logs. When we send requests later, each request will appear here.

**Tip:** To follow logs in real time (like `tail -f`):
```sh
kubectl logs deployment/hello-world --follow
```

Press `Ctrl+C` to stop following.

---

## 4. Pods vs Deployments: The Crucial Difference

You might wonder: why not just create a pod directly? Why do we need a Deployment?

### Creating a pod directly (don't do this)

You *can* create a standalone pod:

```sh
kubectl run lonely-pod --image=registry.k8s.io/echoserver:1.10
```

This creates a single pod. But here's the problem:

```sh
# Delete the pod
kubectl delete pod lonely-pod
```

It's gone. Forever. No one recreates it.

### What a Deployment does differently

A Deployment is a **controller** — it watches the cluster and ensures your desired state is maintained. When you told it "I want 1 replica of echoserver," it took that as a standing order.

Let's prove it. Find your pod name:

```sh
kubectl get pods
```

Now delete it:

```sh
kubectl delete pod hello-world-xxxxxxxxxx-xxxxx
```

(Use the actual pod name from your output.)

Immediately check again:

```sh
kubectl get pods
```

```
NAME                           READY   STATUS    RESTARTS   AGE
hello-world-xxxxxxxxxx-yyyyy   1/1     Running   0          3s
```

A new pod appeared — with a different name and an age of just a few seconds. The Deployment noticed a pod was missing and immediately created a replacement.

This is the **self-healing** behaviour we discussed in Part 1. The Deployment's controller loop runs continuously:

```
Controller Loop (runs constantly):
┌─────────────────────────────────────────┐
│                                         │
│  1. Check: How many pods SHOULD exist?  │
│     → Deployment says: 1               │
│                                         │
│  2. Check: How many pods DO exist?      │
│     → Count running pods: 0 (deleted!) │
│                                         │
│  3. Difference: 1 - 0 = 1 missing      │
│     → Create 1 new pod                 │
│                                         │
│  4. Wait and repeat                     │
│                                         │
└─────────────────────────────────────────┘
```

### An analogy

Think of a Deployment as a thermostat. You set the temperature to 20°C. The thermostat doesn't just turn the heating on once — it continuously monitors and adjusts. If someone opens a window and the temperature drops, the thermostat responds by heating more. You never told it "when the temperature drops, turn on the heating." You just told it the desired state (20°C), and it figures out how to maintain it.

That's exactly what a Deployment does with pods.

---

## 5. Looking Deeper: The Resource Hierarchy

Let's see the full chain that Kubernetes created:

```sh
kubectl get all
```

```
NAME                               READY   STATUS    RESTARTS   AGE
pod/hello-world-xxxxxxxxxx-xxxxx   1/1     Running   0          2m

NAME                          READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/hello-world   1/1     1            1           5m

NAME                                     DESIRED   CURRENT   READY   AGE
replicaset.apps/hello-world-xxxxxxxxxx   1         1         1       5m
```

Three resources, each with a specific job:

```
Deployment (hello-world)
│
│  "I define what the app looks like
│   and manage updates"
│
└──→ ReplicaSet (hello-world-xxxxxxxxxx)
     │
     │  "I ensure the right number
     │   of pods are running"
     │
     └──→ Pod (hello-world-xxxxxxxxxx-xxxxx)
          │
          │  "I am the actual running
          │   container"
          │
          └──→ Container (echoserver:1.10)
```

- **Deployment** — the high-level intent ("run echoserver")
- **ReplicaSet** — the mechanism for maintaining pod count
- **Pod** — the actual running workload

You almost always interact with the Deployment. The ReplicaSet and Pod are managed automatically.

---

## 6. Useful kubectl Commands

Here are commands you'll use constantly:

### Viewing resources

```sh
# List pods with more detail (node, IP)
kubectl get pods -o wide

# List all resources in the default namespace
kubectl get all

# Watch pods in real time (updates automatically)
kubectl get pods --watch
```

**`-o wide`** adds extra columns like the pod's IP address and which node it's running on. Very useful for debugging network issues.

**`--watch`** keeps the command running and shows updates as they happen. Press `Ctrl+C` to stop.

### Debugging

```sh
# Detailed information about a resource
kubectl describe deployment hello-world
kubectl describe pod <pod-name>

# Container logs
kubectl logs <pod-name>
kubectl logs deployment/hello-world

# Execute a command inside a running container
kubectl exec -it <pod-name> -- /bin/sh
```

**`kubectl exec`** is like SSH-ing into a container. The `-it` flags give you an interactive terminal. `-- /bin/sh` opens a shell. Type `exit` to leave.

This is useful for debugging — you can check files, run commands, and inspect the container's environment from the inside.

### Cleanup

```sh
# Delete a specific deployment
kubectl delete deployment hello-world

# Delete everything in the default namespace
kubectl delete all --all
```

**Don't run the cleanup yet** — we'll continue using this deployment in Part 4.

---

## What Problem Did We Just Solve?

We deployed an application to Kubernetes and learned the two most fundamental concepts:

1. **Pods** are the smallest unit — they wrap your containers and give them an identity (IP, name) within the cluster
2. **Deployments** manage pods — they ensure the right number are running and replace them when they fail

The key takeaway: **you never manage pods directly.** You tell a Deployment what you want, and it handles the rest. This is the declarative model in action.

### What would break in production?

Right now, our app is running but **not accessible**. It's inside the cluster with no way to reach it from your Mac (or anywhere else). In production, an app that nobody can talk to is useless.

We also have only one replica — if it crashes during a restart, there's a brief gap with no pods running. We'll fix both of these issues in the next parts.

---

## What's Next?

Your app is running, but it's trapped inside the cluster. In **Part 4**, we'll learn about **Services** — the Kubernetes networking layer that gives your pods a stable address and makes them accessible from outside the cluster.
