import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  X,
  User,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { ReviewComment, Finding } from '../types/brandlens';

interface CommentsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  reviewTitle: string;
  activeFinding: Finding | null;
  comments: ReviewComment[];
  onAddComment: (body: string, linkedFindingId?: string) => Promise<void>;
  currentUserDisplayName: string;
}

export const CommentsDrawer: React.FC<CommentsDrawerProps> = ({
  isOpen,
  onClose,
  reviewTitle,
  activeFinding,
  comments,
  onAddComment,
  currentUserDisplayName,
}) => {
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const relevantComments = activeFinding
    ? comments.filter((c) => c.linkedFindingId === activeFinding.id)
    : comments;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmitting(true);
    try {
      await onAddComment(commentText.trim(), activeFinding?.id);
      setCommentText('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[#151F35] border-l border-[#283650] shadow-2xl flex flex-col justify-between animate-slide-in">
      {/* Header */}
      <div className="p-4 border-b border-[#283650] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#46E3C1]" />
          <div>
            <h3 className="text-xs font-bold text-[#EEF3FF]">
              {activeFinding ? 'Finding Discussion' : 'Review Discussion'}
            </h3>
            <p className="text-[10px] text-[#9AABC5] truncate max-w-[260px]">
              {activeFinding ? `Flag: "${activeFinding.excerpt}"` : reviewTitle}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-[#9AABC5] hover:text-[#EEF3FF] p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Linked Finding Context if applicable */}
      {activeFinding && (
        <div className="p-3 bg-[#10192C] border-b border-[#283650] text-xs space-y-1">
          <span className="text-[10px] font-mono text-[#75D9F5] uppercase">
            Annotated finding:
          </span>
          <p className="text-[#EEF3FF] font-semibold italic text-xs">
            “{activeFinding.excerpt}”
          </p>
          <p className="text-[11px] text-[#9AABC5]">
            {activeFinding.rationale}
          </p>
        </div>
      )}

      {/* Comments List */}
      <div className="flex-1 p-4 space-y-3 overflow-y-auto">
        {relevantComments.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#9AABC5]">
            No annotations or comments yet. Start a discussion below.
          </div>
        ) : (
          relevantComments.map((c) => (
            <div
              key={c.id}
              className="p-3 rounded-lg bg-[#10192C] border border-[#283650] space-y-1"
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-[#46E3C1]">
                  {c.authorName}
                </span>
                <span className="text-[10px] text-[#9AABC5] font-mono">
                  {new Date(c.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-xs text-[#EEF3FF] leading-relaxed">
                {c.body}
              </p>
            </div>
          ))
        )}
      </div>

      {/* New Comment Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-[#283650] bg-[#10192C]/80 space-y-2">
        <textarea
          rows={3}
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder={`Add annotation as ${currentUserDisplayName}...`}
          className="w-full bg-[#151F35] border border-[#283650] rounded-lg p-2.5 text-xs text-[#EEF3FF] focus:outline-none focus:border-[#46E3C1]"
        />
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-[#9AABC5] font-mono">
            Recorded in immutable audit trail
          </span>
          <button
            type="submit"
            disabled={submitting || !commentText.trim()}
            className="px-3.5 py-1.5 rounded-lg bg-[#46E3C1] text-[#0B1020] text-xs font-bold flex items-center gap-1.5 hover:bg-[#46E3C1]/90 disabled:opacity-40 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Post Annotation</span>
          </button>
        </div>
      </form>
    </div>
  );
};
