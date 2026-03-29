export type Dimension = 'read' | 'memorize' | 'translate' | 'commentary';

export type JourneyStatus = 'active' | 'paused' | 'completed' | 'abandoned' | 'delayed';

/** Statuses that count toward the 5-journey active limit. */
export const ACTIVE_STATUSES: JourneyStatus[] = ['active', 'paused', 'delayed'];

export const MAX_ACTIVE_JOURNEYS = 5;

export interface Journey {
  id: string;
  userId: string;
  title: string;
  dimensions: Dimension[];
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
  startDate: FirebaseFirestore.Timestamp;
  endDate: FirebaseFirestore.Timestamp;
  status: JourneyStatus;
  totalAyahs: number;
  completedAyahs: Record<string, true>; // keys: "surah_ayah"
  completedCount: number;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export type CreateJourneyData = Omit<
  Journey,
  'id' | 'createdAt' | 'updatedAt' | 'completedAyahs' | 'completedCount' | 'status'
>;
