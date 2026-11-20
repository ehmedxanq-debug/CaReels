import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
  increment,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';

const deletedAccountUids = new Set<string>();
const inFlightPurgeUids = new Set<string>();
const verifiedExistingUids = new Set<string>();

export function isSystemOrProtectedUid(uid?: string | null): boolean {
  if (!uid) return true;
  const clean = uid.trim().toLowerCase();
  return (
    !clean ||
    clean === 'guest' ||
    clean === 'admin' ||
    clean === 'careels' ||
    clean.startsWith('name:')
  );
}

export function markUidVerifiedExists(uid: string): void {
  if (!uid) return;
  verifiedExistingUids.add(uid);
  deletedAccountUids.delete(uid);
}

export function isUidKnownDeleted(uid?: string | null): boolean {
  if (!uid) return false;
  return deletedAccountUids.has(uid);
}

/**
 * Deletes all posts and comments belonging to a deleted Firebase user account.
 */
export async function purgeAccountContentFromFirestore(
  deletedUid: string,
  knownPostIds: string[] = []
): Promise<void> {
  if (isSystemOrProtectedUid(deletedUid)) return;
  deletedAccountUids.add(deletedUid);
  verifiedExistingUids.delete(deletedUid);

  if (inFlightPurgeUids.has(deletedUid)) return;
  inFlightPurgeUids.add(deletedUid);

  try {
    // 1. Delete all posts authored by deletedUid
    try {
      const userPostsSnap = await getDocs(
        query(collection(db, 'posts'), where('uid', '==', deletedUid))
      );
      for (const postDoc of userPostsSnap.docs) {
        try {
          const postCommentsSnap = await getDocs(collection(db, 'posts', postDoc.id, 'comments'));
          await Promise.all(
            postCommentsSnap.docs.map((c) => deleteDoc(c.ref).catch(() => {}))
          );
        } catch {
          // Ignore subcollection permission issues
        }
        await deleteDoc(postDoc.ref).catch(() => {});
      }
    } catch {
      // Ignore if query fails
    }

    // 2. Delete all comments authored by deletedUid across all posts
    const deletedCountByPost = new Map<string, number>();
    let collectionGroupSucceeded = false;

    try {
      const cgSnap = await getDocs(
        query(collectionGroup(db, 'comments'), where('userId', '==', deletedUid))
      );
      collectionGroupSucceeded = true;
      for (const commentDoc of cgSnap.docs) {
        const parentPostId = commentDoc.ref.parent.parent?.id;
        await deleteDoc(commentDoc.ref)
          .then(() => {
            if (parentPostId) {
              deletedCountByPost.set(
                parentPostId,
                (deletedCountByPost.get(parentPostId) || 0) + 1
              );
            }
          })
          .catch(() => {});
      }
    } catch {
      collectionGroupSucceeded = false;
    }

    // Fallback if collectionGroup requires an index or is restricted: scan known post IDs
    if (!collectionGroupSucceeded) {
      let postIdsToScan = knownPostIds;
      if (postIdsToScan.length === 0) {
        try {
          const allPostsSnap = await getDocs(collection(db, 'posts'));
          postIdsToScan = allPostsSnap.docs.map((d) => d.id);
        } catch {
          postIdsToScan = [];
        }
      }

      for (const pid of postIdsToScan) {
        try {
          const cSnap = await getDocs(
            query(collection(db, 'posts', pid, 'comments'), where('userId', '==', deletedUid))
          );
          for (const commentDoc of cSnap.docs) {
            await deleteDoc(commentDoc.ref)
              .then(() => {
                deletedCountByPost.set(pid, (deletedCountByPost.get(pid) || 0) + 1);
              })
              .catch(() => {});
          }
        } catch {
          // Ignore post comment scan error
        }
      }
    }

    // Sync commentsCount on affected posts
    for (const [pid, count] of deletedCountByPost.entries()) {
      try {
        await updateDoc(doc(db, 'posts', pid), {
          commentsCount: increment(-count),
        });
      } catch {
        // Ignore if counter update is restricted
      }
    }
  } finally {
    inFlightPurgeUids.delete(deletedUid);
  }
}

/**
 * Verifies against Firestore server whether `people/{uid}` truly does not exist.
 * Only purges content when server explicitly confirms the document was deleted.
 */
export async function verifyAndPurgeIfAccountDeleted(
  uid: string,
  knownPostIds: string[] = []
): Promise<boolean> {
  if (isSystemOrProtectedUid(uid)) return false;
  if (deletedAccountUids.has(uid)) {
    void purgeAccountContentFromFirestore(uid, knownPostIds);
    return true;
  }
  if (verifiedExistingUids.has(uid) || inFlightPurgeUids.has(uid)) {
    return false;
  }

  try {
    const snap = await getDocFromServer(doc(db, 'people', uid));
    if (snap.exists()) {
      markUidVerifiedExists(uid);
      return false;
    }
    await purgeAccountContentFromFirestore(uid, knownPostIds);
    return true;
  } catch {
    // Do not purge on network/offline errors
    return false;
  }
}
