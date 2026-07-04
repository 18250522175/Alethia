import { BaseOpenAICompatibleAdapter } from '../adapter';

export class HunyuanAdapter extends BaseOpenAICompatibleAdapter {
  constructor(apiKey: string, defaultModel: string = 'hunyuan-lite') {
    super(
      'hunyuan',
      '腾讯混元',
      'https://api.hunyuan.cloud.tencent.com/v1',
      apiKey,
      defaultModel
    );
  }
}
