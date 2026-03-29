import { startConsumer } from "./kafka/consumer";

async function start() {
  await startConsumer();
  console.log("Consumer service running");
}

start();
