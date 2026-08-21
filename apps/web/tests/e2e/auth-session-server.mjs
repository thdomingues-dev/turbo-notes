import { createServer } from "node:http";

const port = Number.parseInt(
  process.env.AUTH_SESSION_SERVER_PORT ?? "8100",
  10,
);

createServer((request, response) => {
  if (request.url !== "/api/v1/auth/session/") {
    response.writeHead(404).end();
    return;
  }

  const authenticated = request.headers.cookie?.includes("sessionid=") ?? false;
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(
    JSON.stringify({
      authenticated,
      user: authenticated
        ? { id: "user-1", email: "friend@example.com" }
        : null,
      csrf_token: "e2e-csrf",
    }),
  );
}).listen(port, "127.0.0.1");
