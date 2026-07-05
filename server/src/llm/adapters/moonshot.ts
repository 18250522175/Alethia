import { BaseOpenAICompatibleAdapter } from '../adapter';

export class MoonshotAdapter extends BaseOpenAICompatibleAdapter {
  constructor(apiKey: string, defaultModel: string = 'moonshot-v1-8k') {
    super('moonshot', '月之暗面（Kimi）', 'https://api.moonshot.cn/v1', apiKey, defaultModel);
  }
}
