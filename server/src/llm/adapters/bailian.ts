import { BaseOpenAICompatibleAdapter } from '../adapter';

export class BailianAdapter extends BaseOpenAICompatibleAdapter {
  constructor(apiKey: string, defaultModel: string = 'qwen-turbo') {
    super(
      'bailian',
      '阿里云百炼（通义千问）',
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey,
      defaultModel
    );
  }
}
