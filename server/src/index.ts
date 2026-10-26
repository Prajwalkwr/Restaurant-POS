import 'dotenv/config';
import http from 'node:http';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';
import { initSocket } from './realtime/socket.js';
import app from './app.js';

const server = http.createServer(app);
initSocket(server);

const port = config.port;
server.listen(port, '0.0.0.0', async () => {
  console.log(`Server listening on ${port}`);
  try {
    const count = await prisma.restaurant.count();
    if (count === 0) {
      console.log('No restaurant found. Run seed to create initial data.');
    }
  } catch (e) {
    console.error(e);
  }
});

process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0); });
