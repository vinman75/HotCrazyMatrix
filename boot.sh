#!/bin/sh
# This script runs database migrations and then starts the Gunicorn server.

echo "Running database migrations..."
# Initialize and apply migrations
flask db upgrade

echo "Starting Gunicorn..."
# Start Gunicorn on port 8000, accessible from outside the container
exec gunicorn --bind 0.0.0.0:8000 "run:app"
