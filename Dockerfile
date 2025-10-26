# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set environment variables, including a default timezone
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV TZ=UTC

# Install tzdata for timezone support
# This allows the container to be configured to any timezone
RUN apt-get update && apt-get install -y tzdata && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container at /app
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code into the container at /app
COPY . .

# Create the instance folder for the database
RUN mkdir -p instance

# Remove Windows-style line endings that can cause "no such file or directory" errors
RUN sed -i 's/\r$//' boot.sh

# Make the startup script executable
RUN chmod +x boot.sh

# Expose port 8000 to the outside world
EXPOSE 8000

# Run boot.sh script when the container launches
ENTRYPOINT ["./boot.sh"]
