import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, increment, arrayUnion, arrayRemove, query, orderBy, onSnapshot, Timestamp, deleteDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Clip, ClipOfTheWeek } from '@/types/clips';

const CLIPS_COLLECTION = 'clips';
const COTW_COLLECTION = 'clipOfTheWeek';
const COTW_DOC_ID = 'current';

/** Get ISO week number (1-53) */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function timestampToMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export interface ClipFilter {
  cameraId?: string;
  /** Inclusive start timestamp (ms) */
  startTime?: number;
  /** Inclusive end timestamp (ms) */
  endTime?: number;
}

export function useClips(filter?: ClipFilter) {
  const [rawClips, setRawClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [cotw, setCotw] = useState<ClipOfTheWeek | null>(null);

  // Subscribe to clips
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, CLIPS_COLLECTION), orderBy('uploadedAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => {
        const raw = d.data();
        return {
          id: d.id,
          ...raw,
          uploadedAt: timestampToMillis(raw.uploadedAt),
        } as Clip;
      });
      setRawClips(data);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const clips = useMemo(() => {
    if (!filter) return rawClips;
    const { cameraId, startTime, endTime } = filter;
    let data = rawClips;
    if (cameraId) {
      data = data.filter(c => c.cameraId === cameraId);
    }
    if (startTime != null) {
      data = data.filter(c => c.uploadedAt >= startTime);
    }
    if (endTime != null) {
      data = data.filter(c => c.uploadedAt <= endTime);
    }
    return data;
  }, [rawClips, filter]);

  // Subscribe to Clip of the Week
  useEffect(() => {
    const unsub = onSnapshot(doc(db, COTW_COLLECTION, COTW_DOC_ID), (snap) => {
      setCotw(snap.exists() ? snap.data() as ClipOfTheWeek : null);
    }, () => setCotw(null));
    return () => unsub();
  }, []);

  /**
   * Bi-weekly refresh:
   * - Week 1 clips refresh in Week 3
   * - Week 2 clips refresh in Week 4
   * - Clips stay for 2 full weeks before removal
   */
  const refreshOldClips = useCallback(async () => {
    const now = new Date();
    const currentWeek = getWeekNumber(now);
    const currentYear = now.getFullYear();

    const clipsSnap = await getDocs(collection(db, CLIPS_COLLECTION));
    const allClips: Clip[] = [];
    clipsSnap.forEach(d => {
      const raw = d.data();
      allClips.push({ id: d.id, ...raw, uploadedAt: timestampToMillis(raw.uploadedAt) } as Clip);
    });

    let removed = false;
    for (const clip of allClips) {
      // Remove clips from (current_week - 2) of the same year
      // Also handle year boundary: week 1 of new year removes week 51/52 of prev year
      const weeksDiff = (currentYear - clip.uploadYear) * 52 + (currentWeek - clip.uploadWeek);
      if (weeksDiff >= 2) {
        await deleteDoc(doc(db, CLIPS_COLLECTION, clip.id));
        removed = true;
      }
    }

    // Re-fetch remaining and crown new #1
    const remainingSnap = await getDocs(collection(db, CLIPS_COLLECTION));
    const remaining: Clip[] = [];
    remainingSnap.forEach(d => {
      const raw = d.data();
      remaining.push({ id: d.id, ...raw, uploadedAt: timestampToMillis(raw.uploadedAt) } as Clip);
    });

    if (remaining.length > 0) {
      const winner = remaining.sort((a, b) => b.likes - a.likes)[0];
      await setDoc(doc(db, COTW_COLLECTION, COTW_DOC_ID), {
        clipId: winner.id,
        videoUrl: winner.videoUrl,
        thumbnailUrl: winner.thumbnailUrl,
        likes: winner.likes,
      });
    } else {
      // No clips left — clear COTW
      await deleteDoc(doc(db, COTW_COLLECTION, COTW_DOC_ID));
    }

    return removed;
  }, []);

  const toggleLike = useCallback(async (clipId: string, userEmail: string) => {
    const clipRef = doc(db, CLIPS_COLLECTION, clipId);
    const clipSnap = await getDoc(clipRef);
    if (!clipSnap.exists()) return;

    const data = clipSnap.data() as Clip;
    const alreadyLiked = data.likedBy?.includes(userEmail);

    if (alreadyLiked) {
      await updateDoc(clipRef, { likes: increment(-1), likedBy: arrayRemove(userEmail) });
    } else {
      await updateDoc(clipRef, { likes: increment(1), likedBy: arrayUnion(userEmail) });
    }
  }, []);

  const isLikedByUser = useCallback((clip: Clip, userEmail: string): boolean => {
    return clip.likedBy?.includes(userEmail) ?? false;
  }, []);

  return { clips, loading, cotw, toggleLike, isLikedByUser, refreshOldClips };
}

/** Upload a clip — stores ISO week number for bi-weekly cycle */
export async function uploadClip(data: { videoUrl: string; thumbnailUrl: string }): Promise<void> {
  const now = new Date();
  const id = `clip-${Date.now()}`;
  await setDoc(doc(db, CLIPS_COLLECTION, id), {
    ...data,
    id,
    likes: 0,
    likedBy: [],
    uploadedAt: Timestamp.fromMillis(Date.now()),
    uploadWeek: getWeekNumber(now),
    uploadYear: now.getFullYear(),
  });
}

export async function deleteClip(clipId: string): Promise<void> {
  await deleteDoc(doc(db, CLIPS_COLLECTION, clipId));
}
