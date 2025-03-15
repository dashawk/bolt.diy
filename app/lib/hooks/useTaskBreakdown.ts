import { useState, useCallback } from 'react';
import { atom } from 'nanostores';
import { useStore } from '@nanostores/react';
import Cookies from 'js-cookie';
import { createScopedLogger } from '~/utils/logger';

// Store for task breakdown feature state
export const taskBreakdownEnabledStore = atom<boolean>(false);

// Initialize from cookie if available
if (typeof document !== 'undefined') {
  const savedPreference = Cookies.get('taskBreakdownEnabled');

  if (savedPreference !== undefined) {
    taskBreakdownEnabledStore.set(savedPreference === 'true');
  }
}

const logger = createScopedLogger('useTaskBreakdown');

export interface Task {
  id: string;
  content: string;
  completed: boolean;
}

export function useTaskBreakdown() {
  const taskBreakdownEnabled = useStore(taskBreakdownEnabledStore);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isBreakingDown, setIsBreakingDown] = useState(false);

  // Toggle task breakdown feature
  const toggleTaskBreakdown = useCallback(() => {
    const newValue = !taskBreakdownEnabled;
    taskBreakdownEnabledStore.set(newValue);
    Cookies.set('taskBreakdownEnabled', String(newValue));
    logger.debug(`Task breakdown ${newValue ? 'enabled' : 'disabled'}`);
  }, [taskBreakdownEnabled]);

  // Break down a prompt into multiple tasks
  const breakdownPrompt = useCallback(
    async (prompt: string, model: string, provider: string | { name: string }, apiKeys?: Record<string, string>) => {
      setIsBreakingDown(true);
      setTasks([]);

      try {
        const requestBody = {
          message: prompt,
          model,
          provider,
          apiKeys,
        };

        const response = await fetch('/api/task-breakdown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error(`Failed to break down task: ${response.statusText}`);
        }

        const result = await response.json();

        if (typeof result === 'object' && result !== null && 'tasks' in result && Array.isArray(result.tasks)) {
          const formattedTasks: Task[] = result.tasks.map((task: string, index: number) => ({
            id: `task-${index}`,
            content: task,
            completed: false,
          }));

          setTasks(formattedTasks);
          logger.debug(`Broke down prompt into ${formattedTasks.length} tasks`);

          return formattedTasks;
        }

        return [];
      } catch (error) {
        logger.error('Error breaking down task:', error);
        throw error;
      } finally {
        setIsBreakingDown(false);
      }
    },
    [],
  );

  // Start a specific task
  const startTask = useCallback(
    (taskId: string, setInput: (value: string) => void) => {
      const task = tasks.find((t) => t.id === taskId);

      if (task) {
        setInput(task.content);
        setTasks((prevTasks) => prevTasks.map((t) => (t.id === taskId ? { ...t, completed: true } : t)));
        logger.debug(`Started task: ${taskId}`);
      }
    },
    [tasks],
  );

  // Reset all tasks
  const resetTasks = useCallback(() => {
    setTasks([]);
    logger.debug('Reset all tasks');
  }, []);

  return {
    taskBreakdownEnabled,
    toggleTaskBreakdown,
    tasks,
    isBreakingDown,
    breakdownPrompt,
    startTask,
    resetTasks,
  };
}
