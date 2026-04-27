This is Part 5 of a 10-part series on Kubernetes using Minikube. We transition from CLI commands to YAML manifests — the real way to work with Kubernetes.

---

## The Series

1. [What is Kubernetes?](/blog/view.html?slug=minikube-series-01-01-what-is-kubernetes&folder=tutorials)
2. [Setting Up Your Local Cluster](/blog/view.html?slug=minikube-series-01-02-setting-up-minikube&folder=tutorials)
3. [Your First Deployment](/blog/view.html?slug=minikube-series-01-03-first-deployment&folder=tutorials)
4. [Exposing Your App](/blog/view.html?slug=minikube-series-01-04-exposing-your-app&folder=tutorials)
5. **YAML and Declarative Configuration** ← you are here
6. [Scaling and Self-Healing](/blog/view.html?slug=minikube-series-01-06-scaling-and-self-healing&folder=tutorials)
7. [Multi-Service Architecture](/blog/view.html?slug=minikube-series-01-07-multi-service-architecture&folder=tutorials)
8. [Service-to-Service Communication](/blog/view.html?slug=minikube-series-01-08-service-to-service-communication&folder=tutorials)
9. [Ingress and HTTP Routing](/blog/view.html?slug=minikube-series-01-09-ingress-http-routing&folder=tutorials)
10. [Production Readiness](/blog/view.html?slug=minikube-series-01-10-production-readiness&folder=tutorials)

---

## Introduction

In Parts 3 and 4, we used imperative commands like `kubectl create deployment` and `kubectl expose`. These are great for quick experiments, but they have serious limitations:

- **No record** — if you delete your cluster, you'd need to remember every command
- **Hard to review** — a colleague can't look at a command and verify it's correct
- **No version control** — you can't track changes over time with git
- **Not repeatable** — reproducing the exact same setup on a different cluster is error-prone

The solution is **declarative YAML manifests** — files that describe the desired state of your resources. This is how Kubernetes is used in the real world, and it's the single most important concept in this series.

---

## Prerequisites

- Minikube running (`minikube start --driver=docker`)
- Clean slate — if you have resources from previous parts, delete them:

```sh
kubectl delete all --all
```

---

## 1. Imperative vs Declarative

Let's be very clear about this distinction because it changes how you think about Kubernetes.

### Imperative: telling Kubernetes what to do

```sh
kubectl create deployment hello-world --image=registry.k8s.io/echoserver:1.10
kubectl expose deployment hello-world --type=NodePort --port=8080
kubectl scale deployment hello-world --replicas=3
```

You're giving step-by-step instructions: "create this, then expose it, then scale it." Each command mutates the cluster. If something goes wrong halfway through, you're in a partially applied state.

### Declarative: telling Kubernetes what you want

```yaml
# hello-world.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hello-world
spec:
  replicas: 3
  selector:
    matchLabels:
      app: hello-world
  template:
    metadata:
      labels:
        app: hello-world
    spec:
      containers:
      - name: echoserver
        image: registry.k8s.io/echoserver:1.10
        ports:
        - containerPort: 8080
```

You describe the end state: "I want a Deployment called hello-world with 3 replicas running echoserver on port 8080." Kubernetes figures out what needs to change to get there.

```sh
kubectl apply -f hello-world.yaml
```

### The critical difference

With the imperative approach, you say: "Add 2 more replicas." But what if there are already 5? Now you have 7.

With the declarative approach, you say: "There should be 3 replicas." If there are 5, Kubernetes removes 2. If there's 1, it adds 2. If there are already 3, it does nothing.

**`kubectl apply`** is the declarative command. It compares your YAML file to the current state and makes the minimum changes needed. You can run it over and over — it's **idempotent** (same input always produces the same result).

### An analogy

Imperative is like giving someone turn-by-turn directions: "Turn left, then right, then go straight for 2 miles." If they're starting from a different location, the directions are wrong.

Declarative is like giving them an address: "Go to 42 Oxford Street." It doesn't matter where they're starting — the destination is always the same, and they figure out the route.

---

## 2. YAML Anatomy: The Four Required Fields

Every Kubernetes YAML manifest has the same top-level structure:

```yaml
apiVersion: apps/v1        # Which API group and version
kind: Deployment            # What type of resource
metadata:                   # Identifying information
  name: hello-world
spec:                       # The desired state (the "what")
  ...
```

Let's break each one down.

### apiVersion

Kubernetes APIs are versioned and grouped. This tells Kubernetes which version of the API to use for this resource:

| Resource | apiVersion |
|----------|-----------|
| Pod | `v1` |
| Service | `v1` |
| Deployment | `apps/v1` |
| Ingress | `networking.k8s.io/v1` |

**`v1`** means the resource is in the "core" API group (stable, well-established). **`apps/v1`** means it's in the "apps" group. You don't need to memorise these — the documentation always tells you which to use, and `kubectl explain <resource>` shows the correct version.

### kind

The type of resource: `Deployment`, `Service`, `Pod`, `Ingress`, etc. This must match the apiVersion — a Deployment uses `apps/v1`, a Service uses `v1`.

### metadata

Information that identifies the resource:

```yaml
metadata:
  name: hello-world          # Required: unique name within the namespace
  namespace: default          # Optional: defaults to "default"
  labels:                     # Optional: key-value pairs for organising
    app: hello-world
    environment: dev
```

**Labels** are particularly important. They're arbitrary key-value pairs that other resources use to find this one. The Service we'll create later uses labels to discover pods.

### spec

The specification — what you actually want. This is different for every resource type. For a Deployment, it describes the pods to run. For a Service, it describes networking rules.

---

## 3. Writing a Deployment Manifest

Let's create a proper YAML file. Create a directory for your Kubernetes files:

```sh
mkdir -p ~/k8s-tutorial && cd ~/k8s-tutorial
```

Now create `deployment.yaml`:

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hello-world
  labels:
    app: hello-world
spec:
  replicas: 1
  selector:
    matchLabels:
      app: hello-world
  template:
    metadata:
      labels:
        app: hello-world
    spec:
      containers:
      - name: echoserver
        image: registry.k8s.io/echoserver:1.10
        ports:
        - containerPort: 8080
```

### Breaking down the spec

This is where new users often get confused. The Deployment spec has nested layers, and each one matters:

```yaml
spec:                          # Deployment spec
  replicas: 1                  # How many pods to run
  selector:                    # How the Deployment finds its pods
    matchLabels:
      app: hello-world
  template:                    # Blueprint for each pod
    metadata:
      labels:
        app: hello-world       # Labels applied to the pod
    spec:                      # Pod spec (what runs inside)
      containers:
      - name: echoserver
        image: registry.k8s.io/echoserver:1.10
        ports:
        - containerPort: 8080
```

Let's trace through each section:

**`replicas: 1`**
How many pods to maintain. Kubernetes will create exactly this many and replace any that fail.

**`selector.matchLabels`**
This tells the Deployment: "Manage pods that have the label `app: hello-world`." The Deployment uses this to know which pods belong to it.

**`template`**
This is the pod template — a blueprint that the Deployment uses to create new pods. It has its own `metadata` and `spec`.

**`template.metadata.labels`**
Labels applied to each pod created from this template. These **must match** the `selector.matchLabels` above. If they don't, the Deployment can't find its own pods and Kubernetes will reject the manifest.

**`template.spec.containers`**
The actual container(s) to run in each pod. Most pods have one container, but you can have multiple (called a sidecar pattern).

**`containerPort: 8080`**
Declares which port the container listens on. This is informational — it doesn't actually open the port. It tells other developers and tools "this container expects traffic on port 8080."

### The label connection visualised

```
Deployment
┌─────────────────────────────────────────┐
│ selector:                               │
│   matchLabels:                          │
│     app: hello-world  ─────────┐        │
│                                │        │
│ template:                      │ must   │
│   metadata:                    │ match  │
│     labels:                    │        │
│       app: hello-world ←───────┘        │
│   spec:                                 │
│     containers:                         │
│     - name: echoserver                  │
│       image: echoserver:1.10            │
└─────────────────────────────────────────┘
```

---

## 4. Writing a Service Manifest

Create `service.yaml`:

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: hello-world
spec:
  type: NodePort
  selector:
    app: hello-world
  ports:
  - port: 8080
    targetPort: 8080
    protocol: TCP
```

### Breaking it down

**`type: NodePort`**
Same as `--type=NodePort` from Part 4 — opens a port on the node for external access.

**`selector`**
The Service finds pods using this label selector. It matches pods with `app: hello-world` — the same label our Deployment's template applies.

**`ports`**
- **`port: 8080`** — the port the Service listens on (inside the cluster)
- **`targetPort: 8080`** — the port on the pod to forward traffic to (the echoserver's port)
- These can be different — e.g., `port: 80` with `targetPort: 8080` means the Service listens on 80 but forwards to the container's 8080

```
Client → Service:8080 (port) → Pod:8080 (targetPort)
```

We're not specifying a `nodePort` value, so Kubernetes will assign a random one in the 30000–32767 range. You can pin it if you need a specific port:

```yaml
ports:
- port: 8080
  targetPort: 8080
  nodePort: 30080    # Fixed NodePort
```

---

## 5. Applying Your Manifests

Now let's deploy everything:

```sh
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
```

You'll see:

```
deployment.apps/hello-world created
service/hello-world created
```

Or apply both at once by pointing to the directory:

```sh
kubectl apply -f ~/k8s-tutorial/
```

This applies every YAML file in the directory. Very useful when you have many resources.

### Verify everything is running

```sh
kubectl get all
```

```
NAME                               READY   STATUS    RESTARTS   AGE
pod/hello-world-xxxxxxxxxx-xxxxx   1/1     Running   0          30s

NAME                  TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)          AGE
service/hello-world   NodePort    10.96.xxx.xxx  <none>        8080:3XXXX/TCP   25s
service/kubernetes    ClusterIP   10.96.0.1      <none>        443/TCP          1h

NAME                          READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/hello-world   1/1     1            1           30s
```

### Test access

```sh
minikube service hello-world --url
```

```sh
curl $(minikube service hello-world --url)
```

You should see the echoserver response — exactly like Part 4, but now defined in version-controllable YAML files.

---

## 6. The Power of Apply: Making Changes

Here's where the declarative approach shines. Let's change the replica count.

Edit `deployment.yaml` and change `replicas: 1` to `replicas: 3`:

```yaml
spec:
  replicas: 3    # Changed from 1 to 3
```

Apply the change:

```sh
kubectl apply -f deployment.yaml
```

```
deployment.apps/hello-world configured
```

Notice it says **configured**, not **created**. Kubernetes compared your file to the existing Deployment, found the difference (replicas changed from 1 to 3), and made only that change.

Check the pods:

```sh
kubectl get pods
```

```
NAME                           READY   STATUS    RESTARTS   AGE
hello-world-xxxxxxxxxx-aaaaa   1/1     Running   0          5m
hello-world-xxxxxxxxxx-bbbbb   1/1     Running   0          10s
hello-world-xxxxxxxxxx-ccccc   1/1     Running   0          10s
```

The original pod is still there (5 minutes old). Two new ones were created (10 seconds old). Kubernetes didn't tear everything down and rebuild — it made the minimum change needed.

Now change it back to `replicas: 1` and apply again:

```sh
kubectl apply -f deployment.yaml
```

Two pods will be terminated, leaving just one. Same file, same command, different current state — Kubernetes always converges to what the file says.

---

## 7. Multi-Resource Files

Having separate files is clean, but sometimes you want everything in one file. Kubernetes uses `---` as a document separator:

Create `hello-world-all.yaml`:

```yaml
# hello-world-all.yaml
# Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hello-world
  labels:
    app: hello-world
spec:
  replicas: 1
  selector:
    matchLabels:
      app: hello-world
  template:
    metadata:
      labels:
        app: hello-world
    spec:
      containers:
      - name: echoserver
        image: registry.k8s.io/echoserver:1.10
        ports:
        - containerPort: 8080
---
# Service
apiVersion: v1
kind: Service
metadata:
  name: hello-world
spec:
  type: NodePort
  selector:
    app: hello-world
  ports:
  - port: 8080
    targetPort: 8080
    protocol: TCP
```

Apply it:

```sh
kubectl apply -f hello-world-all.yaml
```

Both resources are created (or updated) in one command.

### When to split vs combine

| Approach | When to use |
|----------|-------------|
| **One file per resource** | Large projects, many contributors, fine-grained version control |
| **All-in-one file** | Small projects, tightly coupled resources, tutorials |
| **One file per application** | Middle ground — each app's Deployment + Service together |

For this series, we'll use one file per application (Deployment + Service together) to keep things manageable.

---

## 8. Useful kubectl Commands for YAML

### Generate YAML from commands

Don't want to write YAML from scratch? Use `--dry-run=client -o yaml` to generate it:

```sh
kubectl create deployment test --image=nginx --dry-run=client -o yaml
```

This prints the YAML that *would* be created, without actually creating anything. You can redirect it to a file:

```sh
kubectl create deployment test --image=nginx --dry-run=client -o yaml > my-deployment.yaml
```

This is very useful as a starting point — generate the skeleton and then customise.

### View the YAML of existing resources

```sh
kubectl get deployment hello-world -o yaml
```

This shows the full YAML of a running resource, including all the defaults Kubernetes added. It's verbose but useful for understanding what Kubernetes is actually working with.

### Explain resource fields

```sh
kubectl explain deployment.spec.replicas
```

```
KIND:     Deployment
VERSION:  apps/v1

FIELD:    replicas <integer>

DESCRIPTION:
     Number of desired pods. Defaults to 1.
```

This is like built-in documentation. You can drill into any field:

```sh
kubectl explain deployment.spec.template.spec.containers
```

### Diff before applying

```sh
kubectl diff -f deployment.yaml
```

This shows what would change if you applied the file — without actually changing anything. Very useful for reviewing changes before applying them, especially in shared environments.

---

## 9. Common YAML Mistakes

These trip up everyone at some point:

### Indentation errors

YAML uses spaces (not tabs) for indentation. Two spaces per level is standard. A misplaced space breaks everything:

```yaml
# Wrong — "selector" should be indented under "spec"
spec:
selector:
  matchLabels:
    app: hello-world

# Correct
spec:
  selector:
    matchLabels:
      app: hello-world
```

### Mismatched labels

The Deployment's `selector.matchLabels` must match the template's `labels`. If they don't, Kubernetes rejects the manifest:

```yaml
# Wrong — selector says "hello-world" but template says "hello"
selector:
  matchLabels:
    app: hello-world
template:
  metadata:
    labels:
      app: hello          # Doesn't match!
```

### Wrong apiVersion

Each resource type has a specific apiVersion. Using the wrong one gives a confusing error:

```yaml
# Wrong — Deployments use apps/v1, not v1
apiVersion: v1
kind: Deployment
```

The error message will say something like "no matches for kind 'Deployment' in version 'v1'." Use `kubectl explain <resource>` to find the correct version.

---

## What Problem Did We Just Solve?

We moved from imperative commands to declarative YAML manifests. This is a fundamental shift:

1. **Reproducibility** — delete your cluster, recreate it, apply the same files, get the same result
2. **Version control** — your infrastructure lives in git alongside your code
3. **Code review** — changes can be reviewed before they're applied
4. **Idempotency** — `kubectl apply` always converges to the desired state, no matter the current state

This is what people mean by **Infrastructure as Code**. Your YAML files *are* your infrastructure.

### What would break in production?

- We're not using **namespaces** to isolate resources. In a shared cluster, you'd separate environments (dev, staging, prod) using namespaces.
- Our YAML files are plain files. In production, you'd use tools like **Kustomize** or **Helm** to template and manage variations (different image tags per environment, different replica counts, etc.).
- We have no **resource limits** — our pods could consume all available CPU and memory. We'll fix this in Part 10.

---

## What's Next?

In **Part 6**, we'll explore two of Kubernetes' most impressive features: **scaling** (running multiple copies of your app) and **self-healing** (automatic recovery from failures). You'll see Kubernetes replace crashed pods in real time and watch a Service load-balance traffic across replicas.
