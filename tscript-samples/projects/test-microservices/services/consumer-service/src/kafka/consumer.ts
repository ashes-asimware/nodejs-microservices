import { kafka } from "./kafka-client";
import { KAFKA_TOPICS, UserCreatedEvent } from "../../../../shared/kafka-types";
import { saveUser } from "../db/user.repository";

export const consumer = kafka.consumer({ groupId: "user-group" });

export async function startConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPICS.USER_CREATED });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      const event = JSON.parse(message.value.toString()) as UserCreatedEvent;
      await saveUser(event);
    }
  });
}
