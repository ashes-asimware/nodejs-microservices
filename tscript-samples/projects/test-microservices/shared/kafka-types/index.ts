export interface UserCreatedEvent {
  id: string;
  email: string;
  createdAt: string;
}

export const KAFKA_TOPICS = {
  USER_CREATED: "user.created"
};
