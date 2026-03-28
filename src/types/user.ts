export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: FirebaseFirestore.Timestamp;
}
