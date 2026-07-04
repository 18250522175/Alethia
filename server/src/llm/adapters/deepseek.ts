import { BaseOpenAICompatibleAdapter } from '../adapter';

export class DeepSeekAdapter extends BaseOpenAICompatibleAdapter {
  constructor(apiKey: string, defaultModel: string = 'deepseek-chat') {
    super(
      'deepseek',
      'DeepSeek',
      'https://api.deepseek.com/v1',
      apiKey,
      defaultModel
    );
  }
}
