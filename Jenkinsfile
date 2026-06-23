// Smart AgriSense — CI/CD pipeline.
// Builds the five service images, pushes them to a registry, and rolls them out
// to the Kubernetes cluster. Configure the credentials/ids marked below in Jenkins.
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
        script {
          def services = ['plant-detection','insect-detection','disease-detection','crop-recommendation','advisory']
          docker.withRegistry("https://${REGISTRY.split('/')[0]}", REGISTRY_CRED) {
            for (svc in services) {
              def img = docker.build(
                "${REGISTRY}/${svc}:${IMAGE_TAG}",
                "--build-arg SERVICE=${svc} ."
              )
              img.push()
              img.push('latest')
            }
          }
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
            # wait for rollouts to become healthy
            for d in plant-detection insect-detection disease-detection crop-recommendation advisory; do
              kubectl -n agrisense rollout status deploy/$d --timeout=180s
            done
          '''
        }
      }
    }

    stage('Smoke test') {
      steps {
        sh '''
          for d in plant-detection insect-detection disease-detection crop-recommendation advisory; do
            kubectl -n agrisense exec deploy/$d -- curl -fsS http://localhost:8000/health
          done
        '''
      }
    }
  }

  post {
    success { echo "Deployed Smart AgriSense @ ${IMAGE_TAG}" }
    failure { echo 'Pipeline failed — check the stage logs above.' }
  }
}
