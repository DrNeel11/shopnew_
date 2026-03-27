import React, { useState, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task, PresenceUser } from '../types';

interface Props {
  task: Task;
  onUpdate: (id: string, changes: { title?: string; description?: string }) => void;
  onDelete: (id: string) => void;
  onEditingChange: (taskId: string | null) => void;
  editingByUsers: PresenceUser[];
  isDragging?: boolean;
}

export function TaskCard({
  task,
  onUpdate,
  onDelete,
  onEditingChange,
  editingByUsers,
  isDragging,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [isDeleting, setIsDeleting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging || isDragging ? 0.4 : 1,
  };

  // Sync state when task is updated externally
  useEffect(() => {
    if (!isEditing) {
      setTitle(task.title);
      setDescription(task.description);
    }
  }, [task.title, task.description, isEditing]);

  const handleStartEdit = () => {
    setIsEditing(true);
    onEditingChange(task.id);
    setTimeout(() => titleRef.current?.focus(), 0);
  };

  const handleSave = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setTitle(task.title);
      setDescription(task.description);
      setIsEditing(false);
      onEditingChange(null);
      return;
    }
    if (trimmedTitle !== task.title || description !== task.description) {
      onUpdate(task.id, { title: trimmedTitle, description });
    }
    setIsEditing(false);
    onEditingChange(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setTitle(task.title);
      setDescription(task.description);
      setIsEditing(false);
      onEditingChange(null);
    }
    if (e.key === 'Enter' && !e.shiftKey && e.target === titleRef.current) {
      handleSave();
    }
  };

  const handleDelete = () => {
    setIsDeleting(true);
    onDelete(task.id);
  };

  const isBeingEditedByOther = editingByUsers.length > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-task-id={task.id}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '8px',
          padding: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          border: isBeingEditedByOther
            ? `2px solid ${editingByUsers[0]?.color || '#1D4ED8'}`
            : '2px solid transparent',
          opacity: isDeleting ? 0.5 : 1,
          transition: 'border-color 0.2s, opacity 0.2s',
          cursor: isEditing ? 'default' : 'grab',
        }}
      >
        {/* Drag handle + other user indicators */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <div
            {...attributes}
            {...listeners}
            style={{
              cursor: 'grab',
              color: '#9CA3AF',
              fontSize: '16px',
              lineHeight: 1,
              userSelect: 'none',
            }}
            aria-label="Drag to reorder"
          >
            ⠿
          </div>

          {isBeingEditedByOther && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              {editingByUsers.slice(0, 3).map((u) => (
                <div
                  key={u.clientId}
                  title={`${u.name} is editing`}
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: u.color,
                    fontSize: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                  }}
                >
                  {u.name.charAt(0)}
                </div>
              ))}
              <span style={{ fontSize: '11px', color: '#6B7280' }}>editing</span>
            </div>
          )}
        </div>

        {isEditing ? (
          <div onKeyDown={handleKeyDown}>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%',
                border: '1px solid #3B82F6',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '14px',
                fontWeight: 600,
                outline: 'none',
                marginBottom: '6px',
              }}
              placeholder="Task title"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: '100%',
                border: '1px solid #D1D5DB',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '13px',
                outline: 'none',
                resize: 'vertical',
                minHeight: '60px',
                fontFamily: 'inherit',
              }}
              placeholder="Description (optional)"
            />
            <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
              <button
                onClick={handleSave}
                style={{
                  padding: '4px 12px',
                  background: '#3B82F6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Save
              </button>
              <button
                onClick={() => {
                  setTitle(task.title);
                  setDescription(task.description);
                  setIsEditing(false);
                  onEditingChange(null);
                }}
                style={{
                  padding: '4px 12px',
                  background: '#F3F4F6',
                  color: '#374151',
                  border: '1px solid #D1D5DB',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h4
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#111827',
                marginBottom: description ? '4px' : 0,
                wordBreak: 'break-word',
              }}
            >
              {task.title}
            </h4>
            {task.description && (
              <p
                style={{
                  fontSize: '12px',
                  color: '#6B7280',
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {task.description}
              </p>
            )}
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              <button
                onClick={handleStartEdit}
                style={{
                  padding: '2px 8px',
                  background: 'transparent',
                  color: '#6B7280',
                  border: '1px solid #E5E7EB',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                style={{
                  padding: '2px 8px',
                  background: 'transparent',
                  color: '#EF4444',
                  border: '1px solid #FEE2E2',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
