import type { RedditThread } from "@scholarsync/shared";
import fixture from "../../../packages/shared/fixtures/thread.json";

export interface RedditClient {
  getThread(threadId: string): Promise<RedditThread>;
}

export class MockRedditClient implements RedditClient {
  async getThread(threadId: string) {
    const thread = fixture as RedditThread;

    if (threadId !== thread.id) {
      throw new Error(`Unknown fixture thread: ${threadId}`);
    }

    return thread;
  }
}

export class OAuthRedditClient implements RedditClient {
  async getThread(_: string): Promise<RedditThread> {
    throw new Error("OAuthRedditClient is a placeholder until official Reddit OAuth access is configured.");
  }
}
