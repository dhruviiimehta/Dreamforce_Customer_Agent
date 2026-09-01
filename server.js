// Custom json-server so the customer-agent endpoints that need real logic
// (cancel, tracking sub-resource, stock sub-resource) behave correctly.
//
//   npm install json-server@0.17.4
//   node server.js            -> http://localhost:3000
//
// Or, for plain CRUD only (no custom routes):
//   npx json-server@0.17 db.json --routes routes.json

const jsonServer = require("json-server");
const server = jsonServer.create();
const router = jsonServer.router("db.json");
const middlewares = jsonServer.defaults();
const db = router.db; // lowdb instance

server.use(middlewares);
server.use(jsonServer.bodyParser);

// GET /shipments/:id/tracking  -> just the tracking events + summary
server.get("/shipments/:id/tracking", (req, res) => {
  const s = db.get("shipments").getById(Number(req.params.id)).value();
  if (!s) return res.status(404).jsonp({ error: "shipment not found" });
  res.jsonp({
    shipmentId: s.id,
    carrier: s.carrier,
    trackingNo: s.trackingNo,
    status: s.status,
    eta: s.eta,
    events: s.tracking || [],
  });
});

// GET /products/:sku/stock  -> just stock-by-store for the SKU
server.get("/products/:sku/stock", (req, res) => {
  const p = db.get("products").getById(req.params.sku).value();
  if (!p) return res.status(404).jsonp({ error: "product not found" });
  const total = (p.stockByStore || []).reduce((n, s) => n + s.qty, 0);
  res.jsonp({ sku: p.sku, name: p.name, totalStock: total, stockByStore: p.stockByStore });
});

// GET /orders/:id/eligibility  -> return eligibility record for the order
server.get("/orders/:id/eligibility", (req, res) => {
  const e = db.get("eligibility").getById(Number(req.params.id)).value();
  if (!e) return res.status(404).jsonp({ error: "eligibility not found" });
  res.jsonp(e);
});

// POST /orders/:id/cancel  -> flip status to cancelled if allowed
server.post("/orders/:id/cancel", (req, res) => {
  const id = Number(req.params.id);
  const order = db.get("orders").getById(id).value();
  if (!order) return res.status(404).jsonp({ error: "order not found" });
  if (["shipped", "delivered", "cancelled"].includes(order.status)) {
    return res
      .status(409)
      .jsonp({ error: `cannot cancel order in status '${order.status}'` });
  }
  db.get("orders").getById(id).assign({ status: "cancelled" }).write();
  res.jsonp({ orderId: order.id, status: "cancelled" });
});

// Rewrites for the remaining endpoints that map cleanly onto CRUD.
server.use(
  jsonServer.rewriter({
    "/customers/:id/orders": "/orders?customerId=:id",
  })
);

server.use(router);
server.listen(3000, () => console.log("Customer-agent API on http://localhost:3000"));
