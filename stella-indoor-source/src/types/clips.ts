export interface Clip {
  id: string;
  videoUrl: string;
  thumbnailUrl: string;
  title?: string;
  courtName?: string;
  cameraId?: string;
  likes: number;
  likedBy: string[];
  uploadedAt: number;
  uploadWeek: number; // ISO week number (1-52)
  uploadYear: number;
}

export interface ClipOfTheWeek {
  clipId: string;
  videoUrl: string;
  thumbnailUrl: string;
  likes: number;
}
