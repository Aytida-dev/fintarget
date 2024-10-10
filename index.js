const cluster = require('cluster');
const numCPUs = 2

if (cluster.isMaster) {

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker) => {
        console.log(`Worker ${worker.process.pid} died`);
        cluster.fork();
    });
}
else {
    const express = require('express');
    const Redis = require('ioredis');
    const fs = require('fs');

    const redis = new Redis();
    const app = express();
    app.use(express.json());

    const WORKER_KEY = (userId) => `worker:${userId}:active`;

    async function enqueueTask(userId) {
        try {
            await redis.rpush(`queue:${userId}`, `${userId}`);

            const isWorkerActive = await redis.get(WORKER_KEY(userId));
            if (!isWorkerActive) {
                const lockKey = `lock:${userId}:worker`;
                const lockAcquired = await redis.set(lockKey, 'locked', 'NX', 'EX', 4);
                if (!lockAcquired) {
                    return;
                }

                await redis.set(WORKER_KEY(userId), '1');
                spawnUserWorker(userId);
            }
        } catch (error) {
            console.error(error);
        }
    }

    function spawnUserWorker(userId) {

        const processQueue = async () => {

            const now = Date.now();
            const secondKey = `ratelimit:${userId}:second`;
            const minuteKey = `ratelimit:${userId}:minute`;

            const [secondCount, minuteCount] = await Promise.all([
                redis.zcount(secondKey, now - 1000, now),
                redis.zcount(minuteKey, now - 60000, now)
            ]);

            if (secondCount < 1 && minuteCount < 20) {
                const task = await redis.lpop(`queue:${userId}`);
                if (task) {
                    await handleTask(task);

                    await Promise.all([
                        redis.zadd(secondKey, now, now.toString()),
                        redis.zadd(minuteKey, now, now.toString()),
                        redis.expire(secondKey, 2),
                        redis.expire(minuteKey, 61)
                    ]);
                }
            }

            const queueLength = await redis.llen(`queue:${userId}`);

            if (queueLength > 0) {
                setTimeout(processQueue, 1000);
            } else {
                stopWorker(userId)
            }
        };

        processQueue();
    }

    async function stopWorker(userId) {
        await redis.del(WORKER_KEY(userId));
    }

    async function handleTask(user_id) {
        console.log(`${user_id}-task completed at-${Date.now()}`);

        fs.appendFileSync('log.txt', `${user_id}-task completed at-${Date.now()}\n`);
    }

    app.post('/api/v1/task', async (req, res) => {
        const { user_id } = req.body;

        if (!user_id) {
            return res.status(400).json({ message: 'user_id is required' });
        }

        try {
            await enqueueTask(user_id);
            res.status(200).json({ message: `Task queued for ${user_id}` });

        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Worker ${process.pid} is listening on port ${PORT}`);
    });
}