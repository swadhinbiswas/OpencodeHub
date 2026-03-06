#!/bin/bash
set -e

echo "OpenCodeHub Runner Starting..."

# Wait for Docker daemon if using DinD
if [ -S /var/run/docker.sock ]; then
    echo "Docker socket found"
else
    echo "Waiting for Docker daemon..."
    while ! docker info >/dev/null 2>&1; do
        sleep 1
    done
fi

echo "Docker daemon ready"

# Register runner with server
register_runner() {
    local response=$(curl -sf "${SERVER_URL}/api/runners/register" \
        -H "Content-Type: application/json" \
        -d "{\"token\": \"${RUNNER_TOKEN}\", \"name\": \"$(hostname)\"}")

    if [ $? -eq 0 ]; then
        echo "Runner registered successfully"
        RUNNER_ID=$(echo "$response" | jq -r '.id')
        export RUNNER_ID
    else
        echo "Failed to register runner"
        exit 1
    fi
}

# Poll for jobs
poll_jobs() {
    while true; do
        local response=$(curl -sf "${SERVER_URL}/api/runners/${RUNNER_ID}/jobs" \
            -H "Authorization: Bearer ${RUNNER_TOKEN}")

        if [ $? -eq 0 ] && [ "$(echo "$response" | jq -r '.job')" != "null" ]; then
            local job=$(echo "$response" | jq -r '.job')
            run_job "$job"
        fi

        sleep 5
    done
}

# Run a job
run_job() {
    local job="$1"
    local job_id=$(echo "$job" | jq -r '.id')
    local repo_url=$(echo "$job" | jq -r '.repository.clone_url')
    local ref=$(echo "$job" | jq -r '.ref')
    local workflow=$(echo "$job" | jq -r '.workflow')

    echo "Running job: $job_id"

    # Update job status
    curl -sf "${SERVER_URL}/api/jobs/${job_id}/status" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${RUNNER_TOKEN}" \
        -d '{"status": "in_progress"}'

    # Create work directory
    local work_dir="${RUNNER_WORK_DIR}/${job_id}"
    mkdir -p "$work_dir"
    cd "$work_dir"

    # Clone repository
    git clone --depth 1 --branch "$ref" "$repo_url" .

    # Parse and run workflow
    local exit_code=0

    # Run workflow steps (simplified - real implementation uses pipeline.ts)
    if [ -f ".github/workflows/${workflow}" ]; then
        echo "Running workflow: ${workflow}"

        # Extract and run steps
        local jobs=$(yq -r '.jobs | keys[]' ".github/workflows/${workflow}")

        for job_name in $jobs; do
            echo "Running job: $job_name"

            # Get container image
            local image=$(yq -r ".jobs.${job_name}.[\"runs-on\"]" ".github/workflows/${workflow}")
            case "$image" in
                "ubuntu-latest") image="ubuntu:22.04" ;;
                "ubuntu-22.04") image="ubuntu:22.04" ;;
                *) image="node:20" ;;
            esac

            # Run steps in container
            local steps=$(yq -r ".jobs.${job_name}.steps | length" ".github/workflows/${workflow}")

            for ((i=0; i<steps; i++)); do
                local step_name=$(yq -r ".jobs.${job_name}.steps[$i].name // \"Step $i\"" ".github/workflows/${workflow}")
                local step_run=$(yq -r ".jobs.${job_name}.steps[$i].run // \"\"" ".github/workflows/${workflow}")

                if [ -n "$step_run" ] && [ "$step_run" != "null" ]; then
                    echo "Running step: $step_name"

                    docker run --rm \
                        -v "$work_dir:/workspace" \
                        -w /workspace \
                        -e CI=true \
                        -e GITHUB_SHA="$ref" \
                        "$image" \
                        /bin/sh -c "$step_run" || exit_code=$?

                    if [ $exit_code -ne 0 ]; then
                        echo "Step failed with exit code: $exit_code"
                        break 2
                    fi
                fi
            done
        done
    fi

    # Update job status
    local conclusion="success"
    if [ $exit_code -ne 0 ]; then
        conclusion="failure"
    fi

    curl -sf "${SERVER_URL}/api/jobs/${job_id}/status" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${RUNNER_TOKEN}" \
        -d "{\"status\": \"completed\", \"conclusion\": \"${conclusion}\"}"

    # Cleanup
    cd /
    rm -rf "$work_dir"

    echo "Job completed: $job_id ($conclusion)"
}

# Main
if [ -n "$RUNNER_TOKEN" ] && [ -n "$SERVER_URL" ]; then
    register_runner
    poll_jobs
else
    echo "RUNNER_TOKEN and SERVER_URL must be set"
    echo "Running in standalone mode..."

    # Keep container running
    tail -f /dev/null
fi
