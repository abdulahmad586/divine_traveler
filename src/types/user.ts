export interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  allowFriendRequests: boolean;
  fcmToken?: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface UserProfile {
  id: string;
  name: string;
  username: string;
  createdAt: FirebaseFirestore.Timestamp;
  stats: {
    totalCompanions: number;
    completedAyahs: number;
  };
  relationship?: {
    isCompanion: boolean;
    sentRequest: boolean;
    receivedRequest: boolean;
    isBlocked: boolean;
  };
  journeys?: unknown[]; // active journeys, only shown to companions
}
