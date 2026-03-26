import express from "express";
import { producer } from "./kafka/producer";
import { createUser } from "./controllers/user.controller";

const app = express();
app.use(express.json());

app.post("/users", async (req, res) => {
  const event = await createUser();
  res.json(event);
});

async function start() {
  await producer.connect();
  app.listen(3001, () => console.log("Producer service running on 3001"));
}

start();
