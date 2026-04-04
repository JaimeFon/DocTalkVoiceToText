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
    const url = req.url.split("?")[0];
    console.log(`[WS] Upgrade request: ${url}`);
    if (url === "/ws") {
      wss.handleUpgrade(req, socket, head, (clientWs) => {
        console.log("[WS] Client upgraded, connecting to backend...");
        const backend = new WebSocket(BACKEND_WS);
        let backendOpen = false;
        const buffered = [];

        backend.on("open", () => {
          console.log("[WS] Backend connected");
          backendOpen = true;
          // Enviar mensajes que llegaron antes de que el backend estuviera listo
          for (const msg of buffered) {
            backend.send(msg);
          }
          buffered.length = 0;
        });

        clientWs.on("message", (data) => {
          if (backendOpen && backend.readyState === WebSocket.OPEN) {
            backend.send(data);
          } else if (!backendOpen) {
            buffered.push(data);
          }
        });

        backend.on("message", (data) => {
          if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
        });

        clientWs.on("close", (code, reason) => {
          console.log(`[WS] Client closed: ${code} ${reason}`);
          if (backend.readyState === WebSocket.OPEN) backend.close();
          else if (backend.readyState === WebSocket.CONNECTING) backend.terminate();
        });

        backend.on("close", (code, reason) => {
          console.log(`[WS] Backend closed: ${code} ${reason}`);
          if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
        });

        backend.on("error", (err) => {
          console.error("[WS] Backend error:", err.message);
          if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
        });

        clientWs.on("error", (err) => {
          console.error("[WS] Client error:", err.message);
          if (backend.readyState === WebSocket.OPEN) backend.close();
          else if (backend.readyState === WebSocket.CONNECTING) backend.terminate();
        });
      });
    } else {
      // Next.js HMR u otros upgrades en dev
      if (dev) {
        // Dejar que Next.js maneje otros upgrades
        return;
      }
      socket.destroy();
    }
  });

  const port = process.env.PORT || 3005;
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
    console.log(`> WebSocket proxy /ws → ${BACKEND_WS}`);
  });
});
