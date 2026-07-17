import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { test } from "node:test";

async function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
  });
}

async function startLocalServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: String(port), SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", SUPABASE_SECRET_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 5000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("AI backend running")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.once("exit", (code) => reject(new Error(`Server exited with ${code}: ${output}`)));
  });
  return { port, stop: () => child.kill() };
}

test("class-course API persists roster, saves one whole lesson, and deletes the class", async (t) => {
  const server = await startLocalServer();
  t.after(() => server.stop());
  const teacherName = `班课测试老师-${Date.now()}`;

  const createdResponse = await fetch(`http://127.0.0.1:${server.port}/api/group-classes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teacherName, classInfo: "2026暑期·初三数学", defaultTime: "13:10-15:10", students: ["初始学生"] }),
  });
  const created = await createdResponse.json();
  assert.equal(createdResponse.status, 200);
  assert.deepEqual(created.class.students, ["初始学生"]);

  const classId = created.class.id;
  const rosterResponse = await fetch(`http://127.0.0.1:${server.port}/api/group-classes/${classId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ classInfo: "2026暑期·初三数学", defaultTime: "13:10-15:10", students: ["陈同学", "郑同学"] }),
  });
  assert.equal(rosterResponse.status, 200);

  const listResponse = await fetch(`http://127.0.0.1:${server.port}/api/group-classes?teacherName=${encodeURIComponent(teacherName)}`);
  const list = await listResponse.json();
  assert.deepEqual(list.classes.find((item) => item.id === classId).students, ["陈同学", "郑同学"]);

  const lessonResponse = await fetch(`http://127.0.0.1:${server.port}/api/group-lessons`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ classId, teacherName, lessonNumber: 1, classDate: "2026-07-17", students: [{ name: "陈同学", attendance: "出席", homeworkStatus: "已完成" }, { name: "郑同学", attendance: "出席", homeworkStatus: "已完成" }] }),
  });
  const lesson = await lessonResponse.json();
  assert.equal(lessonResponse.status, 200);
  assert.equal(lesson.lesson.students.length, 2);

  const deleteResponse = await fetch(`http://127.0.0.1:${server.port}/api/group-classes/${classId}`, { method: "DELETE" });
  assert.equal(deleteResponse.status, 200);
  const afterDelete = await fetch(`http://127.0.0.1:${server.port}/api/group-classes?teacherName=${encodeURIComponent(teacherName)}`).then((response) => response.json());
  assert.equal(afterDelete.classes.some((item) => item.id === classId), false);
});

test("whole-class lesson requires a class and positive lesson number", async (t) => {
  const server = await startLocalServer();
  t.after(() => server.stop());
  const response = await fetch(`http://127.0.0.1:${server.port}/api/group-lessons`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lessonNumber: 0 }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /班级|课次/);
});
