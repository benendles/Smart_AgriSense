# Smart AgriSense — Cloud Deployment Guide (VPS · Docker · Kubernetes · Jenkins)

This guide takes the four AI microservices from this repository to a running
deployment on a VPS, ready for the Raspberry Pi to connect to. Two paths are
documented:

- **Path A — Docker Compose** (simplest; one VPS, good for the dissertation demo)
- **Path B — Kubernetes + Jenkins** (the full CI/CD setup you described)

---

## 0. Architecture recap

```
  ┌─────────────┐   capture cmd (MQTT)   ┌──────────────────── VPS ───────────────────┐
  │ Raspberry   │ ◀───────────────────── │  Mosquitto broker (:1883 / NodePort 31883) │
  │ Pi (farm)   │                        │                                            │
  │  • camera   │   image upload (HTTPS)  │  plant-detection      :8000  (/plant)      │
  │  • sensors  │ ─────────────────────▶ │  insect-detection     :8000  (/insect)     │
  │  pi_agent.py│   sensor JSON (HTTPS)   │  disease-detection    :8000  (/disease)    │
  └─────────────┘ ─────────────────────▶ │  crop-recommendation  :8000  (/recommendation)
        ▲                                 └────────────────────────────────────────────┘
        │ polls /latest                                  ▲
   ┌────┴───────────────┐                                │ *_SERVICE_URL
   │ Next.js web app    │ ───────────────────────────────┘
   │ (smart-agrisense)  │
   └────────────────────┘
```

- **Capture flow:** farmer clicks *Take Image Now* → web app calls `/<svc>/capture`
  → service publishes to MQTT topic `agrisense/camera/capture` → Pi captures a
  photo → Pi POSTs it to `/<svc>/analyze` → web app reads `/<svc>/latest`.
- **Sensor flow:** Pi reads sensors → POSTs to `/recommendation/predict` →
  web app reads `/recommendation/latest`.
- Each service **bakes its model weights into its image** — no model volumes,
  no download at boot.

The endpoints/ports are the contract; they were verified end-to-end with
`pi_relay_simulator.py` (see "Verify" below).

---

## Path A — Docker Compose (single VPS)

### A1. Provision the VPS
- Ubuntu 22.04+, **2 vCPU / 4 GB RAM minimum** (PyTorch CPU inference).
- Install Docker Engine + compose plugin:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER && newgrp docker
  ```

### A2. Copy the project and configure
```bash
scp -r agrisense-services user@VPS_IP:~/agrisense-services
cd ~/agrisense-services
cp .env.example .env            # edit PUBLIC_API_URL, REGISTRY if pushing images
```

### A3. Build & run the whole stack
```bash
docker compose up -d --build     # builds 4 images + starts mosquitto
docker compose ps                # all should be "healthy"
```

### A4. Open firewall ports
| Port | Purpose | Who connects |
|------|---------|--------------|
| 1883 | MQTT | Raspberry Pi |
| 4003–4006 | service APIs | web app + Pi |
```bash
sudo ufw allow 1883/tcp && sudo ufw allow 4003:4006/tcp
```
> Production: put the services behind an Nginx reverse proxy with TLS (Let's
> Encrypt) and expose only 443 + 1883. Then the Pi/web app use `https://...`.

### A5. Point the web app at the VPS
In `smart-agrisense/.env.local` (or your hosting provider's env settings):
```env
PLANT_DETECTION_SERVICE_URL=http://VPS_IP:4003
INSECT_DETECTION_SERVICE_URL=http://VPS_IP:4004
DISEASE_SERVICE_URL=http://VPS_IP:4005
RECOMMENDATION_SERVICE_URL=http://VPS_IP:4006
```
Restart the web app. Done — it now serves live model output instead of mock data.

---

## Path B — Kubernetes + Jenkins CI/CD

### B1. Prerequisites
- A Kubernetes cluster on the VPS (k3s is ideal for a single node):
  ```bash
  curl -sfL https://get.k3s.io | sh -          # installs k3s + kubectl
  sudo k3s kubectl get nodes
  ```
- An **ingress controller** (k3s ships Traefik; these manifests assume
  `ingressClassName: nginx` — install ingress-nginx, or change the class).
- A **container registry** (Docker Hub, GHCR, or a private one).

### B2. Manifests (in `k8s/`)
| File | Contents |
|------|----------|
| `namespace.yaml` | `agrisense` namespace |
| `mosquitto.yaml` | broker Deployment + ConfigMap + NodePort `31883` |
| `services.yaml` | the 4 Deployments + ClusterIP Services (probes, resource limits) |
| `ingress.yaml` | path routing `/plant /insect /disease /recommendation` |

### B3. Manual first deploy (optional sanity check)
```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/mosquitto.yaml
sed 's|REGISTRY|docker.io/youruser|g' k8s/services.yaml | kubectl apply -f -
kubectl apply -f k8s/ingress.yaml
kubectl -n agrisense get pods -w
```

### B4. Jenkins pipeline (`Jenkinsfile`)
Stages: **Checkout → Build & Push (4 images) → Deploy to k8s → Smoke test.**

Configure in Jenkins:
1. Credentials:
   - `dockerhub-creds` — registry username/password (Username/Password kind).
   - `agrisense-kubeconfig` — the cluster kubeconfig (Secret file kind).
2. Edit `REGISTRY` at the top of the `Jenkinsfile`.
3. Create a **Pipeline** job → *Pipeline script from SCM* → point at this repo.
4. (Optional) add a GitHub webhook so every push triggers a build.

On each run Jenkins builds `${REGISTRY}/<service>:<git-sha>`, pushes it, injects
the tag into `k8s/services.yaml`, applies the manifests, waits for the rollout,
and curls every `/health`.

### B5. Expose the API host
Point a DNS A-record `api.your-domain.com` → VPS IP, set the same host in
`ingress.yaml`, and (recommended) add cert-manager for automatic TLS. The Pi
then uses `CLOUD_API=https://api.your-domain.com` with `USE_INGRESS=true`.

---

## Verify the deployment

From your laptop or the VPS, run the bundled simulator against the live stack —
it reproduces exactly what the Pi does:

```bash
python3 pi_relay_simulator.py http://VPS_IP          # docker-compose (ports)
# expected tail: "ALL SYSTEMS OPERATIONAL ✅"
```
Or hit a health endpoint directly:
```bash
curl http://VPS_IP:4003/health
# {"status":"ok","device":"cpu","model":"best_plant_model.pth"}
```

Then connect the real hardware — see **RASPBERRY_PI_GUIDE.md**.

---

## Operations cheat-sheet

| Task | Docker Compose | Kubernetes |
|------|----------------|------------|
| Logs | `docker compose logs -f plant-detection` | `kubectl -n agrisense logs -f deploy/plant-detection` |
| Restart | `docker compose restart disease-detection` | `kubectl -n agrisense rollout restart deploy/disease-detection` |
| Update | `docker compose up -d --build` | push to git → Jenkins redeploys |
| Scale | n/a | `kubectl -n agrisense scale deploy/insect-detection --replicas=2` |
| Status | `docker compose ps` | `kubectl -n agrisense get pods` |
