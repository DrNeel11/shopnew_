import request from 'supertest';
import { Server } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import pool from '../../src/db/index';
import { migrate } from '../../src/db/migrate';
import { createApp } from '../../src/index';

let httpServer: Server;
let app: ReturnType<typeof createApp>['app'];
const TEST_PORT = 3099;

beforeAll(async () => {
  // Run migrations
  await migrate();
  // Clear existing data
  await pool.query('DELETE FROM tasks');

  const created = createApp();
  app = created.app;
  httpServer = created.server;

  await new Promise<void>((resolve) => {
    httpServer.listen(TEST_PORT, resolve);
  });
});

afterAll(async () => {
  await pool.query('DELETE FROM tasks');
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await pool.end();
});

beforeEach(async () => {
  await pool.query('DELETE FROM tasks');
});

// Helper to connect a WS client
function connectClient(): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = ioClient(`http://localhost:${TEST_PORT}`, {
      transports: ['websocket'],
      autoConnect: false,
    });
    client.on('connect', () => resolve(client));
    client.on('connect_error', reject);
    client.connect();
  });
}

function waitForEvent(socket: ClientSocket, event: string): Promise<unknown> {
  return new Promise((resolve) => {
    socket.once(event, resolve);
  });
}

describe('Conflict Scenarios', () => {
  describe('Concurrent Move + Edit', () => {
    it('preserves both move and edit changes', async () => {
      // Create a task
      const createRes = await request(app)
        .post('/api/tasks')
        .send({ title: 'Task A', column: 'todo' });
      expect(createRes.status).toBe(201);
      const taskId = createRes.body.task.id;
      const v1 = createRes.body.task.version;

      // User A moves task to 'done' (simulated as first, updates version)
      const moveRes = await request(app)
        .post(`/api/tasks/${taskId}/move`)
        .set('x-client-id', 'user-a')
        .send({
          targetColumn: 'done',
          version: v1,
        });
      expect(moveRes.status).toBe(200);
      expect(moveRes.body.task.column).toBe('done');
      const v2 = moveRes.body.task.version;
      expect(v2).toBeGreaterThan(v1);

      // User B edits title with old version (conflict)
      const editRes = await request(app)
        .put(`/api/tasks/${taskId}`)
        .set('x-client-id', 'user-b')
        .send({
          title: 'Task A Updated',
          version: v1,  // stale version
        });
      expect(editRes.status).toBe(200);

      // Both changes must be preserved
      const finalTask = editRes.body.task;
      expect(finalTask.title).toBe('Task A Updated');
      expect(finalTask.column).toBe('done');
      expect(editRes.body.conflict).toBe(true);
      expect(editRes.body.conflictType).toBe('move_edit');
    });
  });

  describe('Concurrent Move + Move', () => {
    it('server version wins and notifies the losing user', async () => {
      // Create task
      const createRes = await request(app)
        .post('/api/tasks')
        .send({ title: 'Contested Task', column: 'todo' });
      const taskId = createRes.body.task.id;
      const v1 = createRes.body.task.version;

      // User A moves to 'inprogress' (first, wins)
      const moveA = await request(app)
        .post(`/api/tasks/${taskId}/move`)
        .set('x-client-id', 'user-a')
        .send({ targetColumn: 'inprogress', version: v1 });
      expect(moveA.status).toBe(200);
      expect(moveA.body.task.column).toBe('inprogress');

      // User B also moves to 'done' with stale version (loses)
      const moveB = await request(app)
        .post(`/api/tasks/${taskId}/move`)
        .set('x-client-id', 'user-b')
        .send({ targetColumn: 'done', version: v1 });  // stale
      expect(moveB.status).toBe(200);
      expect(moveB.body.conflict).toBe(true);
      expect(moveB.body.conflictType).toBe('move_move');
      // Task stays in server's column
      expect(moveB.body.task.column).toBe('inprogress');
    });
  });

  describe('Concurrent Reorder', () => {
    it('final order is consistent when user adds task while another reorders', async () => {
      // Create initial tasks
      const t1 = await request(app).post('/api/tasks').send({ title: 'Task 1', column: 'todo' });
      const t2 = await request(app).post('/api/tasks').send({ title: 'Task 2', column: 'todo' });
      const t3 = await request(app).post('/api/tasks').send({ title: 'Task 3', column: 'todo' });

      const task1 = t1.body.task;
      const task2 = t2.body.task;
      const task3 = t3.body.task;

      // User A reorders: moves Task 3 between Task 1 and Task 2
      const reorderRes = await request(app)
        .post(`/api/tasks/${task3.id}/move`)
        .send({
          targetColumn: 'todo',
          prevTaskId: task1.id,
          nextTaskId: task2.id,
          version: task3.version,
        });
      expect(reorderRes.status).toBe(200);

      // User B adds new task to same column
      const newTaskRes = await request(app)
        .post('/api/tasks')
        .send({ title: 'Task 4', column: 'todo' });
      expect(newTaskRes.status).toBe(201);

      // Fetch all tasks in column
      const tasksRes = await request(app).get('/api/tasks');
      const todoTasks = tasksRes.body.tasks.filter((t: { column: string }) => t.column === 'todo');

      // All 4 tasks should be present
      expect(todoTasks.length).toBe(4);

      // Verify ordering is consistent (positions are unique and ordered)
      const positions = todoTasks.map((t: { position: string }) => parseFloat(t.position));
      for (let i = 0; i < positions.length - 1; i++) {
        expect(positions[i]).toBeLessThan(positions[i + 1]);
      }
    });
  });

  describe('WebSocket real-time sync', () => {
    it('broadcasts task creation to all connected clients', async () => {
      const client1 = await connectClient();
      const client2 = await connectClient();

      const client2Promise = waitForEvent(client2, 'task:created');

      // Client 1 creates a task via WS
      client1.emit('task:create', {
        title: 'WS Task',
        description: 'Created via WebSocket',
        column: 'todo',
      });

      const event = await client2Promise as { task: { title: string } };
      expect(event.task).toBeDefined();
      expect(event.task.title).toBe('WS Task');

      client1.disconnect();
      client2.disconnect();
    });

    it('sends board:state on board:sync request', async () => {
      // Create some tasks first
      await request(app).post('/api/tasks').send({ title: 'Existing Task', column: 'inprogress' });

      const client = await connectClient();
      const statePromise = waitForEvent(client, 'board:state');

      client.emit('board:sync');

      const state = await statePromise as { tasks: { title: string }[] };
      expect(Array.isArray(state.tasks)).toBe(true);
      expect(state.tasks.length).toBeGreaterThan(0);

      client.disconnect();
    });

    it('validates input and emits error for invalid task creation', async () => {
      const client = await connectClient();
      const errorPromise = waitForEvent(client, 'error');

      client.emit('task:create', { title: '' });

      const error = await errorPromise as { message: string };
      expect(error.message).toBeDefined();

      client.disconnect();
    });
  });

  describe('API Validation', () => {
    it('rejects task creation with empty title', async () => {
      const res = await request(app).post('/api/tasks').send({ title: '' });
      expect(res.status).toBe(400);
    });

    it('rejects task creation with invalid column', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ title: 'Test', column: 'invalid' });
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent task', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app).get(`/api/tasks/${fakeId}`);
      expect(res.status).toBe(404);
    });

    it('rejects invalid UUID in params', async () => {
      const res = await request(app).get('/api/tasks/not-a-uuid');
      expect(res.status).toBe(400);
    });
  });
});
