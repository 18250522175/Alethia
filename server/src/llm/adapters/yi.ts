import { BaseOpenAICompatibleAdapter } from '../adapter';

export class YiAdapter extends BaseOpenAICompatibleAdapter {
  constructor(apiKey: string, defaultModel: string = 'yi-large') {
    super(
      'yi',
      '零一万物 Yi',
      'https://api.lingyiwanwu.com/v1',
      apiKey,
      defaultModel
    );
  }
}
