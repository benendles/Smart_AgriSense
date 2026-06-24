// Smart AgriSense — CI/CD pipeline.
// Builds the five AI service images + the web app (web/), pushes them to a registry,
// and rolls them all out to the Kubernetes cluster. Configure the credentials below.
pipeline {
  agent any

  environment {
    REGISTRY      = 'docker.io/bendless'          // <-- your registry namespace
    IMAGE_TAG     = "${env.GIT_COMMIT?.take(7) ?: env.BUILD_NUMBER}"
    REGISTRY_CRED = 'dockerhub-creds'             // Jenkins credentials id (username/password)
    KUBECONFIG_CRED = 'agrisense-kubeconfig'      // Jenkins "secret file" credentials id
    ANTHROPIC_KEY = credentials('AgriSense')      // Jenkins "secret text" credential ID — Claude API key
  }

  options { timestamps(); disableConcurrentBuilds() }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Build & Push images') {
      steps {
        // Explicit docker login (--password-stdin) + plain build/push — the exact
        // flow proven to work on the host. Avoids the docker.withRegistry plugin,
        // whose temp-config login misbehaves in this manually-assembled Jenkins
        // container and yields a broken auth despite a valid token.
        withCredentials([usernamePassword(credentialsId: "${REGISTRY_CRED}",
                                           usernameVariable: 'DH_USER',
                                           passwordVariable: 'DH_PASS')]) {
          sh '''
            echo "$DH_PASS" | docker login -u "$DH_USER" --password-stdin
            for svc in plant-detection insect-detection disease-detection crop-recommendation advisory; do
              docker build -t ${REGISTRY}/$svc:${IMAGE_TAG} --build-arg SERVICE=$svc .
              docker push ${REGISTRY}/$svc:${IMAGE_TAG}
              docker tag  ${REGISTRY}/$svc:${IMAGE_TAG} ${REGISTRY}/$svc:latest
              docker push ${REGISTRY}/$svc:latest
            done
            # web app (Next.js) — built from the web/ subfolder
            docker build -t ${REGISTRY}/smart-agrisense:${IMAGE_TAG} web/
            docker push ${REGISTRY}/smart-agrisense:${IMAGE_TAG}
            docker tag  ${REGISTRY}/smart-agrisense:${IMAGE_TAG} ${REGISTRY}/smart-agrisense:latest
            docker push ${REGISTRY}/smart-agrisense:latest
            docker logout
          '''
        }
      }
    }

    stage('Deploy to Kubernetes') {
      steps {
        withCredentials([file(credentialsId: "${KUBECONFIG_CRED}", variable: 'KUBECONFIG')]) {
          sh '''
            kubectl apply -f k8s/namespace.yaml
            kubectl apply -f k8s/mosquitto.yaml
            # advisory service needs the Claude key as a Secret (idempotent upsert)
            kubectl -n agrisense create secret generic advisory-secrets \
              --from-literal=ANTHROPIC_API_KEY="$ANTHROPIC_KEY" \
              --dry-run=client -o yaml | kubectl apply -f -
            # inject the registry + tag into the service manifests, then apply
            sed -e "s|REGISTRY|${REGISTRY}|g" \
                -e "s|:latest|:${IMAGE_TAG}|g" \
                k8s/services.yaml | kubectl apply -f -
            kubectl apply -f k8s/ingress.yaml
            # wait for rollouts to become healthy. 600s (not 180s) because the
            # FIRST cold pull of the ~430MB PyTorch image takes ~2.5min on the VPS;
            # later runs are instant (image cached on the node).
            for d in plant-detection insect-detection disease-detection crop-recommendation advisory; do
              kubectl -n agrisense rollout status deploy/$d --timeout=600s
            done
            # web app — deploys into the same namespace, exposed on NodePort 30080
            sed -e "s|REGISTRY|${REGISTRY}|g" -e "s|:latest|:${IMAGE_TAG}|g" \
                web/k8s/web.yaml | kubectl apply -f -
            kubectl -n agrisense rollout status deploy/web-app --timeout=300s
          '''
        }
      }
    }

    stage('Smoke test') {
      steps {
        // Needs the kubeconfig too — without it kubectl defaults to localhost:8080
        // (which inside this container is Jenkins itself, hence the login page).
        withCredentials([file(credentialsId: "${KUBECONFIG_CRED}", variable: 'KUBECONFIG')]) {
          sh '''
            for d in plant-detection insect-detection disease-detection crop-recommendation advisory; do
              kubectl -n agrisense exec deploy/$d -- curl -fsS http://localhost:8000/health
            done
            kubectl -n agrisense exec deploy/web-app -- wget -qO- http://localhost:3000 >/dev/null && echo "web-app OK"
          '''
        }
      }
    }
  }

  post {
    success { echo "Deployed Smart AgriSense @ ${IMAGE_TAG} — web app at http://72.62.93.99:30080" }
    failure { echo 'Pipeline failed — check the stage logs above.' }
  }
}
