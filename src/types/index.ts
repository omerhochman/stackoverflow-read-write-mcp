export interface SearchByErrorInput {
  errorMessage: string;
  language?: string;
  technologies?: string[];
  minScore?: number;
  includeComments?: boolean;
  responseFormat?: "json" | "markdown";
  limit?: number;
}

export interface SearchByTagsInput {
  tags: string[];
  minScore?: number;
  includeComments?: boolean;
  responseFormat?: "json" | "markdown";
  limit?: number;
}

export interface StackTraceInput {
  stackTrace: string;
  language: string;
  includeComments?: boolean;
  responseFormat?: "json" | "markdown";
  limit?: number;
}

export interface AuthConfig {
  apiKey?: string;
  accessToken?: string;
}

export interface StackOverflowQuestion {
  question_id: number;
  title: string;
  body: string;
  score: number;
  answer_count: number;
  is_answered: boolean;
  accepted_answer_id?: number;
  creation_date: number;
  tags: string[];
  link: string;
}

export interface StackOverflowAnswer {
  answer_id: number;
  question_id: number;
  score: number;
  is_accepted: boolean;
  body: string;
  creation_date: number;
  link: string;
}

export interface StackOverflowComment {
  comment_id: number;
  post_id: number;
  score: number;
  body: string;
  creation_date: number;
}

export interface SearchResultComments {
  question: StackOverflowComment[];
  answers: { [answerId: number]: StackOverflowComment[] };
}

export interface SearchResult {
  question: StackOverflowQuestion;
  answers: StackOverflowAnswer[];
  comments?: SearchResultComments;
}

/**
 * Interface for Stack Exchange API error responses
 */
export interface ApiErrorResponse {
  error_id: number;
  error_name: string;
  error_message: string;
}
