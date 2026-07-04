import { BaseOpenAICompatibleAdapter } from '../adapter';

export class SparkAdapter extends BaseOpenAICompatibleAdapter {
  constructor(apiKey: string, defaultModel: string = 'spark-lite') {
    super(
      'spark',
      '科大讯飞星火',
      'https://spark-api-open.xf-yun.com/v1',
      apiKey,
      defaultModel
    );
  }
}
