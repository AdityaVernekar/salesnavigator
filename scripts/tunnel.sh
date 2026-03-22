#!/bin/bash

# Configuration
INSTANCE_ID="i-00928c418b109b10f"
REDIS_HOST="master.sales-navy.g3u5fs.aps1.cache.amazonaws.com"

REMOTE_PORT="6379"   # AWS Redis (unchanged)
LOCAL_PORT="6380"    # Your local port (changed)

echo "🚀 Starting Redis tunnel on localhost:$LOCAL_PORT..."

keep_alive() {
  while true; do
    echo "🔗 Forwarding localhost:$LOCAL_PORT → $REDIS_HOST:$REMOTE_PORT"

    aws ssm start-session \
      --target "$INSTANCE_ID" \
      --document-name AWS-StartPortForwardingSessionToRemoteHost \
      --parameters "{
        \"host\":[\"$REDIS_HOST\"],
        \"portNumber\":[\"$REMOTE_PORT\"],
        \"localPortNumber\":[\"$LOCAL_PORT\"]
      }"

    echo "⚠️ Tunnel dropped. Restarting in 5 seconds..."
    sleep 5
  done
}

keep_alive