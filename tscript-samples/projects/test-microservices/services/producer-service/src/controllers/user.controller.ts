import { producer } from "../kafka/producer";
import { KAFKA_TOPICS, UserCreatedEvent } from "../../../../shared/kafka-types";

export async function createUser() {
  const event: UserCreatedEvent = {
    id: "123",
    email: "test@example.com",
    createdAt: new Date().toISOString()
  };

  await producer.send({
    topic: KAFKA_TOPICS.USER_CREATED,
    messages: [{ value: JSON.stringify(event) }]
  });

  return event;
}
