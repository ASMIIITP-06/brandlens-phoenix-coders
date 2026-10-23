import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import {
  KnowledgeItem,
  Review,
  Finding,
  ReviewVersion,
  ReviewComment,
  AuditEvent,
  WorkspaceMember,
  WorkspaceRole,
} from '../types/brandlens';
import { SAMPLE_KNOWLEDGE_ITEMS } from '../data/sampleKnowledge';

export const DEFAULT_WORKSPACE_ID = 'phoenix-studio-primary';

// Seed initial knowledge items into a workspace if it's currently empty
export async function seedWorkspaceIfEmpty(workspaceId: string, userUid: string): Promise<void> {
  const wsDocRef = doc(db, 'workspaces', workspaceId);
  const memberDocRef = doc(db, `workspaces/${workspaceId}/members`, userUid || 'system-init');
  const path = `workspaces/${workspaceId}/knowledgeItems`;

  try {
    // 1. Ensure workspace root doc exists
    await setDoc(
      wsDocRef,
      {
        name: 'Phoenix Studio',
        createdBy: userUid || 'system-init',
        createdAt: new Date().toISOString(),
        settings: { retentionDays: 90 },
      },
      { merge: true }
    );

    // 2. Ensure current user is in members collection
    if (userUid) {
      await setDoc(
        memberDocRef,
        {
          uid: userUid,
          role: 'brand_manager',
          displayName: 'Authorized Brand Reviewer',
          status: 'active',
          joinedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    // 3. Seed knowledge library if empty
    const snap = await getDocs(collection(db, path));
    if (snap.empty) {
      console.log('Seeding initial brand governance knowledge items for workspace:', workspaceId);
      for (const item of SAMPLE_KNOWLEDGE_ITEMS) {
        const itemRef = doc(db, path, item.id);
        await setDoc(itemRef, {
          ...item,
          workspaceId,
          ownerUid: userUid || 'phoenix-admin',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      // Also record initial audit event
      const auditPath = `workspaces/${workspaceId}/auditEvents`;
      await addDoc(collection(db, auditPath), {
        workspaceId,
        actorUid: userUid || 'system-init',
        actorName: 'System Provisioner',
        actorRole: 'admin',
        action: 'Workspace Initialized & Governance Knowledge Seeded',
        reason: 'Initial setup of BrandLens Source of Truth library in Cloud Firestore',
        createdAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// 1. Knowledge Items
export async function getKnowledgeItems(workspaceId: string): Promise<KnowledgeItem[]> {
  if (!auth.currentUser) {
    return SAMPLE_KNOWLEDGE_ITEMS;
  }
  const path = `workspaces/${workspaceId}/knowledgeItems`;
  try {
    const q = query(collection(db, path), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const items: KnowledgeItem[] = [];
    snap.forEach((docSnap) => {
      items.push({ id: docSnap.id, ...(docSnap.data() as Omit<KnowledgeItem, 'id'>) });
    });
    return items.length > 0 ? items : SAMPLE_KNOWLEDGE_ITEMS;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createKnowledgeItem(workspaceId: string, item: Omit<KnowledgeItem, 'id' | 'createdAt'>): Promise<KnowledgeItem> {
  const path = `workspaces/${workspaceId}/knowledgeItems`;
  try {
    const newItemId = `kb-${Date.now()}`;
    const fullItem: KnowledgeItem = {
      ...item,
      id: newItemId,
      workspaceId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, path, newItemId), fullItem);
    return fullItem;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateKnowledgeItem(workspaceId: string, itemId: string, updates: Partial<KnowledgeItem>): Promise<void> {
  const path = `workspaces/${workspaceId}/knowledgeItems/${itemId}`;
  try {
    await updateDoc(doc(db, `workspaces/${workspaceId}/knowledgeItems`, itemId), {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// 2. Reviews
export async function getReviews(workspaceId: string): Promise<Review[]> {
  if (!auth.currentUser) {
    return [];
  }
  const path = `workspaces/${workspaceId}/reviews`;
  try {
    const q = query(collection(db, path), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const reviews: Review[] = [];
    snap.forEach((docSnap) => {
      reviews.push({ id: docSnap.id, ...(docSnap.data() as Omit<Review, 'id'>) });
    });
    return reviews;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function getReview(workspaceId: string, reviewId: string): Promise<Review | null> {
  const path = `workspaces/${workspaceId}/reviews/${reviewId}`;
  try {
    const snap = await getDoc(doc(db, `workspaces/${workspaceId}/reviews`, reviewId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<Review, 'id'>) };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createReview(
  workspaceId: string,
  review: Omit<Review, 'id' | 'createdAt' | 'updatedAt' | 'contentVersion'>,
  initialFindings: Finding[],
  actor: { uid: string; name: string; role: string }
): Promise<{ review: Review; findings: Finding[] }> {
  const reviewId = `rev-${Date.now()}`;
  const path = `workspaces/${workspaceId}/reviews`;

  try {
    const newReview: Review = {
      ...review,
      id: reviewId,
      workspaceId,
      contentVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save review document
    await setDoc(doc(db, path, reviewId), newReview);

    // Save initial version snapshot (v1)
    const versionPath = `workspaces/${workspaceId}/reviews/${reviewId}/versions`;
    await setDoc(doc(db, versionPath, 'v1'), {
      reviewId,
      versionNumber: 1,
      text: review.originalText,
      changeSummary: 'Initial draft submitted for preflight quality check',
      createdBy: actor.uid,
      createdAt: new Date().toISOString(),
    });

    // Save findings
    const storedFindings: Finding[] = [];
    const findingsCol = collection(db, `workspaces/${workspaceId}/reviews/${reviewId}/findings`);
    for (const f of initialFindings) {
      const fId = f.id || `fnd-${Date.now()}-${storedFindings.length}`;
      const findingData: Finding = {
        ...f,
        id: fId,
        reviewId,
        workspaceId,
      };
      await setDoc(doc(findingsCol, fId), findingData);
      storedFindings.push(findingData);
    }

    // Save audit event
    await addAuditEvent(workspaceId, {
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'Draft Submitted & Preflight Completed',
      reviewId,
      versionId: 1,
      newStatus: review.status,
      reason: `Preflight completed with ${storedFindings.length} findings (${storedFindings.filter(f => f.severity === 'high').length} high risk).`,
      createdAt: new Date().toISOString(),
    });

    return { review: newReview, findings: storedFindings };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function getFindings(workspaceId: string, reviewId: string): Promise<Finding[]> {
  const path = `workspaces/${workspaceId}/reviews/${reviewId}/findings`;
  try {
    const snap = await getDocs(collection(db, path));
    const items: Finding[] = [];
    snap.forEach((docSnap) => {
      items.push({ id: docSnap.id, ...(docSnap.data() as Omit<Finding, 'id'>) });
    });
    return items;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// 3. Finding Resolution Actions (Accept, Edit, Dismiss)
export async function acceptFindingSuggestion(
  workspaceId: string,
  review: Review,
  finding: Finding,
  actor: { uid: string; name: string; role: string }
): Promise<{ updatedReview: Review; updatedFinding: Finding }> {
  const reviewPath = `workspaces/${workspaceId}/reviews/${review.id}`;
  const findingPath = `${reviewPath}/findings/${finding.id}`;

  try {
    // Replace excerpt in current text with suggestedRevision
    const newVersionNumber = review.contentVersion + 1;
    let newText = review.currentText;
    if (newText.includes(finding.excerpt)) {
      newText = newText.replace(finding.excerpt, finding.suggestedRevision);
    }

    const updatedReview: Review = {
      ...review,
      currentText: newText,
      contentVersion: newVersionNumber,
      updatedAt: new Date().toISOString(),
    };

    const updatedFinding: Finding = {
      ...finding,
      status: 'accepted',
      updatedBy: actor.uid,
      updatedAt: new Date().toISOString(),
    };

    // Update review
    await updateDoc(doc(db, reviewPath), {
      currentText: newText,
      contentVersion: newVersionNumber,
      updatedAt: new Date().toISOString(),
    });

    // Update finding
    await updateDoc(doc(db, findingPath), {
      status: 'accepted',
      updatedBy: actor.uid,
      updatedAt: new Date().toISOString(),
    });

    // Create new Version snapshot
    const versionPath = `${reviewPath}/versions/v${newVersionNumber}`;
    await setDoc(doc(db, versionPath), {
      reviewId: review.id,
      versionNumber: newVersionNumber,
      text: newText,
      changeSummary: `Accepted suggestion for "${finding.excerpt}": applied revision based on ${finding.evidenceSourceName || 'guidelines'}.`,
      createdBy: actor.uid,
      basedOnVersion: review.contentVersion,
      createdAt: new Date().toISOString(),
    });

    // Record audit event
    await addAuditEvent(workspaceId, {
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'Finding Suggestion Accepted',
      reviewId: review.id,
      versionId: newVersionNumber,
      reason: `Accepted edit: "${finding.excerpt}" -> "${finding.suggestedRevision}"`,
      createdAt: new Date().toISOString(),
    });

    return { updatedReview, updatedFinding };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, findingPath);
  }
}

export async function editFindingManually(
  workspaceId: string,
  review: Review,
  finding: Finding,
  customRevision: string,
  actor: { uid: string; name: string; role: string }
): Promise<{ updatedReview: Review; updatedFinding: Finding }> {
  const reviewPath = `workspaces/${workspaceId}/reviews/${review.id}`;
  const findingPath = `${reviewPath}/findings/${finding.id}`;

  try {
    const newVersionNumber = review.contentVersion + 1;
    let newText = review.currentText;
    if (newText.includes(finding.excerpt)) {
      newText = newText.replace(finding.excerpt, customRevision);
    }

    const updatedReview: Review = {
      ...review,
      currentText: newText,
      contentVersion: newVersionNumber,
      updatedAt: new Date().toISOString(),
    };

    const updatedFinding: Finding = {
      ...finding,
      status: 'edited',
      suggestedRevision: customRevision,
      updatedBy: actor.uid,
      updatedAt: new Date().toISOString(),
    };

    await updateDoc(doc(db, reviewPath), {
      currentText: newText,
      contentVersion: newVersionNumber,
      updatedAt: new Date().toISOString(),
    });

    await updateDoc(doc(db, findingPath), {
      status: 'edited',
      suggestedRevision: customRevision,
      updatedBy: actor.uid,
      updatedAt: new Date().toISOString(),
    });

    // Version record
    await setDoc(doc(db, `${reviewPath}/versions/v${newVersionNumber}`), {
      reviewId: review.id,
      versionNumber: newVersionNumber,
      text: newText,
      changeSummary: `Manual edit applied for "${finding.excerpt}"`,
      createdBy: actor.uid,
      basedOnVersion: review.contentVersion,
      createdAt: new Date().toISOString(),
    });

    // Audit log
    await addAuditEvent(workspaceId, {
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'Finding Manually Edited',
      reviewId: review.id,
      versionId: newVersionNumber,
      reason: `Custom revision applied: "${customRevision}"`,
      createdAt: new Date().toISOString(),
    });

    return { updatedReview, updatedFinding };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, findingPath);
  }
}

export async function dismissFindingWithReason(
  workspaceId: string,
  reviewId: string,
  finding: Finding,
  reason: string,
  actor: { uid: string; name: string; role: string }
): Promise<Finding> {
  if (!reason || reason.trim().length === 0) {
    throw new Error('A mandatory reason is required to dismiss a brand governance finding.');
  }

  const findingPath = `workspaces/${workspaceId}/reviews/${reviewId}/findings/${finding.id}`;
  try {
    const updatedFinding: Finding = {
      ...finding,
      status: 'dismissed',
      dismissReason: reason.trim(),
      updatedBy: actor.uid,
      updatedAt: new Date().toISOString(),
    };

    await updateDoc(doc(db, findingPath), {
      status: 'dismissed',
      dismissReason: reason.trim(),
      updatedBy: actor.uid,
      updatedAt: new Date().toISOString(),
    });

    await addAuditEvent(workspaceId, {
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'Finding Dismissed by Human Reviewer',
      reviewId,
      reason: `Dismissed flag on "${finding.excerpt}". Justification: ${reason.trim()}`,
      createdAt: new Date().toISOString(),
    });

    return updatedFinding;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, findingPath);
  }
}

// 4. Workflow State Transitions (In Review, Changes Requested, Approved, Published)
export async function updateReviewStatus(
  workspaceId: string,
  review: Review,
  newStatus: Review['status'],
  actor: { uid: string; name: string; role: string },
  reason?: string
): Promise<Review> {
  const reviewPath = `workspaces/${workspaceId}/reviews/${review.id}`;
  try {
    const updated: Review = {
      ...review,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };

    await updateDoc(doc(db, reviewPath), {
      status: newStatus,
      updatedAt: new Date().toISOString(),
    });

    await addAuditEvent(workspaceId, {
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      action: `Review Status Changed: ${review.status.toUpperCase()} -> ${newStatus.toUpperCase()}`,
      reviewId: review.id,
      versionId: review.contentVersion,
      oldStatus: review.status,
      newStatus,
      reason: reason || `Status updated to ${newStatus} by ${actor.name} (${actor.role})`,
      createdAt: new Date().toISOString(),
    });

    return updated;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, reviewPath);
  }
}

// 5. Versions & Comments
export async function getReviewVersions(workspaceId: string, reviewId: string): Promise<ReviewVersion[]> {
  const path = `workspaces/${workspaceId}/reviews/${reviewId}/versions`;
  try {
    const snap = await getDocs(collection(db, path));
    const versions: ReviewVersion[] = [];
    snap.forEach((docSnap) => {
      versions.push({ id: docSnap.id, ...(docSnap.data() as Omit<ReviewVersion, 'id'>) });
    });
    return versions.sort((a, b) => b.versionNumber - a.versionNumber);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function getReviewComments(workspaceId: string, reviewId: string): Promise<ReviewComment[]> {
  const path = `workspaces/${workspaceId}/reviews/${reviewId}/comments`;
  try {
    const snap = await getDocs(collection(db, path));
    const comments: ReviewComment[] = [];
    snap.forEach((docSnap) => {
      comments.push({ id: docSnap.id, ...(docSnap.data() as Omit<ReviewComment, 'id'>) });
    });
    return comments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function addReviewComment(
  workspaceId: string,
  reviewId: string,
  body: string,
  actor: { uid: string; name: string },
  linkedFindingId?: string
): Promise<ReviewComment> {
  const path = `workspaces/${workspaceId}/reviews/${reviewId}/comments`;
  try {
    const newComment: Omit<ReviewComment, 'id'> = {
      reviewId,
      authorUid: actor.uid,
      authorName: actor.name,
      body: body.trim(),
      linkedFindingId,
      createdAt: new Date().toISOString(),
    };
    const ref = await addDoc(collection(db, path), newComment);

    await addAuditEvent(workspaceId, {
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: 'collaborator',
      action: 'Comment Added to Review',
      reviewId,
      reason: `Comment: "${body.slice(0, 80)}${body.length > 80 ? '...' : ''}"`,
      createdAt: new Date().toISOString(),
    });

    return { id: ref.id, ...newComment };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// 6. Audit Trail (Strictly Append-Only)
export async function getAuditEvents(workspaceId: string, reviewId?: string): Promise<AuditEvent[]> {
  if (!auth.currentUser) {
    return [];
  }
  const path = `workspaces/${workspaceId}/auditEvents`;
  try {
    let q = query(collection(db, path), orderBy('createdAt', 'desc'));
    if (reviewId) {
      q = query(collection(db, path), where('reviewId', '==', reviewId), orderBy('createdAt', 'desc'));
    }
    const snap = await getDocs(q);
    const events: AuditEvent[] = [];
    snap.forEach((docSnap) => {
      events.push({ id: docSnap.id, ...(docSnap.data() as Omit<AuditEvent, 'id'>) });
    });
    return events;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function addAuditEvent(workspaceId: string, event: Omit<AuditEvent, 'id' | 'workspaceId'>): Promise<void> {
  const path = `workspaces/${workspaceId}/auditEvents`;
  try {
    await addDoc(collection(db, path), {
      ...event,
      workspaceId,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}
