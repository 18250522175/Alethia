import { BaseOpenAICompatibleAdapter } from '../adapter';

export class ZhipuAdapter extends BaseOpenAICompatibleAdapter {
  constructor(apiKey: string, defaultModel: string = 'glm-4-flash') {
    super(
      'zhipu',
      '智谱 AI（ChatGLM）',
      'https://open.bigmodel.cn/api/paas/v4',
      apiKey,
      defaultModel
    );
  }
}
