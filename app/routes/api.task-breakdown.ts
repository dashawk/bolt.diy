import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.task-breakdown');

export async function action({ request }: ActionFunctionArgs) {
  try {
    const data = (await request.json()) as {
      message: string;
      model: string;
      provider: string | { name: string };
      apiKeys?: Record<string, string>;
    };
    const { message, model, provider, apiKeys } = data;

    // Extract provider name if it's an object
    const providerName = typeof provider === 'string' ? provider : provider.name;

    logger.debug(`Breaking down task with model: ${model}, provider: ${providerName}`);

    /*
     * In a real implementation, this would call the LLM to break down the task
     * For now, we'll implement a simple version that breaks down the task based on common patterns
     */

    const tasks = await breakdownPrompt(message, model, providerName, apiKeys);

    return new Response(JSON.stringify({ tasks }), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    logger.error('Error in task breakdown:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  }
}

async function breakdownPrompt(
  prompt: string,
  model: string,
  provider: string,
  apiKeys?: Record<string, string>,
  providerSettings?: Record<string, any>,
  serverEnv?: Record<string, string>,
): Promise<{ task: string; subtasks?: string[] }[]> {
  // Try to use LLM to break down the task
  try {
    const { generateText } = await import('ai');
    const { PROVIDER_LIST } = await import('~/utils/constants');
    const { LLMManager: LLM_MANAGER } = await import('~/lib/modules/llm/manager');
    const { MAX_TOKENS } = await import('~/lib/.server/llm/constants');

    // Get provider info
    const providerInfo = PROVIDER_LIST.find((p) => p.name === provider);

    if (!providerInfo) {
      logger.warn(`Provider ${provider} not found, falling back to rule-based breakdown`);
      return fallbackBreakdown(prompt);
    }

    // Get model details
    const llmManager = LLM_MANAGER.getInstance(serverEnv || import.meta.env);
    const models = await llmManager.updateModelList({ apiKeys, providerSettings, serverEnv });
    const modelDetails = models.find((m) => m.name === model);

    if (!modelDetails) {
      logger.warn(`Model ${model} not found, falling back to rule-based breakdown`);
      return fallbackBreakdown(prompt);
    }

    const dynamicMaxTokens = modelDetails.maxTokenAllowed || MAX_TOKENS;

    // System prompt for task breakdown
    const system = `You are a helpful assistant that breaks down tasks into smaller, manageable subtasks. 
    Given a task description, analyze it and break it down into 2-5 clear, actionable subtasks. 
    Return ONLY a JSON array where each item has a 'task' property containing the subtask description. 
    Example: [{"task": "First subtask"}, {"task": "Second subtask"}]`;

    logger.info(`Breaking down task with Provider: ${provider}, Model: ${model}`);

    // Call the LLM
    const result = await generateText({
      system,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: providerInfo.getModelInstance({
        model: modelDetails.name,
        serverEnv: serverEnv || (import.meta.env as any),
        apiKeys,
        providerSettings,
      }),
      maxTokens: dynamicMaxTokens,
      toolChoice: 'none',
    });

    logger.info('Task breakdown generated');

    // Parse the response
    try {
      // Try to extract JSON from the response if it's not already JSON
      const jsonMatch = String(result).match(/\[\s*\{.*\}\s*\]/s);
      const jsonStr = jsonMatch ? jsonMatch[0] : result;
      const tasks = JSON.parse(String(jsonStr));

      if (Array.isArray(tasks) && tasks.length > 0 && tasks.every((item) => item && typeof item.task === 'string')) {
        return tasks;
      }

      logger.warn('Invalid task format returned from LLM, falling back to rule-based breakdown');

      return fallbackBreakdown(prompt);
    } catch (parseError) {
      logger.warn('Failed to parse LLM response, falling back to rule-based breakdown:', parseError);
      return fallbackBreakdown(prompt);
    }
  } catch (error) {
    logger.error('Error using LLM for task breakdown:', error);
    return fallbackBreakdown(prompt);
  }
}

// Fallback method for breaking down tasks when LLM fails
function fallbackBreakdown(prompt: string): Promise<{ task: string; subtasks?: string[] }[]> {
  /*
   * This is a rule-based implementation for breaking down tasks
   * Used as fallback when LLM integration fails
   */

  // First, try to identify if the prompt contains explicit task markers

  /*
   * Check for common task list formats
   * Split the prompt into lines for processing
   */
  const lines = prompt.split(/\n+/).filter((line) => line.trim().length > 0);
  const tasksFromLines = lines.map((line) => ({ task: line.trim() }));

  if (tasksFromLines.length >= 2) {
    return Promise.resolve(tasksFromLines);
  }

  // Enhanced bullet point detection with more symbols and better formatting
  const bulletPointRegex = /\n\s*[-*•+~]\s*(.+)/g;
  const bulletPoints: string[] = [];
  let bulletMatch;

  while ((bulletMatch = bulletPointRegex.exec(prompt)) !== null) {
    if (bulletMatch[1] && bulletMatch[1].trim().length > 0) {
      bulletPoints.push(bulletMatch[1].trim());
    }
  }

  // Enhanced numbered list detection with various formats (1., 1), Step 1:, etc.)
  const numberedRegex = /\n\s*(?:\d+[.)]|Step \d+:?)\s*(.+)/gi;
  const numberedPoints: string[] = [];
  let numberedMatch;

  while ((numberedMatch = numberedRegex.exec(prompt)) !== null) {
    if (numberedMatch[1] && numberedMatch[1].trim().length > 0) {
      numberedPoints.push(numberedMatch[1].trim());
    }
  }

  // If we have bullet points or numbered lists with meaningful items, use those
  if (bulletPoints.length >= 2) {
    return Promise.resolve(bulletPoints.filter((point) => point.length > 5).map((task) => ({ task })));
  }

  if (numberedPoints.length >= 2) {
    return Promise.resolve(numberedPoints.filter((point) => point.length > 5).map((task) => ({ task })));
  }

  // Otherwise, try to break it down by sentences that might indicate separate tasks
  const taskSeparators = [
    /(?:\.|\n)\s*(?:First|1st)[,:]?\s+/i,
    /(?:\.|\n)\s*(?:Second|2nd)[,:]?\s+/i,
    /(?:\.|\n)\s*(?:Third|3rd)[,:]?\s+/i,
    /(?:\.|\n)\s*(?:Fourth|4th)[,:]?\s+/i,
    /(?:\.|\n)\s*(?:Fifth|5th)[,:]?\s+/i,
    /(?:\.|\n)\s*(?:Sixth|6th)[,:]?\s+/i,
    /(?:\.|\n)\s*(?:Seventh|7th)[,:]?\s+/i,
    /(?:\.|\n)\s*(?:Eighth|8th)[,:]?\s+/i,
    /(?:\.|\n)\s*(?:Ninth|9th)[,:]?\s+/i,
    /(?:\.|\n)\s*(?:Tenth|10th)[,:]?\s+/i,
    /(?:\.|\n)\s*(?:Next)[,:]?\s+/i,
    /(?:\.|\n)\s*(?:Then)[,:]?\s+/i,
    /(?:\.|\n)\s*(?:Finally)[,:]?\s+/i,
    /(?:\.|\n)\s*(?:Additionally)[,:]?\s+/i,
    /(?:\.|\n)\s*(?:Moreover)[,:]?\s+/i,
    /(?:\.|\n)\s*(?:Furthermore)[,:]?\s+/i,
    /(?:\.|\n)\s*(?:Also)[,:]?\s+/i,
  ];

  let tasks: string[] = [];
  let remainingPrompt = prompt;

  // Try to extract tasks based on common patterns
  for (const separator of taskSeparators) {
    const match = remainingPrompt.match(separator);

    if (match && match.index !== undefined) {
      const beforeTask = remainingPrompt.substring(0, match.index + 1).trim();

      if (beforeTask && !tasks.includes(beforeTask) && beforeTask.length > 10) {
        tasks.push(beforeTask);
      }

      remainingPrompt = remainingPrompt.substring(match.index + match[0].length);
    }
  }

  // Look for task-like phrases with keywords like "task", "step", "part"
  const taskPhraseRegex =
    /(?:\.|\n)\s*(?:(?:(?:The|A|This|Your)\s+)?(?:task|step|part|phase|stage)\s+(?:is|will be)\s+to\s+|(?:You\s+(?:need|should|must|have to)\s+))/gi;
  let taskPhraseMatch;
  const taskPhrasePrompt = prompt;

  while ((taskPhraseMatch = taskPhraseRegex.exec(taskPhrasePrompt)) !== null) {
    if (taskPhraseMatch.index !== undefined) {
      // Extract from the match to the next period or end of string
      const endIndex = taskPhrasePrompt.indexOf('.', taskPhraseMatch.index + taskPhraseMatch[0].length);
      const taskPhrase = taskPhrasePrompt
        .substring(taskPhraseMatch.index + taskPhraseMatch[0].length, endIndex > -1 ? endIndex + 1 : undefined)
        .trim();

      if (taskPhrase && taskPhrase.length > 10 && !tasks.includes(taskPhrase)) {
        tasks.push(taskPhrase);
      }
    }
  }

  // Add the remaining text as the last task
  if (remainingPrompt.trim() && remainingPrompt.length > 10) {
    tasks.push(remainingPrompt.trim());
  }

  // If we couldn't break it down well, fall back to splitting by sentences
  if (tasks.length <= 1) {
    tasks = prompt
      .split(/(?<=\.)\s+/)
      .filter((sentence) => sentence.trim().length > 15)
      .map((sentence) => sentence.trim());
  }

  // If we still have too few tasks, try to create at least 2-3 tasks
  if (tasks.length <= 1) {
    const words = prompt.split(/\s+/);
    const chunkSize = Math.max(5, Math.floor(words.length / 3));

    tasks = [];

    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize).join(' ');

      if (chunk.trim().length > 0) {
        tasks.push(chunk);
      }
    }
  }

  // Ensure we have reasonable task descriptions
  tasks = tasks
    .map((task) => task.trim())
    .filter((task) => task.length > 0)
    .map((task) => task.charAt(0).toUpperCase() + task.slice(1));

  // Limit to a reasonable number of tasks
  const maxTasks = 5;

  if (tasks.length > maxTasks) {
    tasks = tasks.slice(0, maxTasks);
  }

  // If we have no tasks, return the original prompt as a single task
  if (tasks.length === 0) {
    return Promise.resolve([{ task: prompt }]);
  }

  return Promise.resolve(tasks.map((task) => ({ task })));
}
