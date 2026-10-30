import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInAnonymously, User as FirebaseUser } from 'firebase/auth';
import {
  auth,
  signInWithGoogle,
  logOut,
  testConnection,
} from './services/firebase';
import {
  DEFAULT_WORKSPACE_ID,
  seedWorkspaceIfEmpty,
  getKnowledgeItems,
  createKnowledgeItem,
  updateKnowledgeItem,
  getReviews,
  getReview,
  createReview,
  getFindings,
  acceptFindingSuggestion,
  editFindingManually,
  dismissFindingWithReason,
  updateReviewStatus,
  getAuditEvents,
  getReviewComments,
  addReviewComment,
} from './services/repository';
import {
  KnowledgeItem,
  Review,
  Finding,
  AuditEvent,
  WorkspaceRole,
  ReviewComment,
} from './types/brandlens';
import { SAMPLE_KNOWLEDGE_ITEMS } from './data/sampleKnowledge';
import { Sidebar, ScreenId } from './components/Sidebar';
import { Header } from './components/Header';
import { OverviewView } from './components/OverviewView';
import { GovernanceLibraryView } from './components/GovernanceLibraryView';
import { ContentReviewView } from './components/ContentReviewView';
import { CampaignStudioView } from './components/CampaignStudioView';
import { ApprovalsView } from './components/ApprovalsView';
import { TrendsLearningView } from './components/TrendsLearningView';
import { AuditHistoryView } from './components/AuditHistoryView';
import { SettingsView } from './components/SettingsView';
import { AuthModal } from './components/AuthModal';
import { CommentsDrawer } from './components/CommentsDrawer';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('review');
  const [workspaceName] = useState('Phoenix Studio');
  const [workspaceId] = useState(DEFAULT_WORKSPACE_ID);
  const [isSampleData, setIsSampleData] = useState(false);
  const [userRole, setUserRole] = useState<WorkspaceRole>('brand_manager');
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [activeFindingForComments, setActiveFindingForComments] = useState<Finding | null>(null);
  const [comments, setComments] = useState<ReviewComment[]>([]);

  // Core Data Collections
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>(SAMPLE_KNOWLEDGE_ITEMS);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [currentReview, setCurrentReview] = useState<Review | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [engineMode, setEngineMode] = useState<'Rules-only mode' | 'Source-grounded AI + Rules enabled'>('Rules-only mode');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // 1. Initial Connection & Engine Status
  useEffect(() => {
    testConnection().then((connected) => {
      if (connected) {
        console.log('Connected to Cloud Firestore:', workspaceId);
      }
    });

    // Fetch engine mode from backend
    fetch('/api/engine-status')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.engineMode) {
          setEngineMode(data.engineMode);
        }
      })
      .catch((err) => {
        console.warn('Backend engine status check:', err);
      });
  }, [workspaceId]);

  // 2. Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          await seedWorkspaceIfEmpty(workspaceId, user.uid);
          await loadFirestoreData();
        } catch (err) {
          console.warn('Initial seed/load on login:', err);
        }
      } else {
        // Attempt immediate authenticated session for reviewer
        try {
          await signInAnonymously(auth);
        } catch (anonErr) {
          console.log('App ready in sample data mode, awaiting manual sign-in.');
        }
      }
    });
    return () => unsubscribe();
  }, [workspaceId]);

  // 3. Load Data from Firestore (Strictly when authenticated)
  const loadFirestoreData = async () => {
    if (!auth.currentUser) return;
    try {
      const items = await getKnowledgeItems(workspaceId);
      if (items && items.length > 0) {
        setKnowledgeItems(items);
      }

      const revList = await getReviews(workspaceId);
      if (revList && revList.length > 0) {
        setReviews(revList);
        if (!currentReview) {
          setCurrentReview(revList[0]);
          const f = await getFindings(workspaceId, revList[0].id);
          setFindings(f);
        }
      }

      const events = await getAuditEvents(workspaceId);
      if (events && events.length > 0) {
        setAuditEvents(events);
      }
    } catch (err) {
      console.warn('Could not load from Firestore, using in-memory state:', err);
    }
  };

  // Load comments when current review changes
  useEffect(() => {
    if (currentReview) {
      getReviewComments(workspaceId, currentReview.id)
        .then((c) => {
          if (c) setComments(c);
        })
        .catch(() => {});
    }
  }, [currentReview?.id, workspaceId]);

  const handleAddComment = async (body: string, linkedFindingId?: string) => {
    if (!currentReview) return;
    const actor = {
      uid: currentUser?.uid || 'user-reviewer-01',
      name: currentUser?.displayName || 'Active Reviewer',
    };
    try {
      const newComment = await addReviewComment(
        workspaceId,
        currentReview.id,
        body,
        actor,
        linkedFindingId
      );
      setComments((prev) => [...prev, newComment]);
      showToast('Annotation recorded in audit history.');
    } catch (err) {
      const mockComment: ReviewComment = {
        id: `comm-${Date.now()}`,
        reviewId: currentReview.id,
        authorUid: actor.uid,
        authorName: actor.name,
        body,
        linkedFindingId,
        createdAt: new Date().toISOString(),
      };
      setComments((prev) => [...prev, mockComment]);
      showToast('Annotation recorded.');
    }

    getAuditEvents(workspaceId).then((evts) => {
      if (evts) setAuditEvents(evts);
    }).catch(() => {});
  };

  // 4. Preflight execution
  const handleRunPreflight = async (
    text: string,
    channel: Review['channel'],
    title: string,
    fileMetadata?: Review['fileMetadata']
  ) => {
    const actorUid = currentUser?.uid || 'user-reviewer-01';
    const actorName = currentUser?.displayName || 'Active Reviewer';

    try {
      // Call backend preflight endpoint
      const response = await fetch('/api/check-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          channel,
          knowledgeItems,
          reviewId: `rev-${Date.now()}`,
          workspaceId,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Preflight API failed');
      }

      const incomingFindings: Finding[] = data.findings || [];
      if (data.engineMode) {
        setEngineMode(data.engineMode);
      }

      const riskLevel = incomingFindings.some((f) => f.severity === 'high')
        ? 'high'
        : incomingFindings.some((f) => f.severity === 'medium')
        ? 'medium'
        : 'low';

      // Persist to Firestore
      try {
        const { review: savedReview, findings: savedFindings } = await createReview(
          workspaceId,
          {
            workspaceId,
            title,
            channel,
            status: 'draft',
            createdBy: actorUid,
            originalText: text,
            currentText: text,
            riskLevel,
            fileMetadata,
          },
          incomingFindings,
          { uid: actorUid, name: actorName, role: userRole }
        );

        setCurrentReview(savedReview);
        setFindings(savedFindings);
        setReviews((prev) => [savedReview, ...prev.filter((r) => r.id !== savedReview.id)]);
      } catch (dbErr) {
        // Fallback in-memory
        const mockRev: Review = {
          id: `rev-${Date.now()}`,
          workspaceId,
          title,
          channel,
          status: 'draft',
          createdBy: actorUid,
          originalText: text,
          currentText: text,
          contentVersion: 1,
          riskLevel,
          fileMetadata,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setCurrentReview(mockRev);
        setFindings(incomingFindings);
        setReviews((prev) => [mockRev, ...prev]);
      }

      // Refresh audit events
      getAuditEvents(workspaceId).then((evts) => {
        if (evts) setAuditEvents(evts);
      }).catch(() => {});

      showToast(`Preflight complete: ${incomingFindings.length} findings detected.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`Preflight error: ${message}`);
    }
  };

  // 5. Finding Actions
  const handleAcceptFinding = async (finding: Finding) => {
    if (!currentReview) return;
    const actor = {
      uid: currentUser?.uid || 'user-reviewer-01',
      name: currentUser?.displayName || 'Active Reviewer',
      role: userRole,
    };

    try {
      const { updatedReview, updatedFinding } = await acceptFindingSuggestion(
        workspaceId,
        currentReview,
        finding,
        actor
      );

      setCurrentReview(updatedReview);
      setReviews((prev) => prev.map((r) => (r.id === updatedReview.id ? updatedReview : r)));
      setFindings((prev) => prev.map((f) => (f.id === updatedFinding.id ? updatedFinding : f)));
      showToast(`Accepted edit: Version v${updatedReview.contentVersion} created.`);
    } catch (err) {
      // In-memory fallback
      let newText = currentReview.currentText;
      if (newText.includes(finding.excerpt)) {
        newText = newText.replace(finding.excerpt, finding.suggestedRevision);
      }
      const updatedRev: Review = {
        ...currentReview,
        currentText: newText,
        contentVersion: currentReview.contentVersion + 1,
        updatedAt: new Date().toISOString(),
      };
      const updatedFnd: Finding = { ...finding, status: 'accepted' };
      setCurrentReview(updatedRev);
      setReviews((prev) => prev.map((r) => (r.id === updatedRev.id ? updatedRev : r)));
      setFindings((prev) => prev.map((f) => (f.id === updatedFnd.id ? updatedFnd : f)));
      showToast(`Accepted edit: Version v${updatedRev.contentVersion} created.`);
    }

    getAuditEvents(workspaceId).then((evts) => {
      if (evts) setAuditEvents(evts);
    }).catch(() => {});
  };

  const handleEditFindingManually = async (finding: Finding, customText: string) => {
    if (!currentReview) return;
    const actor = {
      uid: currentUser?.uid || 'user-reviewer-01',
      name: currentUser?.displayName || 'Active Reviewer',
      role: userRole,
    };

    try {
      const { updatedReview, updatedFinding } = await editFindingManually(
        workspaceId,
        currentReview,
        finding,
        customText,
        actor
      );

      setCurrentReview(updatedReview);
      setReviews((prev) => prev.map((r) => (r.id === updatedReview.id ? updatedReview : r)));
      setFindings((prev) => prev.map((f) => (f.id === updatedFinding.id ? updatedFinding : f)));
      showToast(`Applied manual edit: Version v${updatedReview.contentVersion} created.`);
    } catch (err) {
      let newText = currentReview.currentText;
      if (newText.includes(finding.excerpt)) {
        newText = newText.replace(finding.excerpt, customText);
      }
      const updatedRev: Review = {
        ...currentReview,
        currentText: newText,
        contentVersion: currentReview.contentVersion + 1,
        updatedAt: new Date().toISOString(),
      };
      const updatedFnd: Finding = { ...finding, status: 'edited', suggestedRevision: customText };
      setCurrentReview(updatedRev);
      setReviews((prev) => prev.map((r) => (r.id === updatedRev.id ? updatedRev : r)));
      setFindings((prev) => prev.map((f) => (f.id === updatedFnd.id ? updatedFnd : f)));
      showToast(`Applied manual edit: Version v${updatedRev.contentVersion} created.`);
    }

    getAuditEvents(workspaceId).then((evts) => {
      if (evts) setAuditEvents(evts);
    }).catch(() => {});
  };

  const handleDismissFinding = async (finding: Finding, reason: string) => {
    if (!currentReview) return;
    const actor = {
      uid: currentUser?.uid || 'user-reviewer-01',
      name: currentUser?.displayName || 'Active Reviewer',
      role: userRole,
    };

    try {
      const updated = await dismissFindingWithReason(
        workspaceId,
        currentReview.id,
        finding,
        reason,
        actor
      );
      setFindings((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      showToast('Finding dismissed with mandatory reason recorded.');
    } catch (err) {
      const updated: Finding = { ...finding, status: 'dismissed', dismissReason: reason };
      setFindings((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      showToast('Finding dismissed with mandatory reason recorded.');
    }

    getAuditEvents(workspaceId).then((evts) => {
      if (evts) setAuditEvents(evts);
    }).catch(() => {});
  };

  // 6. Workflow Status Transitions
  const handleUpdateReviewStatus = async (review: Review, newStatus: Review['status'], reason?: string) => {
    const actor = {
      uid: currentUser?.uid || 'user-reviewer-01',
      name: currentUser?.displayName || 'Active Reviewer',
      role: userRole,
    };

    try {
      const updated = await updateReviewStatus(workspaceId, review, newStatus, actor, reason);
      setCurrentReview(updated);
      setReviews((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      showToast(`Status updated: ${newStatus.toUpperCase()}`);
    } catch (err) {
      const updated: Review = { ...review, status: newStatus, updatedAt: new Date().toISOString() };
      setCurrentReview(updated);
      setReviews((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      showToast(`Status updated: ${newStatus.toUpperCase()}`);
    }

    getAuditEvents(workspaceId).then((evts) => {
      if (evts) setAuditEvents(evts);
    }).catch(() => {});
  };

  // 7. Knowledge Items creation
  const handleCreateKnowledgeItem = async (item: Omit<KnowledgeItem, 'id' | 'createdAt'>) => {
    try {
      const created = await createKnowledgeItem(workspaceId, item);
      setKnowledgeItems((prev) => [created, ...prev]);
      showToast(`Added knowledge record: "${created.title}"`);
    } catch (err) {
      const mock: KnowledgeItem = {
        ...item,
        id: `kb-${Date.now()}`,
        workspaceId,
        createdAt: new Date().toISOString(),
      };
      setKnowledgeItems((prev) => [mock, ...prev]);
      showToast(`Added knowledge record: "${mock.title}"`);
    }
  };

  const handleUpdateKnowledgeItem = async (id: string, updates: Partial<KnowledgeItem>) => {
    try {
      await updateKnowledgeItem(workspaceId, id, updates);
      setKnowledgeItems((prev) => prev.map((k) => (k.id === id ? { ...k, ...updates } : k)));
      showToast('Knowledge item updated.');
    } catch (err) {
      setKnowledgeItems((prev) => prev.map((k) => (k.id === id ? { ...k, ...updates } : k)));
      showToast('Knowledge item updated.');
    }
  };

  const handleSelectReviewFromQueue = async (reviewId?: string) => {
    if (reviewId) {
      const target = reviews.find((r) => r.id === reviewId);
      if (target) {
        setCurrentReview(target);
        try {
          const f = await getFindings(workspaceId, target.id);
          setFindings(f);
        } catch {
          // keep existing findings
        }
      }
    }
    setCurrentScreen('review');
  };

  const handleResetWorkspace = async () => {
    await seedWorkspaceIfEmpty(workspaceId, currentUser?.uid || 'admin-reset');
    await loadFirestoreData();
    showToast('Workspace refreshed and re-seeded with canonical brand knowledge.');
  };

  return (
    <div className="min-h-screen bg-[#0B1020] text-[#EEF3FF] flex font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-[#151F35] border border-[#46E3C1] text-xs font-semibold text-[#EEF3FF] shadow-2xl animate-fade-in flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#46E3C1]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Sidebar Navigation */}
      <Sidebar
        currentScreen={currentScreen}
        onNavigate={(screen) => setCurrentScreen(screen)}
        workspaceName={workspaceName}
        isSampleData={isSampleData}
        onToggleSampleData={() => {
          setIsSampleData(!isSampleData);
          showToast(
            !isSampleData
              ? 'Switched to Demo Sample workspace mode.'
              : 'Switched to Persistent Firestore live records mode.'
          );
        }}
        userRole={userRole}
        userEmail={currentUser?.email || undefined}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-72 flex flex-col min-w-0">
        <Header
          screenTitle={
            currentScreen === 'overview'
              ? 'Overview & Governance Health'
              : currentScreen === 'library'
              ? 'Governance Library'
              : currentScreen === 'review'
              ? 'Content Preflight & Review'
              : currentScreen === 'campaigns'
              ? 'Campaign Compliance Studio'
              : currentScreen === 'approvals'
              ? 'Approvals Lane'
              : currentScreen === 'trends'
              ? 'Trends & Learning'
              : currentScreen === 'audit'
              ? 'Audit History'
              : 'Workspace Settings'
          }
          screenKicker={
            currentScreen === 'overview'
              ? '01 / DASHBOARD'
              : currentScreen === 'library'
              ? '02 / SOURCE OF TRUTH'
              : currentScreen === 'review'
              ? '03 / PREFLIGHT ENGINE'
              : currentScreen === 'campaigns'
              ? '03b / MULTI-CHANNEL GOVERNANCE'
              : currentScreen === 'approvals'
              ? '04 / HUMAN RELEASE GATE'
              : currentScreen === 'trends'
              ? '05 / MEMORY LOOP'
              : currentScreen === 'audit'
              ? '06 / IMMUTABLE LEDGER'
              : '07 / CONFIGURATION'
          }
          engineMode={engineMode}
          userRole={userRole}
          onChangeRole={(newRole) => {
            setUserRole(newRole);
            showToast(`Active simulated role changed to: ${newRole.toUpperCase()}`);
          }}
          user={currentUser}
          onSignIn={() => setIsAuthModalOpen(true)}
          onSignOut={async () => {
            await logOut();
            showToast('Signed out of Firebase.');
          }}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
        />

        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          {currentScreen === 'overview' && (
            <OverviewView
              reviews={reviews}
              auditEvents={auditEvents}
              isSampleData={isSampleData}
              onNavigateToReview={handleSelectReviewFromQueue}
              onNavigateToScreen={(s) => setCurrentScreen(s)}
            />
          )}

          {currentScreen === 'library' && (
            <GovernanceLibraryView
              knowledgeItems={knowledgeItems}
              userRole={userRole}
              onCreateItem={handleCreateKnowledgeItem}
              onUpdateItem={handleUpdateKnowledgeItem}
              isSampleData={isSampleData}
            />
          )}

          {currentScreen === 'review' && (
            <ContentReviewView
              currentReview={currentReview}
              findings={findings}
              knowledgeItems={knowledgeItems}
              userRole={userRole}
              engineMode={engineMode}
              onRunPreflight={handleRunPreflight}
              onAcceptFinding={handleAcceptFinding}
              onEditFindingManually={handleEditFindingManually}
              onDismissFinding={handleDismissFinding}
              onSubmitForApproval={async (rev) => {
                await handleUpdateReviewStatus(rev, 'in_review', 'Submitted for human review gate.');
                setCurrentScreen('approvals');
              }}
              onOpenComments={(finding) => {
                setActiveFindingForComments(finding);
                setIsCommentsOpen(true);
              }}
            />
          )}

          {currentScreen === 'campaigns' && (
            <CampaignStudioView
              workspaceId={workspaceId}
              userRole={userRole}
              userEmail={currentUser?.email || undefined}
              onToast={showToast}
            />
          )}

          {currentScreen === 'approvals' && (
            <ApprovalsView
              reviews={reviews}
              userRole={userRole}
              onUpdateStatus={handleUpdateReviewStatus}
              onSelectReview={handleSelectReviewFromQueue}
            />
          )}

          {currentScreen === 'trends' && (
            <TrendsLearningView
              reviews={reviews}
              findings={findings}
              isSampleData={isSampleData}
            />
          )}

          {currentScreen === 'audit' && (
            <AuditHistoryView auditEvents={auditEvents} />
          )}

          {currentScreen === 'settings' && (
            <SettingsView
              workspaceName={workspaceName}
              userRole={userRole}
              onChangeRole={(r) => setUserRole(r)}
              engineMode={engineMode}
              isSampleData={isSampleData}
              onResetWorkspace={handleResetWorkspace}
            />
          )}
        </main>
      </div>

      {/* Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={(email) => {
          showToast(`Signed in to Firebase as ${email}`);
        }}
      />

      {/* Threaded Discussion & Annotation Drawer */}
      <CommentsDrawer
        isOpen={isCommentsOpen}
        onClose={() => {
          setIsCommentsOpen(false);
          setActiveFindingForComments(null);
        }}
        reviewTitle={currentReview?.title || 'Draft Review'}
        activeFinding={activeFindingForComments}
        comments={comments}
        onAddComment={handleAddComment}
        currentUserDisplayName={currentUser?.displayName || currentUser?.email || 'Active Reviewer'}
      />
    </div>
  );
}
