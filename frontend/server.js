const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer, WebSocket } = require("ws");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const BACKEND_WS = process.env.BACKEND_WS_URL || "ws://localhost:9000";

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  // Proxy WebSocket /ws → Python backend
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (req.url === "/ws") {
      wss.handleUpgrade(req, socket, head, (clientWs) => {
        const backend = new WebSocket(BACKEND_WS);

        backend.on("open", () => {
          clientWs.on("message", (data) => {
            if (backend.readyState === WebSocket.OPEN) backend.send(data);
          });
          backend.on("message", (data) => {
            if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
          });
        });

        clientWs.on("close", () => backend.close());
        backend.on("close", () => clientWs.close());

        backend.on("error", (err) => {
          console.error("Backend WS error:", err.message);
          clientWs.close();
        });
        clientWs.on("error", (err) => {
          console.error("Client WS error:", err.message);
          backend.close();
        });
      });
    } else {
      socket.destroy();
    }
  });

  const port = process.env.PORT || 3005;
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
    console.log(`> WebSocket proxy /ws → ${BACKEND_WS}`);
  });
});
