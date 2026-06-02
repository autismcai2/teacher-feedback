import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { test } from "node:test";

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function startServer(extraEnv = {}) {
  const port = await getFreePort();
  const child = spawn(process.execPath, ["server.js"], {
    env: {
      ...process.env,
      ...extraEnv,
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Server did not start in time. Output:\n${output}`));
    }, 5000);

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("AI backend running")) {
        clearTimeout(timeout);
        resolve();
      }
    });

    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before start with code ${code}. Output:\n${output}`));
    });
  });

  return {
    port,
    async stop() {
      if (child.exitCode !== null) return;

      child.kill();

      await new Promise((resolve) => {
        child.once("exit", resolve);
        setTimeout(resolve, 1000);
      });
    },
  };
}

test("students endpoint reports an invalid Supabase URL before making a request", async (t) => {
  const server = await startServer({
    SUPABASE_URL: "not-a-url",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key",
  });

  t.after(() => server.stop());

  const response = await fetch(`http://127.0.0.1:${server.port}/api/students?teacherName=test`);
  const data = await response.json();

  assert.equal(response.status, 500);
  assert.match(data.error, /SUPABASE_URL 格式不正确/);
  assert.match(data.error, /https:\/\/xxxx\.supabase\.co/);
});

test("students endpoint reports a non-Supabase host as an invalid Supabase URL", async (t) => {
  const server = await startServer({
    SUPABASE_URL: "https://example.com",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key",
  });

  t.after(() => server.stop());

  const response = await fetch(`http://127.0.0.1:${server.port}/api/students?teacherName=test`);
  const data = await response.json();

  assert.equal(response.status, 500);
  assert.match(data.error, /SUPABASE_URL 格式不正确/);
});

test("health endpoint accepts a Supabase URL with a rest suffix after normalization", async (t) => {
  const server = await startServer({
    SUPABASE_URL: "https://demo.supabase.co/rest/v1",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key",
  });

  t.after(() => server.stop());

  const response = await fetch(`http://127.0.0.1:${server.port}/api/health`);
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.storage, "supabase");
});

test("keepalive endpoint reports local storage without exposing student data", async (t) => {
  const server = await startServer({
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    SUPABASE_SECRET_KEY: "",
  });

  t.after(() => server.stop());

  const response = await fetch(`http://127.0.0.1:${server.port}/api/keepalive`);
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.storage, "local");
  assert.equal(Object.hasOwn(data, "students"), false);
  assert.equal(Object.hasOwn(data, "studentLessons"), false);
  assert.equal(Object.hasOwn(data, "teacherName"), false);
});

test("keepalive endpoint validates Supabase configuration before reporting success", async (t) => {
  const server = await startServer({
    SUPABASE_URL: "not-a-url",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key",
  });

  t.after(() => server.stop());

  const response = await fetch(`http://127.0.0.1:${server.port}/api/keepalive`);
  const data = await response.json();

  assert.equal(response.status, 500);
  assert.match(data.error, /SUPABASE_URL/);
});
