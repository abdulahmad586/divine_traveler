export interface CompanionRequest {
  id: string;
  fromUserId: string;
  fromUsername: string;
  toUserId: string;
  toUsername: string;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface Companionship {
  id: string;
  userIds: [string, string]; // always sorted: [smaller, larger] for dedup
  createdAt: FirebaseFirestore.Timestamp;
}

export interface Block {
  id: string;
  blockerUserId: string;
  blockedUserId: string;
  createdAt: FirebaseFirestore.Timestamp;
}
