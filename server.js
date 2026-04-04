const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer, WebSocket } = require("ws");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const backendWsUrl = process.env.BACKEND_WS_URL || "ws://localhost:9000";

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url, true);
    if (pathname === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (clientWs) => {
    console.log("[ws] Cliente conectado, abriendo enlace al backend...");

    const backendWs = new WebSocket(backendWsUrl);

    backendWs.on("open", () => {
      console.log("[ws] Conectado al backend Whisper");

      clientWs.on("message", (data, isBinary) => {
        if (backendWs.readyState === WebSocket.OPEN) {
          backendWs.send(data, { binary: isBinary });
        }
      });
    });

    backendWs.on("message", (data, isBinary) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data, { binary: isBinary });
      }
    });

    backendWs.on("error", (err) => {
      console.error("[ws] Error backend:", err.message);
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    });

    backendWs.on("close", () => {
      console.log("[ws] Backend desconectado");
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    });

    clientWs.on("close", () => {
      console.log("[ws] Cliente desconectado");
      if (backendWs.readyState === WebSocket.OPEN) backendWs.close();
    });

    clientWs.on("error", (err) => {
      console.error("[ws] Error cliente:", err.message);
      if (backendWs.readyState === WebSocket.OPEN) backendWs.close();
    });
  });

  server.listen(port, () => {
    console.log(`> VoiceToText listo en http://localhost:${port}`);
    console.log(`> Backend Whisper: ${backendWsUrl}`);
    console.log(`> Entorno: ${dev ? "desarrollo" : "producción"}`);
  });
});
