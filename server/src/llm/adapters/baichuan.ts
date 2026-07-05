import { BaseOpenAICompatibleAdapter } from '../adapter';

export class BaichuanAdapter extends BaseOpenAICompatibleAdapter {
  constructor(apiKey: string, defaultModel: string = 'Baichuan2-Turbo') {
    super('baichuan', '百川智能', 'https://api.baichuan-ai.com/v1', apiKey, defaultModel);
  }
}
