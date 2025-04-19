#!/bin/sh
set -e

# Set restrictive permissions on the data volume mount point
if [ -d "/data" ]; then
    echo "Setting permissions for /data directory to 700..."
    chmod 700 /data
else
    echo "Warning: /data directory not found, skipping chmod."
fi

# Execute the original CMD
echo "Executing command: $@"
exec "$@"
