This is Part 9 of Series 2 — a 10-part intermediate Kubernetes series using Minikube. We learn RBAC, Service Accounts, and security contexts — controlling who can do what in your cluster.

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
9. **RBAC and Security** ← you are here
10. [Debugging Like an SRE](/blog/view.html?slug=minikube-series-02-10-debugging-like-an-sre&folder=tutorials)

---

## Introduction

Throughout this series, we've had full access to everything in the cluster. We've created, deleted, scaled, and inspected any resource in any namespace. That's fine for learning on Minikube, but in a shared production cluster, unrestricted access is dangerous.

**RBAC** (Role-Based Access Control) is how Kubernetes answers the question: "Who can do what, and where?" It lets you grant a CI/CD pipeline permission to deploy but not to delete. It lets a monitoring tool read pods but not secrets. It lets a developer manage their own namespace without touching anyone else's.

In this part, we'll also cover **Service Accounts** (identities for pods) and **Security Contexts** (hardening how containers run).

---

## Prerequisites

- Minikube running: `minikube start --driver=docker`
- Clean slate:

```sh
kubectl delete all --all
```

---

## 1. Authentication vs Authorisation

Two separate questions:

- **Authentication (AuthN):** "Who are you?" — proving identity (certificates, tokens, OIDC)
- **Authorisation (AuthZ):** "What can you do?" — checking permissions (RBAC)

When you run `kubectl get pods`:
1. kubectl sends your credentials (from `~/.kube/config`) to the API server
2. The API server **authenticates** you — verifies you are who you claim to be
3. The API server **authorises** the request — checks if you have permission to `get pods`
4. If both pass, the request succeeds

```
kubectl get pods
       │
       ↓
API Server
┌──────────────────────────────┐
│ 1. Authentication            │
│    "Is this a valid user?"   │
│    (certificates, tokens)    │
│                              │
│ 2. Authorisation (RBAC)      │
│    "Can this user GET pods?" │
│    (Roles, RoleBindings)     │
│                              │
│ 3. Admission Control         │
│    "Is this request valid?"  │
│    (quotas, policies)        │
└──────────────────────────────┘
       │
       ↓
  Response: list of pods
```

On Minikube, you're authenticated as an admin with full access. In production, different users and service accounts would have different levels of access.

---

## 2. Service Accounts

**Service Accounts** are identities for pods. When a pod makes API calls (e.g., querying Kubernetes for the list of pods), it authenticates as its Service Account.

### The default Service Account

Every namespace has a `default` Service Account:

```sh
kubectl get serviceaccount
```

```
NAME      SECRETS   AGE
default   0         1h
```

Every pod that doesn't specify a Service Account uses this one. Let's see it:

```sh
kubectl run test --image=busybox --restart=Never -- sleep 3600
kubectl get pod test -o yaml | grep serviceAccount
```

```yaml
serviceAccount: default
serviceAccountName: default
```

### Why custom Service Accounts matter

The default Service Account often has more permissions than a pod needs. The principle of least privilege says: **give each workload only the permissions it requires**.

### Creating a custom Service Account

```yaml
# service-account.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: pod-reader
  namespace: default
```

```sh
kubectl apply -f service-account.yaml
```

### Assigning a Service Account to a pod

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: monitoring
  template:
    metadata:
      labels:
        app: monitoring
    spec:
      serviceAccountName: pod-reader    # ← use our custom SA
      containers:
      - name: monitor
        image: bitnami/kubectl:latest
        command: ["sleep", "3600"]
```

```sh
kubectl apply -f monitoring-deployment.yaml
```

The pod now runs as `pod-reader` instead of `default`. But it doesn't have any permissions yet — we need RBAC for that.

### Disabling the Service Account token

If a pod doesn't need to talk to the Kubernetes API at all, disable the token mount:

```yaml
spec:
  automountServiceAccountToken: false
```

This prevents the Service Account token from being mounted at `/var/run/secrets/kubernetes.io/serviceaccount/token`, reducing the attack surface if the pod is compromised.

---

## 3. RBAC: Roles and RoleBindings

RBAC has four key resources:

| Resource | Scope | Purpose |
|----------|-------|---------|
| **Role** | Namespace | Defines permissions within a namespace |
| **RoleBinding** | Namespace | Grants a Role to a user/SA within a namespace |
| **ClusterRole** | Cluster-wide | Defines permissions across all namespaces |
| **ClusterRoleBinding** | Cluster-wide | Grants a ClusterRole cluster-wide |

### Creating a Role

A Role defines **what actions** are allowed on **which resources**:

```yaml
# role.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: default
rules:
- apiGroups: [""]              # "" = core API group (pods, services, etc.)
  resources: ["pods"]          # Which resources
  verbs: ["get", "list", "watch"]   # Which actions
```

```sh
kubectl apply -f role.yaml
```

### Breaking down the rules

```yaml
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list", "watch"]
```

**apiGroups:** Which API group the resources belong to. `""` is the core group (pods, services, configmaps, secrets). `"apps"` includes Deployments and ReplicaSets. `"batch"` includes Jobs and CronJobs.

**resources:** Which resources this rule applies to. You can list multiple: `["pods", "services", "configmaps"]`.

**verbs:** Which actions are allowed:

| Verb | kubectl equivalent | Meaning |
|------|-------------------|---------|
| `get` | `kubectl get pod <name>` | Read a specific resource |
| `list` | `kubectl get pods` | List all resources of this type |
| `watch` | `kubectl get pods --watch` | Stream real-time changes |
| `create` | `kubectl apply -f` (new) | Create a new resource |
| `update` | `kubectl apply -f` (existing) | Modify an existing resource |
| `patch` | `kubectl patch` | Partially modify a resource |
| `delete` | `kubectl delete` | Delete a resource |

Our role allows reading pods (`get`, `list`, `watch`) but not creating, modifying, or deleting them.

### Creating a RoleBinding

A RoleBinding connects a Role to a Service Account (or user):

```yaml
# rolebinding.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: pod-reader-binding
  namespace: default
subjects:
- kind: ServiceAccount
  name: pod-reader             # The Service Account we created
  namespace: default
roleRef:
  kind: Role
  name: pod-reader             # The Role to grant
  apiGroup: rbac.authorization.k8s.io
```

```sh
kubectl apply -f rolebinding.yaml
```

Now the `pod-reader` Service Account can read pods in the `default` namespace.

### Testing the permissions

Exec into the monitoring pod (which uses the `pod-reader` Service Account):

```sh
kubectl exec -it deployment/monitoring -- sh
```

Inside the pod:

```sh
# This should work (read access to pods)
kubectl get pods
```

You should see a list of pods.

```sh
# This should fail (no write access)
kubectl delete pod test
```

```
Error from server (Forbidden): pods "test" is forbidden: User "system:serviceaccount:default:pod-reader" cannot delete resource "pods" in API group "" in the namespace "default"
```

The error message is precise: it tells you exactly which user, which verb, which resource, and which namespace failed. This is very helpful for debugging permission issues.

```sh
# This should also fail (no access to secrets)
kubectl get secrets
```

```
Error from server (Forbidden): secrets is forbidden: User "system:serviceaccount:default:pod-reader" cannot list resource "secrets"...
```

Type `exit` to leave the pod.

The Service Account can read pods (allowed by the Role) but nothing else. That's least privilege in action.

---

## 4. ClusterRoles and ClusterRoleBindings

Roles are namespace-scoped. **ClusterRoles** work across all namespaces:

```yaml
# clusterrole.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: namespace-viewer
rules:
- apiGroups: [""]
  resources: ["namespaces", "pods"]
  verbs: ["get", "list"]
```

```yaml
# clusterrolebinding.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: namespace-viewer-binding
subjects:
- kind: ServiceAccount
  name: pod-reader
  namespace: default
roleRef:
  kind: ClusterRole
  name: namespace-viewer
  apiGroup: rbac.authorization.k8s.io
```

```sh
kubectl apply -f clusterrole.yaml
kubectl apply -f clusterrolebinding.yaml
```

Now the `pod-reader` Service Account can list namespaces and pods across all namespaces — not just `default`.

### When to use which

| Need | Use |
|------|-----|
| Permissions within one namespace | Role + RoleBinding |
| Same permissions in every namespace | ClusterRole + ClusterRoleBinding |
| Cluster-wide resources (namespaces, nodes) | ClusterRole + ClusterRoleBinding |
| A reusable role applied per-namespace | ClusterRole + RoleBinding (per namespace) |

The last pattern is common: define a ClusterRole once, then create a RoleBinding in each namespace that needs it.

---

## 5. Checking Permissions

### Can I?

```sh
# Check if YOU can do something
kubectl auth can-i create deployments

# Check if a Service Account can do something
kubectl auth can-i get pods --as system:serviceaccount:default:pod-reader

# Check in a specific namespace
kubectl auth can-i delete pods --as system:serviceaccount:default:pod-reader -n kube-system
```

### List all permissions for a user

```sh
kubectl auth can-i --list --as system:serviceaccount:default:pod-reader
```

This shows every permission the Service Account has — very useful for auditing.

---

## 6. Security Contexts

RBAC controls what a Service Account can do via the Kubernetes API. **Security Contexts** control how the container itself runs — at the operating system level.

### Why security contexts matter

By default, containers run as root. If an attacker exploits a vulnerability in your application, they have root access inside the container. With certain misconfigurations, they could escape the container and compromise the node.

Security Contexts reduce this risk by restricting the container's capabilities.

### Key settings

Create `~/k8s-tutorial-2/secure-pod.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: secure-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: secure-app
  template:
    metadata:
      labels:
        app: secure-app
    spec:
      securityContext:                    # Pod-level settings
        runAsNonRoot: true                # No container may run as root
        fsGroup: 1000                     # Files created are owned by group 1000
      containers:
      - name: app
        image: nginx:alpine
        ports:
        - containerPort: 80
        securityContext:                  # Container-level settings
          runAsUser: 1000                 # Run as user ID 1000, not root
          readOnlyRootFilesystem: true    # Container filesystem is read-only
          allowPrivilegeEscalation: false # Cannot gain more privileges
        volumeMounts:
        - name: tmp
          mountPath: /tmp
        - name: cache
          mountPath: /var/cache/nginx
        - name: run
          mountPath: /var/run
      volumes:
      - name: tmp
        emptyDir: {}
      - name: cache
        emptyDir: {}
      - name: run
        emptyDir: {}
```

### Breaking down the settings

**`runAsNonRoot: true`** (pod level)
Kubernetes checks at startup: if the container image is configured to run as root (UID 0), the pod is rejected. This is a safety net.

**`runAsUser: 1000`** (container level)
Run the container process as user ID 1000 instead of root. Combined with `runAsNonRoot`, this ensures the container never has root privileges.

**`readOnlyRootFilesystem: true`**
The container's filesystem is mounted read-only. The application can't write to `/etc`, `/usr`, or anywhere else. Any writable space must be explicitly provided via volume mounts (like `/tmp` above).

Why? If an attacker gets code execution, they can't:
- Modify binaries (`/usr/bin/`)
- Edit configuration (`/etc/`)
- Install tools or malware

**`allowPrivilegeEscalation: false`**
Prevents the container from gaining privileges beyond what it started with. Blocks attacks that use `setuid` binaries or kernel exploits to escalate to root.

**Note:** NGINX needs write access to `/tmp`, `/var/cache/nginx`, and `/var/run` for temporary files and the PID file. We provide these via `emptyDir` volumes. The official `nginx:alpine` image also needs adjustment to run as non-root — in practice you'd use an image built for non-root execution.

### Testing the security context

```sh
kubectl apply -f ~/k8s-tutorial-2/secure-pod.yaml
```

If the pod fails to start, check:

```sh
kubectl describe pod -l app=secure-app
```

Some images don't support running as non-root without modification. The error messages will tell you exactly what failed.

---

## 7. Common RBAC Patterns

### Read-only access for monitoring

```yaml
rules:
- apiGroups: [""]
  resources: ["pods", "services", "endpoints", "nodes"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources: ["deployments", "replicasets"]
  verbs: ["get", "list", "watch"]
```

### Deployment-only access for CI/CD

```yaml
rules:
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "create", "update", "patch"]
- apiGroups: [""]
  resources: ["services"]
  verbs: ["get", "list", "create", "update", "patch"]
- apiGroups: [""]
  resources: ["configmaps"]
  verbs: ["get", "list", "create", "update"]
```

No `delete` verb — the CI/CD pipeline can create and update deployments but can't delete them.

### Full namespace access for a team

```yaml
rules:
- apiGroups: ["*"]
  resources: ["*"]
  verbs: ["*"]
```

Use a RoleBinding (not ClusterRoleBinding) so this only applies within one namespace.

---

## 8. Built-in ClusterRoles

Kubernetes comes with several built-in ClusterRoles:

```sh
kubectl get clusterroles | grep -E "^(admin|edit|view|cluster-admin)"
```

| ClusterRole | Permissions |
|------------|-------------|
| `cluster-admin` | Full access to everything (use sparingly) |
| `admin` | Full access within a namespace (no quota/RBAC modification) |
| `edit` | Read/write access to most resources (no roles, no role bindings) |
| `view` | Read-only access to most resources (no secrets) |

Instead of creating custom roles from scratch, you can bind these built-in roles:

```sh
# Give the "dev-team" SA edit access in the "dev" namespace
kubectl create rolebinding dev-edit \
  --clusterrole=edit \
  --serviceaccount=dev:dev-team \
  --namespace=dev
```

---

## Cleanup

```sh
kubectl delete all --all
kubectl delete serviceaccount pod-reader
kubectl delete role pod-reader
kubectl delete rolebinding pod-reader-binding
kubectl delete clusterrole namespace-viewer
kubectl delete clusterrolebinding namespace-viewer-binding
```

---

## What Problem Did We Just Solve?

We learned how to control access and harden our cluster:

1. **Service Accounts** give pods their own identity — separate from human users
2. **Roles and RoleBindings** grant specific permissions within a namespace
3. **ClusterRoles and ClusterRoleBindings** grant permissions across the entire cluster
4. **`kubectl auth can-i`** lets you test permissions before granting them
5. **Security Contexts** restrict how containers run — non-root, read-only filesystem, no privilege escalation

### What would break in production?

- We haven't integrated with an **identity provider** (OIDC, LDAP). In production, human users authenticate via corporate SSO, not certificate-based auth like Minikube uses.
- Our security contexts are a starting point. Production environments often use **Pod Security Standards** (or the older PodSecurityPolicies) to enforce security contexts cluster-wide.
- We haven't discussed **audit logging** — recording who did what and when. Essential for compliance and incident investigation.

---

## What's Next?

In the final part — **Part 10** — we'll put everything together in **Debugging Like an SRE**. We'll create eight real failure scenarios and systematically diagnose each one, building a toolkit you'll use every time something goes wrong in production.
