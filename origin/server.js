// Demo origin API for api-contract-firewall.
// A tiny, realistic-looking backend to point the proxy at during demos.
// Set BREAK_CONTRACT=1 to simulate a silent breaking change (id -> _id).

'use strict';

const fastify = require('fastify')({ logger: false });

const users = [
  { id: 1, name: 'Ayesha Khan', email: 'ayesha@example.com', role: 'admin', created_at: '2026-06-12T09:14:00Z' },
  { id: 2, name: 'Bilal Ahmed', email: 'bilal@example.com', role: 'developer', created_at: '2026-07-01T14:02:00Z' },
  { id: 3, name: 'Fatima Raza', email: 'fatima@example.com', role: 'viewer', created_at: '2026-08-19T11:47:00Z' },
];

const orders = [
  {
    id: 101, user_id: 1, status: 'shipped', total: 149.99, currency: 'USD',
    items: [{ sku: 'KB-2401', qty: 2, price: 49.99 }, { sku: 'MS-1102', qty: 1, price: 50.01 }],
    created_at: '2026-09-28T08:30:00Z',
  },
  {
    id: 102, user_id: 2, status: 'processing', total: 29.99, currency: 'USD',
    items: [{ sku: 'CB-3300', qty: 1, price: 29.99 }],
    created_at: '2026-10-01T16:05:00Z',
  },
];

// Scripted breaking change: rename `id` -> `_id` on every payload.
// The proxy must learn the original contract first, then flag this as breaking.
function maybeBreak(payload) {
  if (process.env.BREAK_CONTRACT !== '1') return payload;
  const rename = (obj) => {
    if (Array.isArray(obj)) return obj.map(rename);
    if (obj && typeof obj === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(obj)) out[k === 'id' ? '_id' : k] = rename(v);
      return out;
    }
    return obj;
  };
  return rename(payload);
}

fastify.get('/health', async () => ({ ok: true, contract: process.env.BREAK_CONTRACT === '1' ? 'broken' : 'stable' }));

fastify.get('/users', async () => maybeBreak(users));
fastify.get('/users/:id', async (req, reply) => {
  const user = users.find((u) => u.id === Number(req.params.id));
  if (!user) return reply.code(404).send({ error: 'user_not_found' });
  return maybeBreak(user);
});

fastify.get('/orders', async () => maybeBreak(orders));
fastify.get('/orders/:id', async (req, reply) => {
  const order = orders.find((o) => o.id === Number(req.params.id));
  if (!order) return reply.code(404).send({ error: 'order_not_found' });
  return maybeBreak(order);
});

const port = Number(process.env.PORT || 3001);
fastify.listen({ port, host: '0.0.0.0' }).then(() => {
  // eslint-disable-next-line no-console
  console.log(`demo origin listening on :${port} (BREAK_CONTRACT=${process.env.BREAK_CONTRACT || '0'})`);
});
