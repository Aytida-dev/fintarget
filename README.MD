# Installation

## Pre-requisites

- Node.js
- npm
- Redis-server (running locally)

## Steps

1. Install the dependencies

```bash
npm install
```

2. Start the server (Ensure that the Redis server is running locally)

```bash
npm run dev
```

3. Server will start running on port 3000

# APi Endpoints

- POST /api/v1/task
  - Request body: { "user_id":"test_id" }
  - Response: { "message":"Task queued for <user_id>" }

# Working

1. The server receives a POST request with a user_id in the request body.
2. The server spawns a worker which handle all the tasks for that user_id.
3. If a worker is already present for that user_id no new worker is spawned.
4. Each user_id have its own worker which maintain the integrity of the data and rate limiting rules.
5. Worker will shut himself down if task queue for that user_id is empty.
6. Each user_id have their own task queue and a worker.
7. Rate limiting is done mainly using redis to sync the clusters.

# Edge cases

1. If the user_id is not provided in the request body, the server will respond with a 400 status code and a message "User ID is required"
2. If the Redis server is not running, the server will respond with a 500 status code and a message "Internal server error"
3. If the Redis server is running but the connection is lost, the server will respond with a 500 status code and a message "Internal server error"
4. Simountaneous requests for the same user_id at different cluster are handeled by locking the redis.
5. A single cluster will not spawn all the workers due to load balancing from the master.
