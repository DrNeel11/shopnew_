import { useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useBoardStore } from '../store/boardStore';
import { useSocket } from '../hooks/useSocket';
import { Column as KanbanColumn } from './Column';
import { PresenceIndicator } from './PresenceIndicator';
import { ErrorBoundary } from './ErrorBoundary';
import { Column, Task, COLUMNS } from '../types';

interface ConflictToastProps {
  taskId: string;
  message: string;
  onDismiss: () => void;
}

function ConflictToast({ message, onDismiss }: ConflictToastProps) {
  return (
    <div
      style={{
        background: '#FFFBEB',
        border: '1px solid #FCD34D',
        borderRadius: '8px',
        padding: '10px 14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '10px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      }}
    >
      <span style={{ fontSize: '13px', color: '#92400E' }}>⚠️ {message}</span>
      <button
        onClick={onDismiss}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#92400E',
          fontSize: '16px',
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}

export function Board() {
  const {
    tasks,
    presenceUsers,
    isConnected,
    isOffline,
    offlineQueue,
    conflicts,
    dismissConflict,
    addTask,
    updateTask,
    removeTask,
  } = useBoardStore();

  const { emitOrQueue, emitPresenceEditing, clientId } = useSocket();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const getTasksForColumn = (column: Column) =>
    tasks.filter((t) => t.column === column);

  const handleCreateTask = useCallback(
    (column: Column, title: string, description: string) => {
      // Optimistic: add task immediately with temporary ID
      const tempTask: Task = {
        id: `temp-${Date.now()}`,
        title,
        description,
        column,
        position: String(Date.now()),
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      addTask(tempTask);

      emitOrQueue('create', { title, description, column });
    },
    [addTask, emitOrQueue]
  );

  const handleUpdateTask = useCallback(
    (id: string, changes: { title?: string; description?: string }) => {
      const task = tasks.find((t) => t.id === id);
      if (!task) return;

      // Optimistic update
      updateTask({ ...task, ...changes });

      emitOrQueue('update', { id, ...changes, version: task.version });
    },
    [tasks, updateTask, emitOrQueue]
  );

  const handleDeleteTask = useCallback(
    (id: string) => {
      // Optimistic remove
      removeTask(id);
      emitOrQueue('delete', { id });
    },
    [removeTask, emitOrQueue]
  );

  const handleEditingChange = useCallback(
    (taskId: string | null) => {
      emitPresenceEditing(taskId);
    },
    [emitPresenceEditing]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const taskId = active.id as string;
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      // Determine target column and position
      let targetColumn: Column = task.column;
      let overTaskId: string | null = null;

      // Check if dropped on a column droppable
      if (COLUMNS.includes(over.id as Column)) {
        targetColumn = over.id as Column;
      } else {
        // Dropped on a task
        overTaskId = over.id as string;
        const overTask = tasks.find((t) => t.id === overTaskId);
        if (overTask) {
          targetColumn = overTask.column;
        }
      }

      // Get sorted tasks in target column (excluding the moved task)
      const columnTasks = tasks
        .filter((t) => t.column === targetColumn && t.id !== taskId)
        .sort((a, b) => parseFloat(a.position) - parseFloat(b.position));

      let prevTaskId: string | null = null;
      let nextTaskId: string | null = null;

      if (overTaskId && overTaskId !== taskId) {
        const overIndex = columnTasks.findIndex((t) => t.id === overTaskId);
        if (overIndex >= 0) {
          prevTaskId = overIndex > 0 ? columnTasks[overIndex - 1].id : null;
          nextTaskId = columnTasks[overIndex].id;
        }
      }

      // Optimistic update
      const newTasks = tasks.map((t) => {
        if (t.id === taskId) {
          return { ...t, column: targetColumn };
        }
        return t;
      });
      useBoardStore.getState().setTasks(newTasks);

      emitOrQueue('move', {
        id: taskId,
        targetColumn,
        prevTaskId,
        nextTaskId,
        version: task.version,
      });
    },
    [tasks, emitOrQueue]
  );

  const handleDragOver = useCallback(
    (_event: DragOverEvent) => {
      // Visual feedback handled by dnd-kit
    },
    []
  );

  const handleDragStart = useCallback((_event: DragStartEvent) => {
    // Could add drag preview logic here
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5' }}>
      {/* Header */}
      <header
        style={{
          background: 'white',
          borderBottom: '1px solid #E5E7EB',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#111827' }}>
            📋 Kanban Board
          </h1>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '20px',
              background: isOffline ? '#FEF2F2' : isConnected ? '#F0FDF4' : '#FFF7ED',
              border: `1px solid ${isOffline ? '#FECACA' : isConnected ? '#BBF7D0' : '#FED7AA'}`,
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: isOffline ? '#EF4444' : isConnected ? '#22C55E' : '#F97316',
              }}
            />
            <span
              style={{
                fontSize: '12px',
                color: isOffline ? '#DC2626' : isConnected ? '#16A34A' : '#EA580C',
                fontWeight: 500,
              }}
            >
              {isOffline
                ? `Offline (${offlineQueue.length} queued)`
                : isConnected
                ? 'Live'
                : 'Connecting...'}
            </span>
          </div>
        </div>

        <PresenceIndicator users={presenceUsers} currentClientId={clientId ?? ''} />
      </header>

      {/* Conflict notifications */}
      {conflicts.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '16px',
            right: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            zIndex: 200,
            maxWidth: '400px',
          }}
        >
          {conflicts.map((conflict) => (
            <ConflictToast
              key={conflict.taskId}
              taskId={conflict.taskId}
              message={conflict.message}
              onDismiss={() => dismissConflict(conflict.taskId)}
            />
          ))}
        </div>
      )}

      {/* Columns */}
      <ErrorBoundary name="Board">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div
            style={{
              display: 'flex',
              gap: '16px',
              padding: '24px',
              overflowX: 'auto',
              alignItems: 'flex-start',
              minHeight: 'calc(100vh - 61px)',
            }}
          >
            {COLUMNS.map((column) => (
              <ErrorBoundary key={column} name={`${column} column`}>
                <KanbanColumn
                  column={column}
                  tasks={getTasksForColumn(column)}
                  presenceUsers={presenceUsers}
                  onCreateTask={handleCreateTask}
                  onUpdateTask={handleUpdateTask}
                  onDeleteTask={handleDeleteTask}
                  onEditingChange={handleEditingChange}
                />
              </ErrorBoundary>
            ))}
          </div>
        </DndContext>
      </ErrorBoundary>
    </div>
  );
}
