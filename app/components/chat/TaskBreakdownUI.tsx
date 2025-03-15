import React from 'react';
import type { Task } from '~/lib/hooks/useTaskBreakdown';
import { Button } from '~/components/ui/Button';
import { classNames } from '~/utils/classNames';
import WithTooltip from '~/components/ui/Tooltip';

interface TaskBreakdownUIProps {
  tasks: Task[];
  isBreakingDown: boolean;
  onStartTask: (taskId: string) => void;
  onReset: () => void;
}

const taskBreakdownUI: React.FC<TaskBreakdownUIProps> = ({ tasks, isBreakingDown, onStartTask, onReset }) => {
  if (isBreakingDown) {
    return (
      <div className="p-4 bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor mb-4">
        <div className="flex items-center justify-center gap-2 text-bolt-elements-textSecondary">
          <div className="i-svg-spinners:3-dots-fade text-2xl"></div>
          <span>Breaking down your task...</span>
        </div>
      </div>
    );
  }

  if (!tasks.length) {
    return null;
  }

  return (
    <div className="p-4 bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-bolt-elements-textPrimary font-medium">Task Breakdown</h3>
        <WithTooltip tooltip="Clear all tasks and start over" position="top">
          <Button variant="ghost" size="sm" onClick={onReset}>
            <span className="i-ph:x text-lg mr-1"></span>
            Clear
          </Button>
        </WithTooltip>
      </div>
      <WithTooltip
        tooltip="Task breakdown helps manage complex prompts by dividing them into smaller, focused tasks"
        position="top"
      >
        <p className="text-sm text-bolt-elements-textSecondary mb-4 cursor-help">
          Your prompt has been broken down into smaller tasks to optimize token usage and improve focus.
          <span className="block mt-1">Complete tasks sequentially for best results.</span>
        </p>
      </WithTooltip>
      <div className="space-y-3">
        {tasks.map((task) => (
          <div
            key={task.id}
            className={classNames(
              'p-3 rounded-md border flex items-start justify-between gap-2',
              task.completed
                ? 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 text-bolt-elements-textTertiary'
                : 'border-bolt-elements-borderColor-accent bg-bolt-elements-background-depth-0',
            )}
          >
            <div className="flex-1">
              <p className={classNames('text-sm', task.completed ? 'line-through' : '')}>{task.content}</p>
            </div>
            <WithTooltip
              tooltip={
                task.completed
                  ? 'This task has been completed'
                  : 'Load this task into the input field and mark it as completed'
              }
              position="left"
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => onStartTask(task.id)}
                disabled={task.completed}
                className={task.completed ? 'opacity-50 cursor-not-allowed' : ''}
              >
                {task.completed ? (
                  <>
                    <span className="i-ph:check text-lg mr-1"></span>
                    Completed
                  </>
                ) : (
                  <>Start Task</>
                )}
              </Button>
            </WithTooltip>
          </div>
        ))}
      </div>
    </div>
  );
};

export default taskBreakdownUI;
