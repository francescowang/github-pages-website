# Kubernetes 101: Control Plane and Worker Nodes

This is a dummy post to test the new blog workflow and verify that Markdown posts can be listed and opened from the Blog tab.

## What is the control plane?

The Kubernetes control plane is the brain of the cluster. It decides what should run, where it should run, and whether cluster state matches your desired state.

Key components include:

- `kube-apiserver`: the entry point for all cluster operations.
- `etcd`: the persistent key-value store for cluster state.
- `kube-scheduler`: chooses which node should run new Pods.
- `kube-controller-manager`: runs reconciliation loops (deployments, nodes, endpoints, and more).

## What are worker nodes?

Worker nodes are where your application containers actually run.

Each worker node typically runs:

- `kubelet`: talks to the API server and ensures Pods are running as requested.
- `container runtime`: runs containers (for example, containerd).
- `kube-proxy`: handles service networking and traffic forwarding.

## How they work together

1. You apply a Deployment manifest.
2. The API server stores desired state in `etcd`.
3. The scheduler picks a worker node.
4. The kubelet on that node starts the Pod containers.
5. Controllers keep reconciling until actual state matches desired state.

## Why this split matters

Separating control-plane responsibilities from worker-node execution gives Kubernetes resilience and scalability. You can scale worker nodes for workloads and scale control-plane components for management reliability.

---

Dummy validation complete: if you can click this post from the Blog section and open it in the viewer, your Markdown blog pipeline is working.