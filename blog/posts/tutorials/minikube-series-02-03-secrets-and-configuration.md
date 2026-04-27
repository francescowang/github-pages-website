This is Part 3 of Series 2 — a 10-part intermediate Kubernetes series using Minikube. We explore Secrets, ConfigMaps in depth, and the security realities you need to know.

---

## The Series

1. [Rolling Updates and Rollbacks](/blog/view.html?slug=minikube-series-02-01-rolling-updates-rollbacks&folder=tutorials)
2. [Namespaces and Resource Quotas](/blog/view.html?slug=minikube-series-02-02-namespaces-resource-quotas&folder=tutorials)
3. **Secrets and Configuration** ← you are here
4. [Persistent Storage](/blog/view.html?slug=minikube-series-02-04-persistent-storage&folder=tutorials)
5. [Networking from the Inside](/blog/view.html?slug=minikube-series-02-05-networking-internals&folder=tutorials)
6. [Jobs, CronJobs, and Batch Work](/blog/view.html?slug=minikube-series-02-06-jobs-cronjobs-batch&folder=tutorials)
7. [StatefulSets and Databases](/blog/view.html?slug=minikube-series-02-07-statefulsets-databases&folder=tutorials)
8. [Helm and Chart Packaging](/blog/view.html?slug=minikube-series-02-08-helm-chart-packaging&folder=tutorials)
9. [RBAC and Security](/blog/view.html?slug=minikube-series-02-09-rbac-security&folder=tutorials)
10. [Debugging Like an SRE](/blog/view.html?slug=minikube-series-02-10-debugging-like-an-sre&folder=tutorials)

---

## Introduction

In Series 1 Part 8, we used a ConfigMap to inject a custom NGINX configuration into our frontend pods. That was a brief introduction. In this part, we go much deeper into the full configuration story: ConfigMaps for non-sensitive data, Secrets for credentials, and the important security realities that most tutorials skip.

Every real application needs configuration — database hostnames, feature flags, log levels — and credentials — passwords, API keys, TLS certificates. How you manage these in Kubernetes matters. Get it wrong, and you're committing passwords to git or leaking secrets between namespaces.

---

## Prerequisites

- Minikube running: `minikube start --driver=docker`
- Working in the default namespace:

```sh
kubectl config set-context --current --namespace=default
kubectl delete all --all
```

---

## 1. ConfigMaps: The Full Picture

In Series 1 Part 8, we created a ConfigMap from YAML and mounted it as a file. But there are several ways to create and consume ConfigMaps, each suited to different situations.

### Creating ConfigMaps

**From literals (key-value pairs):**

```sh
kubectl create configmap app-settings \
  --from-literal=DATABASE_HOST=postgres \
  --from-literal=DATABASE_PORT=5432 \
  --from-literal=LOG_LEVEL=info
```

**From a file:**

Create `app.properties`:
```
database.host=postgres
database.port=5432
log.level=info
```

```sh
kubectl create configmap app-settings-file --from-file=app.properties
```

The entire file becomes a single key-value pair — the key is the filename (`app.properties`), the value is the file contents.

**From a directory:**

```sh
kubectl create configmap app-config-dir --from-file=./config/
```

Every file in the directory becomes a key-value pair. Subdirectories are ignored.

**From YAML (recommended for version control):**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-settings
data:
  DATABASE_HOST: "postgres"
  DATABASE_PORT: "5432"
  LOG_LEVEL: "info"
  # Multi-line values work too
  nginx.conf: |
    server {
        listen 80;
        location / {
            root /usr/share/nginx/html;
        }
    }
```

### Viewing ConfigMap contents

```sh
kubectl get configmap app-settings -o yaml
```

```sh
kubectl describe configmap app-settings
```

---

## 2. Consuming ConfigMaps

There are two ways to use a ConfigMap in a pod: **environment variables** and **volume mounts**. They behave differently, and choosing the right one matters.

### As environment variables

Create `~/k8s-tutorial-2/configmap-env-demo.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-settings
data:
  DATABASE_HOST: "postgres"
  DATABASE_PORT: "5432"
  LOG_LEVEL: "info"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: demo-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: demo
  template:
    metadata:
      labels:
        app: demo
    spec:
      containers:
      - name: app
        image: busybox
        command: ["sh", "-c", "while true; do echo \"DB=$DATABASE_HOST:$DATABASE_PORT LOG=$LOG_LEVEL\"; sleep 10; done"]
        envFrom:
        - configMapRef:
            name: app-settings
```

```sh
kubectl apply -f ~/k8s-tutorial-2/configmap-env-demo.yaml
```

**`envFrom`** bulk-loads every key in the ConfigMap as an environment variable. The keys become variable names: `DATABASE_HOST`, `DATABASE_PORT`, `LOG_LEVEL`.

You can also load specific keys:

```yaml
env:
- name: DB_HOST                    # Variable name in the container
  valueFrom:
    configMapKeyRef:
      name: app-settings           # ConfigMap name
      key: DATABASE_HOST            # Key in the ConfigMap
```

Verify the environment variables are set:

```sh
kubectl logs deployment/demo-app
```

```
DB=postgres:5432 LOG=info
```

### As volume mounts (files)

```yaml
spec:
  containers:
  - name: app
    image: nginx:alpine
    volumeMounts:
    - name: config-volume
      mountPath: /etc/config
  volumes:
  - name: config-volume
    configMap:
      name: app-settings
```

This creates a file for each key in the ConfigMap under `/etc/config/`. The file name is the key, the file contents are the value:

```
/etc/config/
├── DATABASE_HOST     (contains "postgres")
├── DATABASE_PORT     (contains "5432")
└── LOG_LEVEL         (contains "info")
```

### The critical difference: update behaviour

This is where most people get caught out.

**Volume-mounted ConfigMaps update automatically.** When you change the ConfigMap, Kubernetes updates the files inside running pods. The update isn't instant — it can take up to the kubelet's sync period (typically 30-60 seconds). Your application needs to watch for file changes or periodically re-read the file.

**Environment variables do NOT update.** They're injected when the container starts and frozen. Changing the ConfigMap has no effect on running pods. You must restart the pods:

```sh
kubectl rollout restart deployment demo-app
```

| Method | Auto-updates? | When to use |
|--------|:------------:|-------------|
| Environment variables | No | Simple settings your app reads on startup |
| Volume mounts | Yes (delayed) | Configuration files your app can hot-reload |

### Immutable ConfigMaps

If you know a ConfigMap won't change, mark it as immutable:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-settings
immutable: true
data:
  DATABASE_HOST: "postgres"
```

Benefits:
- Kubernetes doesn't watch it for changes — reduces load on the API server
- Prevents accidental modifications
- Clear signal to operators: "this is fixed"

Once set, you can't make it mutable again — you must delete and recreate the ConfigMap.

---

## 3. Secrets

Secrets look almost identical to ConfigMaps but are intended for sensitive data: passwords, API keys, TLS certificates, SSH keys.

### Creating Secrets

**From literals:**

```sh
kubectl create secret generic db-credentials \
  --from-literal=username=admin \
  --from-literal=password='s3cur3-p@ssw0rd'
```

**From YAML (values must be base64-encoded):**

```sh
# Encode the values
echo -n 'admin' | base64
# YWRtaW4=

echo -n 's3cur3-p@ssw0rd' | base64
# czNjdXIzLXBAc3N3MHJk
```

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
type: Opaque
data:
  username: YWRtaW4=
  password: czNjdXIzLXBAc3N3MHJk
```

**Using stringData (plain text, auto-encoded):**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
type: Opaque
stringData:
  username: admin
  password: s3cur3-p@ssw0rd
```

`stringData` is a convenience — Kubernetes base64-encodes the values for you when storing them. This is easier to read and write, but remember that if your YAML file is committed to git, the passwords are still visible in plain text. **Never commit Secrets YAML files to git.**

### Secret types

| Type | Purpose | Example |
|------|---------|---------|
| `Opaque` | Arbitrary key-value data | Database passwords, API keys |
| `kubernetes.io/tls` | TLS certificate + key | Ingress HTTPS termination |
| `kubernetes.io/dockerconfigjson` | Docker registry credentials | Pulling images from private registries |
| `kubernetes.io/basic-auth` | Username + password | Basic authentication |

### Consuming Secrets in pods

Secrets are consumed exactly like ConfigMaps — either as environment variables or volume mounts:

Create `~/k8s-tutorial-2/secret-demo.yaml`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
type: Opaque
stringData:
  username: admin
  password: s3cur3-p@ssw0rd
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: secret-demo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: secret-demo
  template:
    metadata:
      labels:
        app: secret-demo
    spec:
      containers:
      - name: app
        image: busybox
        command: ["sh", "-c", "while true; do echo \"Connected as $DB_USER\"; sleep 10; done"]
        env:
        - name: DB_USER
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: username
        - name: DB_PASS
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: password
```

```sh
kubectl apply -f ~/k8s-tutorial-2/secret-demo.yaml
```

Verify:

```sh
kubectl logs deployment/secret-demo
```

```
Connected as admin
```

### Mounting Secrets as files

This is preferred for sensitive data because files can have restricted permissions:

```yaml
spec:
  containers:
  - name: app
    image: busybox
    command: ["sh", "-c", "cat /etc/secrets/username; sleep 3600"]
    volumeMounts:
    - name: secret-volume
      mountPath: /etc/secrets
      readOnly: true
  volumes:
  - name: secret-volume
    secret:
      secretName: db-credentials
      defaultMode: 0400    # Read-only for the file owner
```

The `defaultMode: 0400` sets file permissions to read-only. This is a good practice — it limits what a compromised process can do with the credentials.

---

## 4. The Security Reality

This is the section most tutorials skip. Let's be honest about what Secrets actually provide.

### Secrets are NOT encrypted

By default, Secrets are stored in etcd as **base64-encoded text**. Base64 is an encoding, not encryption — it's trivially reversible:

```sh
echo 'czNjdXIzLXBAc3N3MHJk' | base64 --decode
# s3cur3-p@ssw0rd
```

Anyone with access to read Secrets from the API server (or direct access to etcd) can read your passwords. Base64 just prevents them from being visible in casual `kubectl get` output.

### What Secrets do provide

Despite not being encrypted at rest by default, Secrets have security benefits over ConfigMaps:

1. **Access control** — RBAC can restrict Secret access separately from ConfigMaps. You can grant a team access to ConfigMaps but not Secrets.
2. **Reduced logging** — Kubernetes avoids logging Secret values in audit logs and API responses.
3. **tmpfs mounts** — when mounted as files, Secrets are stored in the node's memory (tmpfs), not written to disk.
4. **Intent clarity** — marking something as a Secret tells operators "this is sensitive, handle with care."

### Viewing Secrets

```sh
# The secret values are shown as base64
kubectl get secret db-credentials -o yaml
```

```yaml
data:
  password: czNjdXIzLXBAc3N3MHJk
  username: YWRtaW4=
```

```sh
# Decode a specific value
kubectl get secret db-credentials -o jsonpath='{.data.password}' | base64 --decode
```

### Enabling encryption at rest

For production clusters, you can enable **encryption at rest** so Secrets are encrypted in etcd. On Minikube, this demonstrates the concept:

```sh
# View the current encryption config (Minikube)
minikube ssh -- sudo cat /etc/kubernetes/manifests/kube-apiserver.yaml | grep encryption
```

In a production cluster, you'd configure an `EncryptionConfiguration` resource that tells the API server to encrypt Secrets using AES-CBC or AES-GCM before storing them in etcd. This is beyond our local Minikube scope but important to know about.

### Best practices for Secrets

1. **Never commit Secrets to git** — use `stringData` for readability but don't version-control the file
2. **Use RBAC to restrict access** — not everyone needs to read Secrets (Part 9)
3. **Prefer file mounts over env vars** — environment variables can leak via `/proc`, crash dumps, and logging. Files with `0400` permissions are safer
4. **Rotate credentials regularly** — if a Secret is compromised, a rotation limits the blast radius
5. **Consider external secret managers** — in production, tools like HashiCorp Vault, AWS Secrets Manager, or Sealed Secrets provide proper encryption and audit trails

---

## 5. Practical Pattern: Separating Config from Credentials

A common pattern: use ConfigMaps for non-sensitive configuration and Secrets for credentials. The application reads both.

Create `~/k8s-tutorial-2/full-config-demo.yaml`:

```yaml
# Non-sensitive configuration
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  DATABASE_HOST: "postgres.default.svc.cluster.local"
  DATABASE_PORT: "5432"
  DATABASE_NAME: "myapp"
  LOG_LEVEL: "info"
  CACHE_TTL: "300"
---
# Sensitive credentials
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
type: Opaque
stringData:
  DATABASE_USER: "app_user"
  DATABASE_PASSWORD: "pr0duction-p@ss"
  API_KEY: "sk-abc123def456"
---
# Application that consumes both
apiVersion: apps/v1
kind: Deployment
metadata:
  name: configured-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: configured-app
  template:
    metadata:
      labels:
        app: configured-app
    spec:
      containers:
      - name: app
        image: busybox
        command: ["sh", "-c", "echo \"Config: host=$DATABASE_HOST db=$DATABASE_NAME log=$LOG_LEVEL\"; echo \"Secrets: user=$DATABASE_USER (password hidden)\"; sleep 3600"]
        envFrom:
        - configMapRef:
            name: app-config
        - secretRef:
            name: app-secrets
```

```sh
kubectl apply -f ~/k8s-tutorial-2/full-config-demo.yaml
```

```sh
kubectl logs deployment/configured-app
```

```
Config: host=postgres.default.svc.cluster.local db=myapp log=info
Secrets: user=app_user (password hidden)
```

The ConfigMap (`app-config`) can be safely committed to git. The Secret (`app-secrets`) should not be.

### Version control strategy

```
git repository/
├── k8s/
│   ├── deployment.yaml       ← committed
│   ├── service.yaml          ← committed
│   ├── configmap.yaml        ← committed (non-sensitive)
│   ├── secret.yaml           ← IN .gitignore (sensitive!)
│   └── secret.yaml.example   ← committed (template with dummy values)
```

The `.example` file shows the structure without real values:

```yaml
# secret.yaml.example — copy to secret.yaml and fill in real values
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
type: Opaque
stringData:
  DATABASE_USER: "CHANGE_ME"
  DATABASE_PASSWORD: "CHANGE_ME"
  API_KEY: "CHANGE_ME"
```

---

## 6. ConfigMap and Secret Updates: The Full Story

Understanding how updates propagate is essential. Let's test it thoroughly.

### Test setup

Create `~/k8s-tutorial-2/update-test.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: update-test-config
data:
  MESSAGE: "Hello from version 1"
  config.txt: |
    version=1
    greeting=hello
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: update-test
spec:
  replicas: 1
  selector:
    matchLabels:
      app: update-test
  template:
    metadata:
      labels:
        app: update-test
    spec:
      containers:
      - name: app
        image: busybox
        command: ["sh", "-c", "while true; do echo \"ENV: $MESSAGE\"; echo \"FILE: $(cat /etc/config/config.txt)\"; echo '---'; sleep 5; done"]
        env:
        - name: MESSAGE
          valueFrom:
            configMapKeyRef:
              name: update-test-config
              key: MESSAGE
        volumeMounts:
        - name: config
          mountPath: /etc/config
      volumes:
      - name: config
        configMap:
          name: update-test-config
```

```sh
kubectl apply -f ~/k8s-tutorial-2/update-test.yaml
```

Watch the logs:

```sh
kubectl logs -f deployment/update-test
```

```
ENV: Hello from version 1
FILE: version=1
greeting=hello
---
```

### Update the ConfigMap

In a new terminal, update the ConfigMap:

```sh
kubectl patch configmap update-test-config -p '{"data":{"MESSAGE":"Hello from version 2","config.txt":"version=2\ngreeting=hi"}}'
```

Keep watching the logs. After 30-60 seconds:

```
ENV: Hello from version 1          ← environment variable unchanged!
FILE: version=2                     ← file updated!
greeting=hi
---
```

**The file updated but the environment variable didn't.** This confirms the behaviour we described earlier:
- Volume-mounted values update automatically (with a delay)
- Environment variables are frozen at container startup

To update the environment variable, restart the pods:

```sh
kubectl rollout restart deployment update-test
```

Now the new pod will have `MESSAGE=Hello from version 2`.

---

## 7. TLS Secrets for Ingress

A common use case: storing TLS certificates as Secrets for HTTPS termination on Ingress.

### Generate a self-signed certificate (for testing)

```sh
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout tls.key -out tls.crt \
  -subj "/CN=myapp.local/O=Tutorial"
```

### Create the TLS Secret

```sh
kubectl create secret tls myapp-tls \
  --cert=tls.crt \
  --key=tls.key
```

### Use it in an Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ingress
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - myapp.local
    secretName: myapp-tls
  rules:
  - host: myapp.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
```

The Ingress controller reads the TLS Secret and uses it to terminate HTTPS. Requests arrive encrypted and are decrypted by the controller before being forwarded to the backend Service.

Clean up the generated files:

```sh
rm -f tls.key tls.crt
```

---

## Cleanup

```sh
kubectl delete all --all
kubectl delete configmap --all
kubectl delete secret --all
```

(The default service account secret will be recreated automatically.)

---

## What Problem Did We Just Solve?

We learned the complete configuration management story in Kubernetes:

1. **ConfigMaps** store non-sensitive configuration — environment variables, config files, feature flags
2. **Secrets** store sensitive data — passwords, API keys, TLS certificates
3. **Volume mounts vs environment variables** have different update behaviours — mounted files auto-update, env vars are frozen
4. **Secrets are base64-encoded, not encrypted** — understand the security implications before trusting them with production credentials
5. **The separation pattern** — ConfigMaps in git, Secrets outside git, both consumed by the same pod

### What would break in production?

- We're storing Secrets in plain YAML files. In production, use **Sealed Secrets** (encrypted Secrets that can be committed to git) or an external secret manager like **HashiCorp Vault** or **AWS Secrets Manager**.
- We haven't restricted who can read Secrets. Any user with `kubectl` access to the namespace can decode them. **RBAC** (Part 9) is essential.
- Our TLS certificate is self-signed. In production, use **cert-manager** to automatically provision and renew certificates from Let's Encrypt.

---

## What's Next?

In **Part 4**, we'll tackle **Persistent Storage** — how to give your applications storage that survives pod restarts and deletions. We'll learn about Volumes, PersistentVolumes, PersistentVolumeClaims, and StorageClasses.
