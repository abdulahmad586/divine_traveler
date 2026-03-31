export type Dimension = 'read' | 'memorize' | 'translate' | 'commentary';
export type JourneyStatus = 'active' | 'paused' | 'completed' | 'abandoned' | 'delayed';

/** Statuses that count toward the 5-journey active limit. */
export const ACTIVE_STATUSES: JourneyStatus[] = ['active', 'paused', 'delayed'];
export const MAX_ACTIVE_JOURNEYS = 5;

/** Higher = more active. Aggregate journey status = highest priority among all members. */
export const STATUS_PRIORITY: Record<JourneyStatus, number> = {
  active: 5,
  delayed: 4,
  paused: 3,
  completed: 2,
  abandoned: 1,
};

export interface JourneyMember {
  userId: string;
  name?: string;
  username?: string;
  status: JourneyStatus;
  completedAyahs: Record<string, true>; // keys: "surah_ayah"
  completedCount: number;
  joinedAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface Journey {
  id: string;
  creatorId: string;
  title: string;
  dimensions: Dimension[];
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
  startDate: FirebaseFirestore.Timestamp;
  endDate: FirebaseFirestore.Timestamp;
  status: JourneyStatus; // aggregate of all member statuses
  totalAyahs: number;
  allowJoining: boolean;
  memberIds: string[];
  memberCount: number;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface JourneyDetail extends Journey {
  members: JourneyMember[];
}
