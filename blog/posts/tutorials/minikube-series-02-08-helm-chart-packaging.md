This is Part 8 of Series 2 — a 10-part intermediate Kubernetes series using Minikube. We learn to package, template, and share Kubernetes configurations using Helm.

---

## The Series

1. [Rolling Updates and Rollbacks](/blog/view.html?slug=minikube-series-02-01-rolling-updates-rollbacks&folder=tutorials)
2. [Namespaces and Resource Quotas](/blog/view.html?slug=minikube-series-02-02-namespaces-resource-quotas&folder=tutorials)
3. [Secrets and Configuration](/blog/view.html?slug=minikube-series-02-03-secrets-and-configuration&folder=tutorials)
4. [Persistent Storage](/blog/view.html?slug=minikube-series-02-04-persistent-storage&folder=tutorials)
5. [Networking from the Inside](/blog/view.html?slug=minikube-series-02-05-networking-internals&folder=tutorials)
6. [Jobs, CronJobs, and Batch Work](/blog/view.html?slug=minikube-series-02-06-jobs-cronjobs-batch&folder=tutorials)
7. [StatefulSets and Databases](/blog/view.html?slug=minikube-series-02-07-statefulsets-databases&folder=tutorials)
8. **Helm and Chart Packaging** ← you are here
9. [RBAC and Security](/blog/view.html?slug=minikube-series-02-09-rbac-security&folder=tutorials)
10. [Debugging Like an SRE](/blog/view.html?slug=minikube-series-02-10-debugging-like-an-sre&folder=tutorials)

---

## Introduction

In Series 1 Part 5, we moved from CLI commands to YAML manifests — a major step. But as your project grows, raw YAML has its own problems:

- **No variables** — image tags, replica counts, and hostnames are hardcoded. Deploying to staging means editing every value by hand.
- **No reuse** — deploying the same app to three environments means maintaining three copies of mostly identical YAML.
- **No packaging** — installing third-party software (Redis, PostgreSQL, NGINX Ingress) means downloading and managing complex YAML manifests yourself.

**Helm** solves all three problems. It's a package manager for Kubernetes — think of it as `brew` for your cluster. Charts (packages) contain templated YAML, configurable via values files. You install, upgrade, and roll back releases with simple commands.

---

## Prerequisites

- Minikube running: `minikube start --driver=docker`
- Clean slate: `kubectl delete all --all`

### Install Helm

```sh
brew install helm
```

Verify:

```sh
helm version
```

```
version.BuildInfo{Version:"v3.x.x", ...}
```

Helm 3 is client-only — no server-side component needed (unlike Helm 2 which required "Tiller"). Helm uses your existing `~/.kube/config` to connect to the cluster.

---

## 1. Core Concepts

| Concept | What it is | Analogy |
|---------|-----------|---------|
| **Chart** | A package of templated Kubernetes YAML | A Homebrew formula |
| **Release** | An installed instance of a chart | An installed application |
| **Repository** | A collection of charts | Homebrew tap |
| **Values** | Configuration that customises a chart | Brew install options |

```
Chart (package) + Values (config) = Release (installed instance)

redis-chart + {replicas: 3, memory: 256Mi} = my-redis (running in cluster)
```

---

## 2. Using Existing Charts

The most common use of Helm is installing software that someone else has packaged.

### Adding a chart repository

```sh
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
```

The Bitnami repository contains production-ready charts for hundreds of applications.

### Searching for charts

```sh
helm search repo redis
```

```
NAME            CHART VERSION   APP VERSION   DESCRIPTION
bitnami/redis   18.x.x          7.x.x         Redis is an open source...
```

### Inspecting a chart before installing

```sh
# See the chart's default values
helm show values bitnami/redis | head -50

# See the chart's README
helm show readme bitnami/redis
```

The values output shows every configurable parameter — replica count, image version, resource limits, persistence settings, and much more.

### Installing a chart

Let's install Redis with some custom values:

```sh
helm install my-redis bitnami/redis \
  --set architecture=standalone \
  --set auth.enabled=false \
  --set master.persistence.size=100Mi
```

**Breaking this down:**

- `helm install` — install a chart
- `my-redis` — the release name (you choose this)
- `bitnami/redis` — the chart to install
- `--set` — override default values

**`architecture=standalone`** — use a single Redis instance (not a cluster). Simpler for learning.

**`auth.enabled=false`** — disable authentication (don't do this in production).

**`master.persistence.size=100Mi`** — request 100Mi of storage instead of the default 8Gi.

Watch the installation:

```sh
kubectl get pods --watch
```

After a minute or so, you'll see a Redis pod running. Helm created all the necessary Kubernetes resources: StatefulSet, Service, PVC, ConfigMap, and more.

### Listing releases

```sh
helm list
```

```
NAME       NAMESPACE   REVISION   STATUS     CHART           APP VERSION
my-redis   default     1          deployed   redis-18.x.x    7.x.x
```

### Testing the installation

```sh
kubectl exec my-redis-master-0 -- redis-cli PING
```

```
PONG
```

Redis is running and responding.

### Using a values file (recommended)

Instead of `--set` flags (which get unwieldy), put your overrides in a file:

Create `~/k8s-tutorial-2/redis-values.yaml`:

```yaml
# redis-values.yaml
architecture: standalone
auth:
  enabled: false
master:
  persistence:
    size: 100Mi
  resources:
    requests:
      cpu: 50m
      memory: 64Mi
    limits:
      cpu: 200m
      memory: 128Mi
```

Install (or upgrade) using the file:

```sh
helm upgrade my-redis bitnami/redis -f ~/k8s-tutorial-2/redis-values.yaml
```

`helm upgrade` applies changes to an existing release. If the release doesn't exist, add `--install` to create it:

```sh
helm upgrade --install my-redis bitnami/redis -f ~/k8s-tutorial-2/redis-values.yaml
```

This pattern (`upgrade --install`) is idempotent — safe to run repeatedly.

---

## 3. Managing Releases

### Upgrading

Change a value in `redis-values.yaml` (e.g., set `architecture: replication`) and run:

```sh
helm upgrade my-redis bitnami/redis -f ~/k8s-tutorial-2/redis-values.yaml
```

Helm computes the diff between the current release and the new values, generates updated Kubernetes manifests, and applies them.

### Release history

```sh
helm history my-redis
```

```
REVISION   STATUS       CHART           DESCRIPTION
1          superseded   redis-18.x.x    Install complete
2          deployed     redis-18.x.x    Upgrade complete
```

### Rolling back

```sh
helm rollback my-redis 1
```

Reverts to revision 1. Like `kubectl rollout undo`, but for the entire application stack — Deployment, ConfigMap, Service, everything.

### Uninstalling

```sh
helm uninstall my-redis
```

Deletes all Kubernetes resources created by the chart. PVCs are typically kept (check the chart's documentation) to prevent data loss.

```sh
# Clean up leftover PVCs
kubectl delete pvc -l app.kubernetes.io/instance=my-redis
```

---

## 4. Creating Your Own Chart

Now let's build a chart from scratch for our tutorial application.

### Scaffold a new chart

```sh
helm create myapp
```

This creates a directory structure:

```
myapp/
├── Chart.yaml            # Chart metadata (name, version, description)
├── values.yaml           # Default values
├── templates/            # Templated Kubernetes YAML
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── hpa.yaml
│   ├── serviceaccount.yaml
│   ├── _helpers.tpl      # Reusable template functions
│   ├── NOTES.txt         # Post-install message
│   └── tests/
│       └── test-connection.yaml
└── charts/               # Sub-charts (dependencies)
```

The scaffold includes more than we need. Let's simplify it.

### Chart.yaml

```sh
cat myapp/Chart.yaml
```

```yaml
apiVersion: v2
name: myapp
description: A Helm chart for our tutorial application
type: application
version: 0.1.0          # Chart version
appVersion: "1.0.0"     # Application version
```

### Simplifying the templates

Delete the scaffolded templates and create our own:

```sh
rm myapp/templates/*.yaml myapp/templates/*.tpl myapp/templates/*.txt
rm -rf myapp/templates/tests
```

Create `myapp/templates/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}-{{ .Chart.Name }}
  labels:
    app: {{ .Release.Name }}
spec:
  replicas: {{ .Values.replicas }}
  selector:
    matchLabels:
      app: {{ .Release.Name }}
  template:
    metadata:
      labels:
        app: {{ .Release.Name }}
    spec:
      containers:
      - name: {{ .Chart.Name }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
        ports:
        - containerPort: {{ .Values.containerPort }}
        {{- if .Values.resources }}
        resources:
          {{- toYaml .Values.resources | nindent 10 }}
        {{- end }}
```

Create `myapp/templates/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ .Release.Name }}-{{ .Chart.Name }}
spec:
  type: {{ .Values.service.type }}
  selector:
    app: {{ .Release.Name }}
  ports:
  - port: {{ .Values.service.port }}
    targetPort: {{ .Values.containerPort }}
```

### Understanding the template syntax

Helm uses Go templates. The curly braces `{{ }}` contain expressions:

| Expression | Meaning |
|-----------|---------|
| `{{ .Release.Name }}` | The release name (e.g., `my-web`) |
| `{{ .Chart.Name }}` | The chart name (`myapp`) |
| `{{ .Values.replicas }}` | A value from `values.yaml` |
| `{{ toYaml .Values.resources \| nindent 10 }}` | Convert a YAML block and indent it 10 spaces |
| `{{- if .Values.resources }}` | Conditional — only render if `resources` is defined |
| `{{- end }}` | End of conditional block |

The `{{-` with a dash trims whitespace before the expression. Without the dash, blank lines appear in the output.

### Setting default values

Edit `myapp/values.yaml`:

```yaml
# Default values for myapp
replicas: 1
containerPort: 80

image:
  repository: nginx
  tag: alpine

service:
  type: ClusterIP
  port: 80

resources:
  requests:
    cpu: 50m
    memory: 64Mi
  limits:
    cpu: 200m
    memory: 128Mi
```

### Testing your chart

Before installing, render the templates to see what Kubernetes YAML would be generated:

```sh
helm template my-web ./myapp
```

This outputs the fully rendered YAML — all template expressions resolved with values. Check it looks correct.

### Linting

```sh
helm lint ./myapp
```

This checks for common errors: missing required fields, syntax issues, best practice violations.

### Installing your chart

```sh
helm install my-web ./myapp
```

```sh
kubectl get all
```

You should see a Deployment, pods, and a Service — all created from your chart.

### Overriding values per environment

Create `myapp/values-dev.yaml`:

```yaml
replicas: 1
image:
  tag: "1.24"
resources:
  requests:
    cpu: 25m
    memory: 32Mi
  limits:
    cpu: 100m
    memory: 64Mi
```

Create `myapp/values-staging.yaml`:

```yaml
replicas: 3
image:
  tag: "1.25"
service:
  type: NodePort
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 256Mi
```

Deploy to different environments:

```sh
# Dev
helm install web-dev ./myapp -f myapp/values-dev.yaml

# Staging
helm install web-staging ./myapp -f myapp/values-staging.yaml
```

Same chart, different values, different releases. This is the power of Helm — write the templates once, deploy everywhere with different configuration.

```sh
helm list
```

```
NAME           NAMESPACE   REVISION   STATUS     CHART         APP VERSION
web-dev        default     1          deployed   myapp-0.1.0   1.0.0
web-staging    default     1          deployed   myapp-0.1.0   1.0.0
```

### Values precedence

Values are resolved in this order (later overrides earlier):

```
1. values.yaml (chart defaults)           ← lowest priority
2. -f values-dev.yaml (file override)
3. --set replicas=5 (command-line flag)    ← highest priority
```

---

## 5. Useful Helm Commands

```sh
# List all releases
helm list

# Get the values used for a release
helm get values my-web

# Get all rendered manifests for a release
helm get manifest my-web

# Show release history
helm history my-web

# Upgrade with new values
helm upgrade my-web ./myapp -f myapp/values-staging.yaml

# Rollback to a previous revision
helm rollback my-web 1

# Uninstall a release
helm uninstall my-web

# Dry run (show what would be installed without doing it)
helm install my-web ./myapp --dry-run

# Search for charts
helm search repo nginx
helm search hub nginx    # Search Artifact Hub (public)
```

---

## 6. When Not to Use Helm

Helm is powerful but not always necessary:

| Situation | Better option |
|-----------|--------------|
| Simple project, few files | Raw YAML + `kubectl apply` |
| Need overlay-based customisation | Kustomize (built into kubectl) |
| Single deployment, no templating needed | Raw YAML |
| Chart complexity exceeds the app complexity | Step back and simplify |

Helm shines when you need: multi-environment deployments, community-maintained packages, or complex applications with many resources.

---

## Cleanup

```sh
helm uninstall my-web 2>/dev/null
helm uninstall web-dev 2>/dev/null
helm uninstall web-staging 2>/dev/null
rm -rf myapp
```

---

## What Problem Did We Just Solve?

We moved from raw YAML to templated, reusable, versioned packages:

1. **Charts** package Kubernetes resources into reusable units — with templating for configurable values
2. **Values files** customise charts per environment — same chart, different configurations
3. **Helm repositories** provide community-maintained charts — install Redis, PostgreSQL, or NGINX Ingress with a single command
4. **Release management** tracks versions and enables rollback — upgrade and undo with confidence
5. **`helm template`** renders YAML without installing — useful for code review and CI/CD

### What would break in production?

- We created a minimal chart. Production charts include **NOTES.txt** (post-install instructions), **tests** (connection tests), **helpers** (reusable template functions), and **sub-charts** (dependencies).
- We're not using a **chart repository** for our own chart. In a team, you'd publish charts to a private repository (ChartMuseum, OCI registry, or GitHub Pages).
- Values files for different environments should be managed carefully. In production, tools like **helmfile** or **ArgoCD** manage multiple releases across environments declaratively.

---

## What's Next?

In **Part 9**, we'll tackle **RBAC and Security** — how to control who can do what in your cluster, how to assign identities to pods, and how to run containers securely.
