import { prisma } from "./prisma-client";
import { UserCreatedEvent } from "../../../../shared/kafka-types";

export async function saveUser(event: UserCreatedEvent) {
  return prisma.user.create({
    data: {
      id: event.id,
      email: event.email,
      createdAt: new Date(event.createdAt)
    }
  });
}
