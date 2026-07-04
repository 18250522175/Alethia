import { BaseOpenAICompatibleAdapter } from '../adapter';

export class MiniMaxAdapter extends BaseOpenAICompatibleAdapter {
  constructor(apiKey: string, defaultModel: string = 'abab6.5-chat') {
    super(
      'minimax',
      'MiniMax',
      'https://api.minimax.chat/v1',
      apiKey,
      defaultModel
    );
  }
}
