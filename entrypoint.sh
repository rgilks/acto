#!/bin/sh
set -e

# Check if GOOGLE_APP_CREDS_JSON and GOOGLE_APPLICATION_CREDENTIALS are set
if [ -n "$GOOGLE_APP_CREDS_JSON" ] && [ -n "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
    # Define the path within /tmp using the filename from the original env var
    CREDENTIALS_FILENAME=$(basename "$GOOGLE_APPLICATION_CREDENTIALS")
    CREDENTIALS_PATH="/tmp/$CREDENTIALS_FILENAME"

    echo "Attempting to write GOOGLE_APPLICATION_CREDENTIALS file to $CREDENTIALS_PATH"
    # Create the directory if it doesn't exist (ensure /tmp exists and is writable)
    mkdir -p "$(dirname "$CREDENTIALS_PATH")" # This will just ensure /tmp exists, which it should
    # Write the JSON content from the environment variable to the file in /tmp
    printf '%s' "$GOOGLE_APP_CREDS_JSON" >"$CREDENTIALS_PATH"
    # Set restrictive permissions (optional but recommended)
    chmod 600 "$CREDENTIALS_PATH"
    echo "GOOGLE_APPLICATION_CREDENTIALS file written successfully to $CREDENTIALS_PATH."

    # IMPORTANT: Update the environment variable to point to the new location
    export GOOGLE_APPLICATION_CREDENTIALS="$CREDENTIALS_PATH"
    echo "Updated GOOGLE_APPLICATION_CREDENTIALS to point to $CREDENTIALS_PATH"
else
    echo "GOOGLE_APP_CREDS_JSON or GOOGLE_APPLICATION_CREDENTIALS not set. Skipping key file creation."
fi

# Execute the original CMD
echo "Executing command: $@"
exec "$@"
