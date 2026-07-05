import { BaseOpenAICompatibleAdapter } from '../adapter';

export class ErnieAdapter extends BaseOpenAICompatibleAdapter {
  constructor(apiKey: string, defaultModel: string = 'ernie-speed-128k') {
    super('ernie', '百度文心一言', 'https://qianfan.baidubce.com/v2', apiKey, defaultModel);
  }
}
