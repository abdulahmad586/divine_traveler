export type ContributionStatus = 'pending' | 'approved' | 'rejected' | 'broken';

export interface Contribution {
  id: string;
  reciterName: string;
  surah: number;
  audioFileId: string;
  timingFileId: string;
  audioHash: string;
  createdBy: string;
  createdByName: string;
  createdAt: FirebaseFirestore.Timestamp;
  status: ContributionStatus;
  downloads: number;
  likes: number;
}

export type CreateContributionData = Omit<Contribution, 'id' | 'createdAt' | 'downloads' | 'likes' | 'status'>;
