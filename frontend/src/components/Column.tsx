import React, { useState } from 'react';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { Task, type Column, PresenceUser, COLUMN_LABELS } from '../types';
import { TaskCard } from './TaskCard';
import { ErrorBoundary } from './ErrorBoundary';

const COLUMN_COLORS: Record<Column, string> = {
  todo: '#EFF6FF',
  inprogress: '#FFFBEB',
  done: '#F0FDF4',
};

const COLUMN_HEADER_COLORS: Record<Column, string> = {
  todo: '#1D4ED8',
  inprogress: '#D97706',
  done: '#16A34A',
};

interface Props {
  column: Column;
  tasks: Task[];
  presenceUsers: PresenceUser[];
  onCreateTask: (column: Column, title: string, description: string) => void;
  onUpdateTask: (id: string, changes: { title?: string; description?: string }) => void;
  onDeleteTask: (id: string) => void;
  onEditingChange: (taskId: string | null) => void;
}

export function Column({
  column,
  tasks,
  presenceUsers,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onEditingChange,
}: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const { setNodeRef, isOver } = useDroppable({ id: column });

  const sortedTasks = [...tasks].sort(
    (a, b) => parseFloat(a.position) - parseFloat(b.position)
  );

  const handleAdd = () => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    onCreateTask(column, trimmed, newDescription);
    setNewTitle('');
    setNewDescription('');
    setIsAdding(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
    if (e.key === 'Escape') {
      setNewTitle('');
      setNewDescription('');
      setIsAdding(false);
    }
  };

  const getUsersEditingTask = (taskId: string) =>
    presenceUsers.filter((u) => u.editingTaskId === taskId);

  return (
    <div
      style={{
        flex: 1,
        minWidth: '280px',
        maxWidth: '380px',
        background: COLUMN_COLORS[column],
        borderRadius: '12px',
        padding: '12px',
        border: isOver ? '2px dashed #3B82F6' : '2px solid transparent',
        transition: 'border-color 0.15s',
      }}
    >
      {/* Column Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: COLUMN_HEADER_COLORS[column],
            }}
          />
          <h3
            style={{
              fontSize: '15px',
              fontWeight: 700,
              color: '#111827',
            }}
          >
            {COLUMN_LABELS[column]}
          </h3>
          <span
            style={{
              background: '#E5E7EB',
              color: '#374151',
              borderRadius: '12px',
              padding: '1px 8px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          title={`Add task to ${COLUMN_LABELS[column]}`}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '20px',
            color: '#6B7280',
            lineHeight: 1,
            padding: '0 4px',
          }}
        >
          +
        </button>
      </div>

      {/* Task list */}
      <div ref={setNodeRef}>
        <SortableContext
          items={sortedTasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <ErrorBoundary name="Task list">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sortedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onUpdate={onUpdateTask}
                  onDelete={onDeleteTask}
                  onEditingChange={onEditingChange}
                  editingByUsers={getUsersEditingTask(task.id)}
                />
              ))}
            </div>
          </ErrorBoundary>
        </SortableContext>
      </div>

      {/* Add task form */}
      {isAdding && (
        <div
          style={{
            marginTop: '8px',
            background: 'white',
            borderRadius: '8px',
            padding: '10px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
          onKeyDown={handleKeyDown}
        >
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Task title..."
            style={{
              width: '100%',
              border: '1px solid #3B82F6',
              borderRadius: '4px',
              padding: '6px 8px',
              fontSize: '14px',
              outline: 'none',
              marginBottom: '6px',
            }}
          />
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Description (optional)..."
            style={{
              width: '100%',
              border: '1px solid #D1D5DB',
              borderRadius: '4px',
              padding: '6px 8px',
              fontSize: '13px',
              outline: 'none',
              resize: 'vertical',
              minHeight: '50px',
              fontFamily: 'inherit',
              marginBottom: '6px',
            }}
          />
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={handleAdd}
              disabled={!newTitle.trim()}
              style={{
                padding: '4px 14px',
                background: newTitle.trim() ? '#3B82F6' : '#93C5FD',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: newTitle.trim() ? 'pointer' : 'not-allowed',
                fontSize: '13px',
              }}
            >
              Add
            </button>
            <button
              onClick={() => {
                setNewTitle('');
                setNewDescription('');
                setIsAdding(false);
              }}
              style={{
                padding: '4px 14px',
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
      )}
    </div>
  );
}
